import { defineConfig } from 'tsup';

// One entry point: the browser editor (registers <code-editor>) — ESM + CJS + d.ts.
// codemirror and @codemirror/* are dependencies (external), resolved by the consumer.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  splitting: false,
});
