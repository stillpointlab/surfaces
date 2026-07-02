import {
  MarkdownParser,
  MarkdownSerializer,
  MarkdownSerializerState,
  ParseSpec,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from 'prosemirror-markdown';
import { Fragment, Mark, Node, Schema, Slice } from 'prosemirror-model';

import { createMarkdownIt } from '../markdown';

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

    ...pluginTokens,
  };
}

let cachedParser: { parse(text: string): Node; schema: Schema } | null = null;

/** Memoized markdown → ProseMirror parser (schema + plugin tokens). */
export function getMarkdownParser(): { parse(text: string): Node; schema: Schema } {
  if (cachedParser) return cachedParser;

  const schema = getSchema();
  const markdownIt = getEditorMarkdownIt();
  const baseParser = new MarkdownParser(schema, markdownIt, buildTokenSpecs());

  cachedParser = {
    parse(text: string): Node {
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

        return result;
      }

      return doc;
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

/** Memoized ProseMirror → markdown serializer (base + plugin serializers). */
export function getMarkdownSerializer(): { serialize(content: Node): string } {
  if (cachedSerializer) return cachedSerializer;

  const serializer = new MarkdownSerializer(buildSerializerNodes(), serializerMarks);
  cachedSerializer = {
    serialize: (content: Node) => serializer.serialize(content, { tightLists: true }),
  };

  return cachedSerializer;
}
