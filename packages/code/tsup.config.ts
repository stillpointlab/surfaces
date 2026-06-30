import { defineConfig } from 'tsup';

// Three entry points:
//  - index: the browser editor (registers <code-editor>) — ESM + CJS + d.ts
//  - preview: the read-only <code-preview> element (no basicSetup) — ESM + CJS + d.ts
//  - diff: the read-only side-by-side <code-diff> element (@codemirror/merge) — ESM + CJS + d.ts
// codemirror and @codemirror/* are dependencies (external), resolved by the consumer.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    preview: 'src/preview/index.ts',
    diff: 'src/diff/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  splitting: false,
});
