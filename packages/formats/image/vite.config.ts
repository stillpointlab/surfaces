import { defineConfig } from 'vite';

export default defineConfig({
  root: 'dev',
  server: { port: 5184 },
  build: {
    outDir: '../dist-dev',
    emptyOutDir: true,
  },
});
