import { defineConfig } from 'vite';

// Dev server for the standalone editor playground (dev/index.html).
export default defineConfig({
  root: 'dev',
  server: { port: 5180 },
});
