import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

// The one playground for every surface. `npm run dev` at the root serves it;
// `npm run dev` inside a package serves it opened on that package (npm sets
// npm_package_name, from which the format, component, app or host name is read).
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const defaultFormat =
  /^@stillpointlab\/(.+)-(?:format|component|app|host)$/.exec(
    process.env.npm_package_name ?? ''
  )?.[1] ?? '';

export default defineConfig({
  root: here,
  // Not a single-page app: Vite's default ('spa') answers any path it has no file
  // for with index.html and a 200, so a fixture's missing file would arrive as this
  // page. 'mpa' still serves index.html for `/` (and `/?format=…`), and answers a
  // file that is not there with 404, as a host does.
  appType: 'mpa',
  server: { port: 5180, strictPort: true, fs: { allow: [repoRoot] } },
  define: { __HARNESS_DEFAULT_FORMAT__: JSON.stringify(defaultFormat) },
});
