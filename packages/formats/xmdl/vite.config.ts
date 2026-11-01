import { defineConfig } from 'vite';

export default defineConfig({
  root: 'dev',
  server: { port: 5183 },
  build: {
    outDir: '../dist-dev',
    emptyOutDir: true,
  },
});
