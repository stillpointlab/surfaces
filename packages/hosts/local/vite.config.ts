import { defineConfig } from 'vite';

import { clientConfig } from './src/server/client-build.ts';

// The page: `vite build` writes static files to `dist/client`, which the
// `surfaces` command serves at `/`. Development mode (`npm run serve`) runs the
// same configuration as middleware in the server's own process.
export default defineConfig(clientConfig());
