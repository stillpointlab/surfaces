import { defineConfig } from 'vite';

// Dev server for the standalone playground (dev/index.html). The port is this
// format's row in the root README table.
export default defineConfig({
  root: 'dev',
  server: { port: 5199 },
  build: { outDir: '../dist-dev', emptyOutDir: true },
});
