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

import { getSchema } from './prosemirror-schema';
import { getEditorPlugins } from './registry';

import type MarkdownIt from 'markdown-it';

type Token = ReturnType<MarkdownIt['parse']>[number];

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

export interface MarkdownDocParser {
  parse(text: string, options?: ParseMarkdownOptions): Node;
  schema: Schema;
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
      let frontmatterNode: Node | null = null;
      if (options.frontmatter !== false) {
        const split = frontmatterNodeFor(text);
        if (split) {
          frontmatterNode = split.node;
          text = split.body;
        }
      }
      const attach = (doc: Node): Node =>
        frontmatterNode ? doc.copy(Fragment.from(frontmatterNode).append(doc.content)) : doc;

      // Token list from markdown-it (to detect tables).
      const tokens = markdownIt.parse(text, {});

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
        const codeNode = schema.text(content, [schema.marks.code.create()]);
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
          if (key === 'href') href = value;
          if (key === 'title') title = value;
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
      state.renderList(node, '  ', () => '- ');
    },

    ordered_list(state: MarkdownSerializerState, node: Node) {
      const start = node.attrs.start || 1;
      const maxWidth = String(start + node.childCount - 1).length;
      const space = state.repeat(' ', maxWidth + 2);
      state.renderList(node, space, (index: number) => {
        const value = String(start + index);
        return state.repeat(' ', maxWidth - value.length) + value + '. ';
      });
    },

    paragraph(state: MarkdownSerializerState, node: Node) {
      state.renderInline(node);
      state.closeBlock(node);
    },

    text(state: MarkdownSerializerState, node: Node) {
      state.text(node.text || '');
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

let cachedSerializer: { serialize(content: Node): string } | null = null;

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

/** Memoized ProseMirror → markdown serializer (base + plugin serializers). */
export function getMarkdownSerializer(): { serialize(content: Node): string } {
  if (cachedSerializer) return cachedSerializer;

  const serializer = new MarkdownSerializer(buildSerializerNodes(), serializerMarks);
  cachedSerializer = {
    serialize: (content: Node) => {
      // Serialize the frontmatter block ourselves (byte control the base
      // serializer's blank-line semantics can't offer), then the rest.
      const first = content.firstChild;
      if (first && first.type.name === 'frontmatter') {
        const bodyDoc = content.copy(content.content.cut(first.nodeSize));
        return frontmatterBlockString(first) + serializer.serialize(bodyDoc, { tightLists: true });
      }
      return serializer.serialize(content, { tightLists: true });
    },
  };

  return cachedSerializer;
}
