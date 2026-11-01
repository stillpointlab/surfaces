import { defineConfig, type Options } from 'tsup';

// Shared build for one format package: ESM-primary + CJS fallback + d.ts per
// entry, no splitting. Packages name their entries and externals, nothing else.
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
