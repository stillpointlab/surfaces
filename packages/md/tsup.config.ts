import { defineConfig } from 'tsup';

// Three entry points:
//  - index: the browser editor (registers <md-editor>) — ESM + CJS + d.ts
//  - markdown: isomorphic markdown rendering (Node + browser) — ESM + CJS + d.ts
//  - preview: the read-only <md-preview> element (markdown only, no ProseMirror)
// prosemirror-* and markdown-it are dependencies (external), resolved by the consumer.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    markdown: 'src/markdown/index.ts',
    preview: 'src/preview/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  splitting: false,
});
