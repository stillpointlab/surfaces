import { defineConfig, type Options, type Plugin } from 'tsup';

// A format's worker is its `./worker` entry, built to `dist/worker.js` from
// `src/worker/worker.ts`, and the module that starts it sits beside it and names
// it relative to itself:
//
//   new Worker(new URL('./worker.js', import.meta.url), { type: 'module', name: '<format>-worker' })
//
// Every build between the source and the page finds it by that address. This
// build leaves it as it is, beside `dist/worker.js`; a host's Vite build follows
// it to the file and builds the worker as one of its own; and the local host,
// which maps a package to its source, finds `src/worker/worker.ts` beside the
// module that names it. See "Workers" in the root README.
const WORKER_ADDRESS = /new URL\(\s*["'`]\.\/worker\.js["'`]\s*,\s*import\.meta\.url/;

// A split file sits in `dist/chunks/`, where `./worker.js` names a file that does
// not exist, so the build fails rather than ship it: the module that starts the
// worker must be one entry's alone, imported statically.
const workerAddressInEntries: Plugin = {
  name: 'worker-address-in-entries',
  renderChunk(code, chunk) {
    if (/(^|[\\/])chunks[\\/]/.test(chunk.path) && WORKER_ADDRESS.test(code)) {
      throw new Error(
        `${chunk.path} names ./worker.js, which from dist/chunks/ is not the package's ` +
          'worker: start the worker in a module one entry imports, statically.'
      );
    }
  },
};

// Shared build for one package: ESM-primary + CJS fallback + d.ts per entry, no
// splitting. Packages name their entries and externals, nothing else. `shims`
// gives the CJS build an `import.meta.url` (a worker's address), which it would
// otherwise keep as it is and fail to parse.
export function formatPackage(options: Options) {
  return defineConfig({
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'es2022',
    splitting: false,
    shims: true,
    ...options,
    plugins: [workerAddressInEntries, ...(options.plugins ?? [])],
  });
}

// The same build, split: what two entries share is built once, into
// `dist/chunks/`, and each entry imports it. For a package where one entry loads
// another (a format's descriptor loads its `./preview` or `./editor`) or two
// entries register the same elements (an app's `./element` and `./shell`), so an
// element is defined once whichever entries a page loads.
//
// The package lists `./dist/chunks/*` in its `sideEffects`: an element's
// `defineElement` can land in a chunk, and a bundler drops a chunk it believes
// has none.
export function splitPackage(options: Options) {
  return formatPackage({
    ...options,
    splitting: true,
    esbuildOptions(esbuild, context) {
      esbuild.chunkNames = 'chunks/[name]-[hash]';
      options.esbuildOptions?.(esbuild, context);
    },
  });
}
