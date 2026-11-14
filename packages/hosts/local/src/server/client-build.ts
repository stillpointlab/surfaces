// How the page is built and served in development: one Vite configuration, read
// by `vite build` (through `vite.config.ts`) and by development mode
// (`dev-page.ts`, which imports Vite itself only when it runs). Nothing here
// imports Vite, so the server's own build never carries it.
//
// The page resolves every workspace package (`@stillpointlab/<name>` and its
// entries) to its source, in the build as in development, so a change to a
// format reloads the page, the client never depends on a stale `dist`, and each
// module exists once: a format's `load()` is a relative import of its own
// `src/preview/index.ts`, and the page's `@stillpointlab/md-format/preview` must
// be that same file, or `<md-preview>` and its renderer would exist twice.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { UserConfig } from 'vite';

// The same depth from `src/server/*.ts` and from `dist/server/*.js`.
const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));

/** Where the built page is written, and where the `surfaces` command serves it from. */
export const CLIENT_DIST = join(packageRoot, 'dist', 'client');
/** The page's source folder: Vite's root. */
export const CLIENT_ROOT = join(packageRoot, 'src', 'client');

export interface SourceAlias {
  find: RegExp;
  replacement: string;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** Every workspace package's folder: `packages/common` and `packages/<group>/<name>`. */
function packageDirs(): string[] {
  const packages = join(repoRoot, 'packages');
  const dirs = [join(packages, 'common')];
  for (const group of readdirSync(packages, { withFileTypes: true })) {
    if (!group.isDirectory() || group.name === 'common') continue;
    for (const entry of readdirSync(join(packages, group.name), { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(join(packages, group.name, entry.name));
    }
  }
  return dirs.filter((dir) => existsSync(join(dir, 'package.json')));
}

/**
 * An exact alias from each workspace entry to its source. An entry's built file
 * `dist/<name>.js` comes from `src/<name>.ts` or `src/<name>/index.ts` (the
 * convention every package's tsup config follows); an export with no such source
 * (the SCSS tokens, the local host's own server) keeps its ordinary resolution.
 */
export function workspaceAliases(): SourceAlias[] {
  const aliases: SourceAlias[] = [];
  for (const dir of packageDirs()) {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      name?: string;
      exports?: Record<string, unknown>;
    };
    if (!manifest.name?.startsWith('@stillpointlab/') || !manifest.exports) continue;
    for (const [key, target] of Object.entries(manifest.exports)) {
      const built = (target as { import?: unknown } | null)?.import;
      if (typeof built !== 'string') continue;
      const name = /^\.\/dist\/(.+)\.js$/.exec(built)?.[1];
      if (!name) continue;
      const source = [join(dir, 'src', `${name}.ts`), join(dir, 'src', name, 'index.ts')].find(
        existsSync
      );
      if (!source) continue;
      const specifier = key === '.' ? manifest.name : `${manifest.name}/${key.slice(2)}`;
      aliases.push({ find: new RegExp(`^${escape(specifier)}$`), replacement: source });
    }
  }
  return aliases;
}

/** The page's Vite configuration, for `vite build` and for development mode. */
export function clientConfig(): UserConfig {
  return {
    root: CLIENT_ROOT,
    // Relative asset paths: the built `index.html` loads from wherever it is put.
    base: './',
    publicDir: false,
    cacheDir: join(packageRoot, 'node_modules', '.vite'),
    clearScreen: false,
    resolve: { alias: workspaceAliases() },
    build: {
      outDir: CLIENT_DIST,
      emptyOutDir: true,
      target: 'es2022',
      // Every asset is a file of its own: nothing the policy would have to allow inline.
      assetsInlineLimit: 0,
    },
    optimizeDeps: {
      // Crawl every format's elements at start, so opening the first file of a
      // kind does not find a new dependency and reload the page.
      entries: [
        'index.html',
        '../../../../formats/*/src/preview/index.ts',
        '../../../../formats/*/src/editor/index.ts',
      ],
    },
  };
}
