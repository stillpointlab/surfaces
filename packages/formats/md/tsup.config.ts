import { splitPackage } from '../../../tooling/tsup';

// Six entry points:
//  - index: the editor's type, the plugin types and the logging hooks (defines nothing)
//  - editor: the <md-editor> element and its plugin registry (ProseMirror on first connect)
//  - document: the schema, the markdown parser and the serializer (ProseMirror, markdown-it)
//  - markdown: isomorphic markdown rendering (Node + browser)
//  - preview: the read-only <md-preview> element (markdown only, no ProseMirror)
//  - format: the format descriptor (defines nothing; loads `preview` or `editor`)
// prosemirror-* and markdown-it are dependencies (external), resolved by the consumer.
//
// Splitting is on so the descriptor's `import('./preview/index')` stays a dynamic
// import of `preview.js`, the same file as the `./preview` entry, rather than a
// copy inlined into `format.js`; the entries share one copy of what they have in
// common. Split files go to dist/chunks/, which package.json lists in
// `sideEffects`: an element's `defineElement` can land in a chunk, and a bundler
// drops a chunk it believes has none.
export default splitPackage({
  entry: {
    index: 'src/index.ts',
    editor: 'src/editor/index.ts',
    document: 'src/document.ts',
    markdown: 'src/markdown/index.ts',
    preview: 'src/preview/index.ts',
    format: 'src/format.ts',
  },
});
