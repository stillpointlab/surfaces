import {
  MarkdownParser,
  MarkdownSerializer,
  MarkdownSerializerState,
  ParseSpec,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from 'prosemirror-markdown';
import { Fragment, Mark, Node, Schema, Slice } from 'prosemirror-model';

import { FRONTMATTER_BLOCK_PATTERN, createMarkdownIt, splitFrontmatterBlock } from '../markdown';

import { buildSource, writeKeepingSource, writeWhole } from './markdown-source';
import { getSchema } from './prosemirror-schema';
import { getEditorPlugins } from './registry';

import type { MarkdownSource, References } from './markdown-source';
import type { MarkdownIt, Token } from 'markdown-it';

export type { MarkdownSource } from './markdown-source';

// markdown-it configured for the editor, including any plugin (e.g. citation)
// inline rules contributed by registered plugins.
let cachedMarkdownIt: MarkdownIt | null = null;
function getEditorMarkdownIt(): MarkdownIt {
  if (!cachedMarkdownIt) {
    const plugins = getEditorPlugins()
      .map((p) => p.markdownItPlugin)
      .filter((p): p is (md: MarkdownIt) => void => Boolean(p));
    cachedMarkdownIt = createMarkdownIt({ plugins });
    // The parse wrapper splits the real frontmatter block off before this
    // instance ever runs (byte fidelity needs the raw text), so any `---`
    // block still in the text — pasted fragments, a stray second block —
    // must parse as plain markdown (hr/setext), not as frontmatter.
    cachedMarkdownIt.disable('front_matter');
  }
  return cachedMarkdownIt;
}

// markdown-it token → ProseMirror node parse specs (base + plugin-contributed).
function buildTokenSpecs(): Record<string, ParseSpec> {
  const pluginTokens: Record<string, ParseSpec> = Object.assign(
    {},
    ...getEditorPlugins().map((p) => p.parserTokens ?? {})
  );

  return {
    ...defaultMarkdownParser.tokens,

    // Override code_block to support language
    code_block: {
      block: 'code_block',
      getAttrs: (tok: Token) => {
        const info = tok.info || '';
        const language = info.split(/\s+/)[0];
        return { language };
      },
    },

    fence: {
      block: 'code_block',
      getAttrs: (tok: Token) => {
        const info = tok.info || '';
        const language = info.split(/\s+/)[0];
        return { language };
      },
    },

    // Add support for tables (base token names; prosemirror-markdown handles _open/_close)
    table: { block: 'table' },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { block: 'table_row' },
    th: { block: 'table_header' },
    td: { block: 'table_cell' },

    // Add support for strikethrough
    s: { mark: 'strike' },
    del: { mark: 'strike' },

    ordered_list: {
      block: 'ordered_list',
      getAttrs: (tok: Token) => ({ start: Number(tok.attrGet('start') ?? 1) }),
    },

    // Frontmatter is normally split off before markdown-it ever runs (see the
    // parse wrapper below); this spec is a safety net in case a front_matter
    // token reaches the base parser anyway (no `raw` attr → canonical output).
    front_matter: { block: 'frontmatter', noCloseToken: true },

    ...pluginTokens,
  };
}

export interface ParseMarkdownOptions {
  /**
   * When false, a leading `---` block is parsed with the normal markdown
   * rules instead of becoming a frontmatter node. Used for pasted fragments,
   * where the schema forbids frontmatter anywhere but document position 0.
   */
  frontmatter?: boolean;
}

// Blank lines between the frontmatter block and the body. Captured into the
// node's `raw` attr so they survive the round-trip (ProseMirror would drop
// them from the body).
const LEADING_BLANK_LINES = /^(?:[ \t]*\r?\n)+/;

/** A parsed document, and the text its body's blocks came from (see `markdown-source.ts`). */
export interface ParsedMarkdown {
  doc: Node;
  /** `null` when the text and the nodes do not line up; a save then writes the document whole. */
  source: MarkdownSource | null;
}

export interface MarkdownDocParser {
  parse(text: string, options?: ParseMarkdownOptions): Node;
  /** `parse`, with the source a later `serialize` keeps for the blocks that did not change. */
  parseWithSource(text: string, options?: ParseMarkdownOptions): ParsedMarkdown;
  schema: Schema;
}

/** The link reference definitions `text` holds, read as the editor reads them. */
function referencesOf(text: string): References {
  const env: { references?: References } = {};
  getEditorMarkdownIt().parse(text, env);
  return env.references ?? {};
}

/** The serializer's own state, which its types leave out: what is written so far, and how. */
type WriterState = MarkdownSerializerState & {
  out: string;
  delim: string;
  closed: Node | null;
  inTightList: boolean;
  flushClose(size?: number): void;
};

const isList = (node: Node): boolean =>
  node.type.name === 'bullet_list' || node.type.name === 'ordered_list';

/**
 * Whether a list item, written tight, has a blank line inside it: it holds a
 * block after its first that is not a list straight under its text (a code
 * block, a second paragraph, a quote, a table).
 */
function holdsBlankLine(item: Node): boolean {
  for (let i = 1; i < item.childCount; i += 1) {
    const child = item.child(i);
    if (child.isTextblock && child.content.size === 0) continue;
    if (!isList(child) || item.child(i - 1).type === child.type) return true;
  }
  return false;
}

/**
 * A list, written tight as the base serializer writes one, but for one thing:
 * an item that has a blank line inside it is followed by one. The blank line
 * inside already makes the list a loose one to a reader, so the line after it
 * changes nothing that is read; without it the next item sits against the end
 * of a code block, which is not how a formatter (Prettier) writes a list, and
 * a file an edit touched would fail a format check.
 */
function renderList(
  state: MarkdownSerializerState,
  node: Node,
  delim: string,
  firstDelim: (index: number) => string
): void {
  const list = state as WriterState;
  // As the base serializer opens a list.
  if (list.closed && list.closed.type === node.type) list.flushClose(3);
  else if (list.inTightList) list.flushClose(1);
  const outer = list.inTightList;
  list.inTightList = true;
  node.forEach((child, _offset, index) => {
    if (index > 0) list.flushClose(holdsBlankLine(node.child(index - 1)) ? 2 : 1);
    state.wrapBlock(delim, firstDelim(index), node, () => state.render(child, node, index));
  });
  list.inTightList = outer;
}

/**
 * A paragraph's text as written, with no line of spaces alone. A text node may
 * hold a line break (pasted text does), and the serializer starts each of its
 * lines with the block's indent: a break at the paragraph's end, or two in a
 * row, left a line holding the indent and nothing else. Such a line reads as a
 * blank one, so it is written as one (in a quote, as its `>`), and a break
 * with nothing after it in the paragraph is not written.
 */
function withNoBlankSpaces(written: string, delim: string): string {
  if (!written.includes('\n')) return written;
  const blank = delim.trimEnd();
  const lines = written.split('\n');
  // The first line goes on from what was written before: it is not one to judge.
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '' || lines[i].trimEnd() === blank) lines[i] = blank;
  }
  while (lines.length > 1 && lines[lines.length - 1] === blank) lines.pop();
  return lines.join('\n');
}

/** A document's top-level nodes after its frontmatter block, if it has one. */
function bodyNodes(doc: Node): Node[] {
  const nodes: Node[] = [];
  doc.forEach((node) => {
    if (node.type.name !== 'frontmatter') nodes.push(node);
  });
  return nodes;
}

let cachedParser: MarkdownDocParser | null = null;

/** Memoized markdown → ProseMirror parser (schema + plugin tokens). */
export function getMarkdownParser(): MarkdownDocParser {
  if (cachedParser) return cachedParser;

  const schema = getSchema();
  const markdownIt = getEditorMarkdownIt();
  const baseParser = new MarkdownParser(schema, markdownIt, buildTokenSpecs());

  // Split a leading frontmatter block off `text` BEFORE markdown-it sees it:
  // markdown-it normalizes line endings, so byte fidelity (CRLF, EOF without
  // newline) is only achievable by capturing the original bytes here.
  const frontmatterNodeFor = (text: string): { node: Node; body: string } | null => {
    const { raw, body } = splitFrontmatterBlock(text);
    if (!raw) return null;
    const blanks = LEADING_BLANK_LINES.exec(body)?.[0] ?? '';
    const inner = FRONTMATTER_BLOCK_PATTERN.exec(raw)?.[1] ?? '';
    const innerLF = inner.replace(/\r\n/g, '\n');
    const node = schema.nodes.frontmatter.create(
      { raw: raw + blanks },
      innerLF ? schema.text(innerLF) : null
    );
    return { node, body: body.slice(blanks.length) };
  };

  cachedParser = {
    parse(text: string, options: ParseMarkdownOptions = {}): Node {
      return this.parseWithSource(text, options).doc;
    },
    parseWithSource(text: string, options: ParseMarkdownOptions = {}): ParsedMarkdown {
      let frontmatterNode: Node | null = null;
      if (options.frontmatter !== false) {
        const split = frontmatterNodeFor(text);
        if (split) {
          frontmatterNode = split.node;
          text = split.body;
        }
      }
      // Token list from markdown-it (to detect tables, and to find each block's
      // lines), and the link definitions it found.
      const env: { references?: References } = {};
      const tokens = markdownIt.parse(text, env);

      // The source is the body's: the frontmatter block keeps its own bytes (`raw`).
      const attach = (doc: Node): ParsedMarkdown => ({
        doc: frontmatterNode ? doc.copy(Fragment.from(frontmatterNode).append(doc.content)) : doc,
        source: buildSource(text, tokens, bodyNodes(doc), env.references, referencesOf),
      });

      const doc = baseParser.parse(text);

      const hasTable = tokens.some((t) => t.type === 'table_open');

      // Workaround for the mismatch between markdown-it's table tokens and
      // prosemirror-markdown's expectations: rebuild tables from tokens.
      if (hasTable) {
        const fixedTables = extractAllTables(tokens);

        const tables: { pos: number; node: Node }[] = [];
        doc.descendants((node, pos) => {
          if (node.type.name === 'table') {
            tables.push({ pos, node });
          }
        });

        let result = doc;
        for (let i = tables.length - 1; i >= 0; i--) {
          const { pos, node } = tables[i];
          const fixedTable = fixedTables[i];

          if (fixedTable) {
            const slice = new Slice(Fragment.from(fixedTable), 0, 0);
            result = result.replace(pos, pos + node.nodeSize, slice);
          }
        }

        return attach(result);
      }

      return attach(doc);
    },
    schema,
  };

  return cachedParser;
}

// Extract and build all tables from tokens in a single pass
function extractAllTables(tokens: Token[]): (Node | null)[] {
  const tables: (Node | null)[] = [];
  let currentTableTokens: Token[] = [];
  let inTable = false;

  for (const token of tokens) {
    if (token.type === 'table_open') {
      inTable = true;
      currentTableTokens = [token];
    } else if (inTable) {
      currentTableTokens.push(token);

      if (token.type === 'table_close') {
        const tableNode = buildTableFromTokens(currentTableTokens);
        tables.push(tableNode);

        currentTableTokens = [];
        inTable = false;
      }
    }
  }

  return tables;
}

// Parse inline tokens to preserve markdown formatting
function parseInlineTokens(tokens: Token[]): Node | Node[] {
  const schema = getSchema();
  const nodes: Node[] = [];
  const markStack: Mark[] = [];

  for (const token of tokens) {
    if (token.type === 'text') {
      if (token.content) {
        const text = schema.text(token.content, markStack.length > 0 ? markStack : undefined);
        nodes.push(text);
      }
    } else if (token.type === 'code_inline') {
      if (token.content) {
        const content = token.content.replace(/\\\|/g, '|');
        // With the marks around it: a link whose text is code keeps its link.
        const codeNode = schema.text(content, [...markStack, schema.marks.code.create()]);
        nodes.push(codeNode);
      }
    } else if (token.type === 'strong_open') {
      markStack.push(schema.marks.strong.create());
    } else if (token.type === 'strong_close') {
      markStack.pop();
    } else if (token.type === 'em_open') {
      markStack.push(schema.marks.em.create());
    } else if (token.type === 'em_close') {
      markStack.pop();
    } else if (token.type === 's_open') {
      markStack.push(schema.marks.strike.create());
    } else if (token.type === 's_close') {
      markStack.pop();
    } else if (token.type === 'link_open') {
      let href = '';
      let title: string | undefined;

      if (token.attrs) {
        for (const [key, value] of token.attrs) {
          if (key === 'href') href = String(value);
          if (key === 'title') title = String(value);
        }
      }

      markStack.push(schema.marks.link.create({ href, title }));
    } else if (token.type === 'link_close') {
      markStack.pop();
    }
  }

  if (nodes.length === 0) return [];
  return nodes.length === 1 ? nodes[0] : nodes;
}

// Build a table node from markdown-it tokens
function buildTableFromTokens(tokens: Token[]): Node | null {
  const schema = getSchema();
  const rows: Node[] = [];
  let currentRow: Node[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === 'tr_open') {
      currentRow = [];
    } else if (token.type === 'tr_close' && currentRow.length > 0) {
      const rowNode = schema.nodes.table_row.create(null, currentRow);
      rows.push(rowNode);
      currentRow = [];
    } else if (token.type === 'th_open' || token.type === 'td_open') {
      const nextToken = tokens[i + 1];
      const cellType = token.type === 'th_open' ? 'table_header' : 'table_cell';

      if (nextToken && nextToken.type === 'inline') {
        let paragraph;

        if (nextToken.children && nextToken.children.length > 0) {
          const inlineContent = parseInlineTokens(nextToken.children);
          paragraph = schema.nodes.paragraph.create(null, inlineContent);
        } else if (nextToken.content) {
          paragraph = schema.nodes.paragraph.create(null, schema.text(nextToken.content));
        } else {
          paragraph = schema.nodes.paragraph.create();
        }

        const cell = schema.nodes[cellType].create(null, paragraph);

        currentRow.push(cell);
        i++; // Skip the inline token we just processed
      } else {
        const paragraph = schema.nodes.paragraph.create();
        const cell = schema.nodes[cellType].create(null, paragraph);
        currentRow.push(cell);
      }
    }
  }

  if (rows.length > 0) {
    return schema.nodes.table.create(null, rows);
  }

  return null;
}

// ProseMirror node → markdown serializer specs (base + plugin-contributed).
function codeBlockFenceFor(text: string): string {
  const longestBacktickRun = Math.max(
    0,
    ...Array.from(text.matchAll(/`+/g), (match) => match[0].length)
  );
  return '`'.repeat(Math.max(3, longestBacktickRun + 1));
}

function buildSerializerNodes(): Record<
  string,
  (state: MarkdownSerializerState, node: Node) => void
> {
  const pluginSerializers = Object.assign(
    {},
    ...getEditorPlugins().map((p) => p.serializerNodes ?? {})
  );

  return {
    ...defaultMarkdownSerializer.nodes,

    // Safety net only: the serialize wrapper below peels the frontmatter node
    // off the document before the base serializer runs, emitting the original
    // bytes when the block is untouched. This canonical form is used if a
    // frontmatter node ever reaches the base serializer some other way.
    frontmatter(state: MarkdownSerializerState, node: Node) {
      state.write('---\n');
      if (node.textContent) {
        state.text(node.textContent, false);
        state.write('\n');
      }
      state.write('---');
      state.closeBlock(node);
    },

    code_block(state: MarkdownSerializerState, node: Node) {
      const language = node.attrs.language || '';
      const text = node.textContent;
      const fence = codeBlockFenceFor(text);
      state.write(fence + language + '\n');
      state.text(text, false);
      state.write('\n');
      state.write(fence);
      state.closeBlock(node);
    },

    table(state: MarkdownSerializerState, node: Node) {
      let hasHeaderRow = false;
      const firstRow = node.firstChild;
      if (firstRow && firstRow.firstChild?.type.name === 'table_header') {
        hasHeaderRow = true;
      }

      node.forEach((row: Node, _: number, i: number) => {
        row.forEach((cell: Node, _cellOffset: number, j: number) => {
          state.write(j === 0 ? '| ' : ' | ');

          // Pipe characters inside a GFM table cell must be backslash-escaped
          // (`\|`). Apply the serializer's normal escaping FIRST, then add the
          // pipe backslash and write raw — otherwise `state.text` would re-escape
          // our backslash into the invalid `\\|`.
          const originalText = state.text;

          state.text = (text: string, escape?: boolean) => {
            const escaped = escape === false ? text : state.esc(text);
            originalText.call(state, escaped.replace(/\|/g, '\\|'), false);
          };

          cell.forEach((child: Node) => {
            if (child.type.name === 'paragraph') {
              state.renderInline(child);
            } else if (child.isText) {
              state.text(child.text || '');
            } else {
              state.renderInline(child);
            }
          });

          state.text = originalText;
        });
        state.write(' |\n');

        if (i === 0 && hasHeaderRow) {
          row.forEach(() => state.write('| --- '));
          state.write('|\n');
        }
      });

      state.closeBlock(node);
    },

    table_row: () => {
      // Handled by table
    },

    table_cell: () => {
      // Handled by table
    },

    table_header: () => {
      // Handled by table
    },

    bullet_list(state: MarkdownSerializerState, node: Node) {
      renderList(state, node, '  ', () => '- ');
    },

    ordered_list(state: MarkdownSerializerState, node: Node) {
      const start = node.attrs.start || 1;
      const maxWidth = String(start + node.childCount - 1).length;
      const space = state.repeat(' ', maxWidth + 2);
      renderList(state, node, space, (index: number) => {
        const value = String(start + index);
        return state.repeat(' ', maxWidth - value.length) + value + '. ';
      });
    },

    paragraph(state: MarkdownSerializerState, node: Node) {
      const writer = state as WriterState;
      const from = writer.out.length;
      state.renderInline(node);
      writer.out =
        writer.out.slice(0, from) + withNoBlankSpaces(writer.out.slice(from), writer.delim);
      state.closeBlock(node);
    },

    text(state: MarkdownSerializerState, node: Node) {
      // Inside an autolink (`<https://…>`) a backslash is itself, so the text
      // goes as it is: an escaped `~` or `_` there would change the address.
      if ((state as unknown as { inAutolink?: boolean }).inAutolink) {
        state.text(node.text || '', false);
        return;
      }
      const esc = state.esc;
      state.esc = (text: string, startOfLine?: boolean) => {
        const escaped = escapeReferences(esc.call(state, text, startOfLine));
        // The second writing (see `writeBrackets`): this node's brackets lose the
        // backslash the first gave them, but for a pair a link could start at.
        return bracketsAsTyped ? unescapeBrackets(escaped) : escaped;
      };
      try {
        state.text(node.text || '');
      } finally {
        state.esc = esc;
      }
    },

    ...pluginSerializers,
  };
}

const serializerMarks = {
  ...defaultMarkdownSerializer.marks,

  strike: {
    open: '~~',
    close: '~~',
    mixable: true,
    expelEnclosingWhitespace: true,
  },
};

/**
 * Set while a document is written a second time with its brackets as typed. The
 * serializer's state is made inside `serialize`, so the text node's writer reads
 * this to know which writing it is in.
 */
let bracketsAsTyped = false;

const ESCAPED_BRACKET = /\\[[\]]/;

/** An `&` that starts a character reference: `&lt;`, `&#35;`, `&#x23;`. */
const REFERENCE_START = /&(?=(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});)/g;

/** A `<` that starts an autolink: `<scheme:…>` or `<name@host>`. */
const AUTOLINK_START = /<(?=[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*>|[^\s<>@]+@[^\s<>]+>)/g;

/**
 * `escaped` with a backslash before what would read back as something else: an
 * `&` that starts a character reference (text that says `&lt;` would come back
 * as `<`), and a `<` that starts an autolink (text that says `<me@example.com>`
 * would come back as a link). The serializer escapes neither.
 */
export function escapeReferences(escaped: string): string {
  return escaped.replace(REFERENCE_START, '\\&').replace(AUTOLINK_START, '\\<');
}

/**
 * `escaped` (text the serializer has escaped) with the backslash taken off its
 * square brackets, except a pair that `(`, `[` or `:` follows: written bare,
 * that one would read back as a link, a reference or a definition. A bracket
 * with no partner in this text loses its backslash too; `writeBrackets` reads
 * the result again and so catches what one text node cannot see.
 */
export function unescapeBrackets(escaped: string): string {
  if (!ESCAPED_BRACKET.test(escaped)) return escaped;
  // One token a character, an escape (`\[`) being one token.
  const tokens = escaped.match(/\\[\s\S]|[\s\S]/g) ?? [];
  const keep = new Set<number>();
  const open: number[] = [];
  tokens.forEach((token, at) => {
    if (token === '\\[') open.push(at);
    if (token !== '\\]') return;
    const start = open.pop();
    const next = tokens[at + 1];
    if (start === undefined || (next !== '(' && next !== '\\[' && next !== ':')) return;
    keep.add(start);
    keep.add(at);
  });
  return tokens
    .map((token, at) => ((token === '\\[' || token === '\\]') && !keep.has(at) ? token[1] : token))
    .join('');
}

/**
 * A writer that escapes a square bracket only where it has to. The serializer
 * puts a backslash before every one, so a task list's `[x]` and a `[word]` in
 * prose came back as `\[x\]` and `\[word\]`: the same once rendered, but not
 * the text that was there, and not a checkbox to a renderer that draws them.
 *
 * It writes the document the serializer's way, and, when that escaped a
 * bracket, again with the brackets as typed. The second is used only when it
 * reads back as the first does, with the document's link definitions present:
 * a `[name]` that a definition would turn into a link keeps its backslashes.
 */
export function writeBrackets(
  write: (doc: Node) => string,
  read: (text: string) => Node
): (doc: Node, definitions?: string) => string {
  return (doc, definitions = '') => {
    const escaped = write(doc);
    if (!ESCAPED_BRACKET.test(escaped)) return escaped;
    let typed: string;
    bracketsAsTyped = true;
    try {
      typed = write(doc);
    } finally {
      bracketsAsTyped = false;
    }
    if (typed === escaped) return escaped;
    const tail = definitions ? `\n\n${definitions}` : '';
    return read(typed + tail).eq(read(escaped + tail)) ? typed : escaped;
  };
}

export interface MarkdownDocSerializer {
  /**
   * The document as Markdown. With the `source` it was parsed with, a block that
   * has not changed is written as the text it came from, and the text keeps its
   * line breaks and its final newline; without one, the whole document is
   * written the serializer's way.
   */
  serialize(content: Node, source?: MarkdownSource | null): string;
}

let cachedSerializer: MarkdownDocSerializer | null = null;

/**
 * Markdown for a frontmatter node. An untouched block re-emits its original
 * bytes (`raw` attr) verbatim — CRLF, empty block, missing EOF newline, and
 * trailing blank lines all survive byte-identically. Once the text has been
 * edited (or there are no original bytes) the canonical LF form is used.
 */
function frontmatterBlockString(node: Node): string {
  const raw = typeof node.attrs.raw === 'string' ? node.attrs.raw : '';
  const text = node.textContent;
  const match = raw ? FRONTMATTER_BLOCK_PATTERN.exec(raw) : null;
  if (match && (match[1] ?? '').replace(/\r\n/g, '\n') === text) return raw;
  // Edited (or no original bytes): canonical LF form, keeping whatever blank
  // lines originally separated the block from the body.
  const trailing = match ? raw.slice(match[0].length) : '';
  return (text ? `---\n${text}\n---\n` : '---\n---\n') + trailing;
}

/**
 * A body with no frontmatter block, written so that it reads back with none. A
 * `---` rule at its top, with a later `---` line (a rule, a setext underline),
 * would load as a frontmatter block and hide all between; that first rule is
 * written `***`, the same rule, which no frontmatter block starts with. A body
 * that would not be misread keeps its text.
 */
function withNoFrontmatter(body: string): string {
  return FRONTMATTER_BLOCK_PATTERN.test(body) ? `***${body.slice('---'.length)}` : body;
}

/** Memoized ProseMirror → markdown serializer (base + plugin serializers). */
export function getMarkdownSerializer(): MarkdownDocSerializer {
  if (cachedSerializer) return cachedSerializer;

  const serializer = new MarkdownSerializer(buildSerializerNodes(), serializerMarks);
  const whole = writeBrackets(
    (doc) => serializer.serialize(doc, { tightLists: true }),
    (text) => getMarkdownParser().parse(text, { frontmatter: false })
  );
  cachedSerializer = {
    serialize: (content: Node, source?: MarkdownSource | null) => {
      // Serialize the frontmatter block ourselves (byte control the base
      // serializer's blank-line semantics can't offer), then the rest.
      const first = content.firstChild;
      const frontmatter = first && first.type.name === 'frontmatter' ? first : null;
      const head = frontmatter ? frontmatterBlockString(frontmatter) : '';
      const body = frontmatter ? content.copy(content.content.cut(frontmatter.nodeSize)) : content;
      const withHead = (text: string): string =>
        frontmatter ? head + text : withNoFrontmatter(text);
      if (!source) return withHead(whole(body));

      const kept = writeKeepingSource(bodyNodes(body), source, {
        write: (nodes) => whole(body.copy(Fragment.from(nodes)), source.definitions),
        read: (text) => bodyNodes(getMarkdownParser().parse(text, { frontmatter: false })),
        references: referencesOf,
      });
      return withHead(kept ?? writeWhole(whole(body), source));
    },
  };

  return cachedSerializer;
}
