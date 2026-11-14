import { formatPackage } from '../../../tooling/tsup';

// Five entry points:
//  - index: the browser editor (registers <code-editor>)
//  - editor: the same, the explicit `./editor` alias
//  - preview: the read-only <code-preview> element (no basicSetup)
//  - diff: the read-only side-by-side <code-diff> element (@codemirror/merge)
//  - format: the format descriptor and `languageFromPath` (defines nothing; loads
//    `preview` or `editor`)
// codemirror and @codemirror/* are dependencies (external), resolved by the consumer.
//
// Splitting is on so the descriptor's `import('./preview/index')` stays a dynamic
// import of `preview.js`, the same file as the `./preview` entry, rather than a
// copy inlined into `format.js`; the entries share one copy of what they have in
// common. Split files go to dist/chunks/, which package.json lists in
// `sideEffects`: an element's `defineElement` can land in a chunk, and a bundler
// drops a chunk it believes has none.
export default formatPackage({
  splitting: true,
  esbuildOptions(options) {
    options.chunkNames = 'chunks/[name]-[hash]';
  },
  entry: {
    index: 'src/index.ts',
    editor: 'src/editor/index.ts',
    preview: 'src/preview/index.ts',
    diff: 'src/diff/index.ts',
    format: 'src/format.ts',
  },
  external: ['codemirror', /^@codemirror\//, /^@replit\//],
});
