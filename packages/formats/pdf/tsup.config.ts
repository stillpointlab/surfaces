import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { splitPackage } from '../../../tooling/tsup';

import type { Options, Plugin } from 'tsup';

// Four entry points: the element's type and the logging hooks (`.`), the
// read-only <pdf-preview> (`./preview`), the format descriptor (`./format`),
// which defines nothing and loads `preview`, and pdf.js's worker (`./worker`,
// see "Workers" in the root README).
//
// Splitting is on so the descriptor's `import('./preview/index')` stays a dynamic
// import of `preview.js`, the same file as the `./preview` entry, rather than a
// copy inlined into `format.js`; the entries share one copy of what they have in
// common. Split files go to dist/chunks/, which package.json lists in
// `sideEffects`: an element's `defineElement` can land in a chunk, and a bundler
// drops a chunk it believes has none.
//
// pdf.js is not built into these files. Its main module is a dependency, which
// the build leaves to the host's bundler, as every dependency here. Its worker
// is the copy tooling/gen-pdfjs.ts writes into src/worker/pdfjs/, and the build
// leaves that too: `dist/worker.js` keeps its import of `./pdfjs/pdf.worker.mjs`,
// and the copy is put there as it was generated, for the host's bundler.

/** The folders of files pdf.js's modules name by address, and where they go in the build. */
const COPIED: Readonly<Record<string, string>> = {
  'src/preview/pdfjs': 'pdfjs',
  'src/worker/pdfjs': 'pdfjs',
};

/** The copy of pdf.js's worker stays a file of its own, imported by `dist/worker.js`. */
export const hookedWorkerOutside: NonNullable<Options['esbuildPlugins']>[number] = {
  name: 'hooked-worker-outside',
  setup(build) {
    build.onResolve({ filter: /^\.\/pdfjs\/pdf\.worker\.mjs$/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

/**
 * Copies the generated folders into the build at the places its modules name
 * them: `./pdfjs/…` relative to `dist/preview.js` and `dist/worker.js`. So a host
 * that builds from the package's `dist/` (Context Manager) emits each file.
 * A split file in `dist/chunks/` that names `./pdfjs/` would name a folder that
 * does not exist, so the build fails rather than ship it.
 */
export const copiedFiles: Plugin = {
  name: 'pdfjs-files',
  renderChunk(code, chunk) {
    if (/(^|[\\/])chunks[\\/]/.test(chunk.path) && /new URL\(\s*[`'"]\.\/pdfjs\//.test(code)) {
      throw new Error(
        `${chunk.path} names ./pdfjs/, which from dist/chunks/ is not where the files are: ` +
          'name them in a module one entry imports, statically.'
      );
    }
  },
  buildEnd() {
    for (const [from, to] of Object.entries(COPIED)) {
      if (!existsSync(from)) {
        throw new Error(`${from} is not there: gen:styles generates it (tooling/gen-pdfjs.ts).`);
      }
      cpSync(from, join(this.options.outDir, to), { recursive: true });
    }
  },
};

export default splitPackage({
  entry: {
    index: 'src/index.ts',
    preview: 'src/preview/index.ts',
    format: 'src/format.ts',
    worker: 'src/worker/worker.ts',
  },
  esbuildPlugins: [hookedWorkerOutside],
  plugins: [copiedFiles],
});
