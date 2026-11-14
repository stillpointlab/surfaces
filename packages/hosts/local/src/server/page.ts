// The page: the built client (`dist/client`, from `vite build`) served at `/`.
//
// Serving files is the one thing here that reads a folder by a request's path, so
// it never builds a path from the request. It lists the folder's regular files
// (no links, no dot-files) into a table of URL paths, and a request is answered
// only when its path, exactly as sent, is a key in that table: `..`, an encoded
// slash or dot, a backslash or a link has nothing to match. The table is listed
// again when the page itself is asked for, so a rebuild is picked up on reload.
//
// The page's content security policy lets scripts come from the host's own
// origin alone. Styles may be inline as well: the formats' elements write their
// stylesheets into their shadow roots at run time (CodeMirror, ProseMirror and
// each element's generated styles), and no element can carry a nonce. The same
// policy is a `<meta>` in `src/client/index.html`, so the built files carry it
// wherever they are loaded from; a test holds the two equal.

import { constants, open, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

import type { FileHandle } from 'node:fs/promises';

/** The page's policy, as the `<meta>` in `src/client/index.html` states it. */
export const PAGE_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** The headers every page response carries; `frame-ancestors` only works as a header. */
export const PAGE_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': `${PAGE_POLICY}; frame-ancestors 'none'`,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

const TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** Answers a request for the page or one of its files; the host has checked it already. */
export type PageHandler = (request: Request, url: URL) => Promise<Response>;

/** The regular files under `dir`, by the URL path they are served at. */
async function listFiles(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  async function walk(folder: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || !/^[\w.-]+$/.test(entry.name)) continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path, `${prefix}${entry.name}/`);
      else if (entry.isFile()) files.set(`${prefix}${entry.name}`, path);
    }
  }
  await walk(dir, '/');
  return files;
}

function notBuilt(): Response {
  return new Response(
    'The page is not built. In the surfaces repository, run ' +
      '`npm run build --workspace @stillpointlab/local-host`, or `npm run serve` for development mode.\n',
    {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    }
  );
}

function notFound(pathname: string): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      code: 'HOST_NO_ROUTE',
      message: `Nothing is served at ${pathname}.`,
    }),
    {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    }
  );
}

/** The built page in `dir`, served at `/`. */
export function createStaticPage(dir: string): PageHandler {
  let files: Map<string, string> | null = null;
  return async (_request, url) => {
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    if (files === null || pathname === '/index.html') files = await listFiles(dir);
    const file = files.get(pathname);
    if (file === undefined) return files.has('/index.html') ? notFound(url.pathname) : notBuilt();

    let handle: FileHandle | undefined;
    try {
      // No link is followed, even one put there after the folder was listed.
      handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      const info = await handle.stat();
      if (!info.isFile()) throw new Error('not a file');
      const body = await handle.readFile();
      // Hashed file names never change content; the page itself is read fresh.
      const cache = pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-store';
      return new Response(body, {
        headers: {
          'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
          'cache-control': cache,
          ...PAGE_HEADERS,
        },
      });
    } catch {
      return notFound(url.pathname);
    } finally {
      await handle?.close();
    }
  };
}
