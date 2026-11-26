import { splitPackage } from '../../../tooling/tsup';

// Four entry points: the core (`.`), the read-only <sample-preview> (`./preview`),
// the interactive <sample-editor> (`./editor`), and the format descriptor
// (`./format`), which defines nothing and loads `preview` or `editor`.
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
    preview: 'src/preview/index.ts',
    editor: 'src/editor/index.ts',
    format: 'src/format.ts',
  },
});
