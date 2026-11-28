// The `./document` entry: markdown to a ProseMirror document and back. It
// defines no element. It loads ProseMirror and markdown-it, which is why it is
// an entry of its own: `./editor` loads these on the editor's first connect, and
// the root loads neither. Plugins registered through `./editor` are seen here
// too, since both entries share one registry.
export { createSchema, getSchema } from './editor/prosemirror-schema';
export { getMarkdownParser, getMarkdownSerializer } from './editor/prosemirror-markdown';
