import { defineConfig } from 'tsup';

// The server: the library (`index`) and the `surfaces` command (`bin`, which the
// checked-in `bin/surfaces.js` runs), for Node alone. `@stillpointlab/common-format`
// stays external, read from its own build. The page builds on its own (`src/client`).
export default defineConfig({
  entry: { index: 'src/server/index.ts', bin: 'src/server/bin.ts' },
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
