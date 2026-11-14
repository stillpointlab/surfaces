import { formatPackage } from '../../../tooling/tsup';

// `format` is the format descriptor: it defines nothing and loads `preview`.
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
    preview: 'src/preview/index.ts',
    format: 'src/format.ts',
  },
});
