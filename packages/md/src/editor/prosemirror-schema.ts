import { MarkSpec, NodeSpec, Schema } from 'prosemirror-model';

import { getEditorPlugins } from './registry';

// Base editor schema nodes. Host-specific inline nodes (e.g. citations) are added
// via plugins (see createSchema / getSchema).
const baseNodes: Record<string, NodeSpec> = {
  // Document root
  doc: {
    content: 'block+',
  },

  // Paragraph
  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM() {
      return ['p', 0];
    },
  },

  // Headings
  heading: {
    attrs: { level: { default: 1 } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [
      { tag: 'h1', attrs: { level: 1 } },
      { tag: 'h2', attrs: { level: 2 } },
      { tag: 'h3', attrs: { level: 3 } },
      { tag: 'h4', attrs: { level: 4 } },
      { tag: 'h5', attrs: { level: 5 } },
      { tag: 'h6', attrs: { level: 6 } },
    ],
    toDOM(node) {
      return ['h' + node.attrs.level, 0];
    },
  },

  // Code block with language support
  code_block: {
    attrs: {
      language: { default: '' },
    },
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (node: HTMLElement) => {
          const codeEl = node.querySelector('code');
          const className = codeEl?.className || '';
          const match = className.match(/language-(\S+)/);
          const language = match ? match[1] : '';
          return { language };
        },
      },
    ],
    toDOM(node) {
      const attrs: any = {};
      if (node.attrs.language) {
        attrs.class = 'language-' + node.attrs.language;
      }
      return ['pre', ['code', attrs, 0]];
    },
  },

  // Blockquote
  blockquote: {
    content: 'block+',
    group: 'block',
    parseDOM: [{ tag: 'blockquote' }],
    toDOM() {
      return ['blockquote', 0];
    },
  },

  // Horizontal rule
  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM() {
      return ['hr'];
    },
  },

  // Lists
  ordered_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { start: { default: 1 } },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (node: HTMLElement) => ({
          start: node.hasAttribute('start') ? +node.getAttribute('start')! : 1,
        }),
      },
    ],
    toDOM(node) {
      return node.attrs.start == 1 ? ['ol', 0] : ['ol', { start: node.attrs.start }, 0];
    },
  },

  bullet_list: {
    content: 'list_item+',
    group: 'block',
    parseDOM: [{ tag: 'ul' }],
    toDOM() {
      return ['ul', 0];
    },
  },

  list_item: {
    content: 'paragraph block*',
    defining: true,
    parseDOM: [{ tag: 'li' }],
    toDOM() {
      return ['li', 0];
    },
  },

  // Tables
  table: {
    content: 'table_row+',
    group: 'block',
    tableRole: 'table',
    isolating: true,
    parseDOM: [{ tag: 'table' }],
    toDOM() {
      return ['table', ['tbody', 0]];
    },
  },

  table_row: {
    content: '(table_cell | table_header)*',
    tableRole: 'row',
    parseDOM: [{ tag: 'tr' }],
    toDOM() {
      return ['tr', 0];
    },
  },

  table_cell: {
    content: 'block+',
    attrs: {
      colspan: { default: 1 },
      rowspan: { default: 1 },
    },
    tableRole: 'cell',
    isolating: true,
    parseDOM: [
      {
        tag: 'td',
        getAttrs: (node: HTMLElement) => ({
          colspan: +node.getAttribute('colspan')! || 1,
          rowspan: +node.getAttribute('rowspan')! || 1,
        }),
      },
    ],
    toDOM(node) {
      const attrs: any = {};
      if (node.attrs.colspan !== 1) attrs.colspan = node.attrs.colspan;
      if (node.attrs.rowspan !== 1) attrs.rowspan = node.attrs.rowspan;
      return ['td', attrs, 0];
    },
  },

  table_header: {
    content: 'block+',
    attrs: {
      colspan: { default: 1 },
      rowspan: { default: 1 },
    },
    tableRole: 'header_cell',
    isolating: true,
    parseDOM: [
      {
        tag: 'th',
        getAttrs: (node: HTMLElement) => ({
          colspan: +node.getAttribute('colspan')! || 1,
          rowspan: +node.getAttribute('rowspan')! || 1,
        }),
      },
    ],
    toDOM(node) {
      const attrs: any = {};
      if (node.attrs.colspan !== 1) attrs.colspan = node.attrs.colspan;
      if (node.attrs.rowspan !== 1) attrs.rowspan = node.attrs.rowspan;
      return ['th', attrs, 0];
    },
  },

  // Image
  image: {
    inline: true,
    attrs: {
      src: {},
      alt: { default: null },
      title: { default: null },
    },
    group: 'inline',
    draggable: true,
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs: (node: HTMLElement) => ({
          src: node.getAttribute('src'),
          title: node.getAttribute('title'),
          alt: node.getAttribute('alt'),
        }),
      },
    ],
    toDOM(node) {
      return ['img', node.attrs];
    },
  },

  // Hard break
  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM() {
      return ['br'];
    },
  },

  // Text
  text: {
    group: 'inline',
  },
};

const marks: Record<string, MarkSpec> = {
  // Strong/Bold
  strong: {
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b' },
      {
        style: 'font-weight',
        getAttrs: (value: string) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null,
      },
    ],
    toDOM() {
      return ['strong'];
    },
  },

  // Emphasis/Italic
  em: {
    parseDOM: [
      { tag: 'i' },
      { tag: 'em' },
      { style: 'font-style', getAttrs: (value: string) => value === 'italic' && null },
    ],
    toDOM() {
      return ['em'];
    },
  },

  // Strikethrough
  strike: {
    parseDOM: [
      { tag: 's' },
      { tag: 'del' },
      { tag: 'strike' },
      { style: 'text-decoration', getAttrs: (value: string) => value === 'line-through' && null },
    ],
    toDOM() {
      return ['s'];
    },
  },

  // Code
  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM() {
      return ['code'];
    },
  },

  // Link
  link: {
    attrs: {
      href: {},
      title: { default: null },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (node: HTMLElement) => ({
          href: node.getAttribute('href'),
          title: node.getAttribute('title'),
        }),
      },
    ],
    toDOM(node) {
      return ['a', node.attrs];
    },
  },
};

/** Build a schema, merging in extra nodes (e.g. from plugins). */
export function createSchema(extraNodes: Record<string, NodeSpec> = {}): Schema {
  return new Schema({ nodes: { ...baseNodes, ...extraNodes }, marks });
}

let cachedSchema: Schema | null = null;

/** Memoized schema including any nodes contributed by registered plugins. */
export function getSchema(): Schema {
  if (!cachedSchema) {
    const extraNodes: Record<string, NodeSpec> = Object.assign(
      {},
      ...getEditorPlugins().map((p) => p.schemaNodes ?? {})
    );
    cachedSchema = createSchema(extraNodes);
  }
  return cachedSchema;
}
