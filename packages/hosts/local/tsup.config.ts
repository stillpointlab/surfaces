import { defineConfig } from 'tsup';

// The server: the library (`index`), the `surfaces` command (`bin`, which the
// checked-in `bin/surfaces.js` runs) and development mode (`dev`, which
// `npm run serve` runs), for Node alone. `@stillpointlab/common-format` stays
// external, read from its own build. Vite stays external too, and only `dev`
// reaches it, by a dynamic import: the command never loads it. The page builds on
// its own (`vite build`, from `src/client` to `dist/client`).
export default defineConfig({
  entry: { index: 'src/server/index.ts', bin: 'src/server/bin.ts', dev: 'src/server/dev.ts' },
  external: ['vite'],
  outDir: 'dist/server',
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  dts: { entry: { index: 'src/server/index.ts' } },
  sourcemap: true,
  // Cleans `dist/server` only; the page's build owns `dist/client`.
  clean: true,
  splitting: true,
});
