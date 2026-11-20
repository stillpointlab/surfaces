import { defineConfig, type Options } from 'tsup';

// Shared build for one package: ESM-primary + CJS fallback + d.ts per entry, no
// splitting. Packages name their entries and externals, nothing else.
export function formatPackage(options: Options) {
  return defineConfig({
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'es2022',
    splitting: false,
    ...options,
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
