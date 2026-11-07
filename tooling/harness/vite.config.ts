import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

// The one playground for every surface. `npm run dev` at the root serves it;
// `npm run dev` inside a package serves it opened on that package (npm sets
// npm_package_name, from which the format, component or app name is read).
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const defaultFormat =
  /^@stillpointlab\/(.+)-(?:format|component|app)$/.exec(process.env.npm_package_name ?? '')?.[1] ??
  '';

export default defineConfig({
  root: here,
  server: { port: 5180, strictPort: true, fs: { allow: [repoRoot] } },
  define: { __HARNESS_DEFAULT_FORMAT__: JSON.stringify(defaultFormat) },
});
