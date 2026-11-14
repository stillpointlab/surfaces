// Development mode: Vite as middleware in the host's own process. The page comes
// from its sources with the page's headers, and the host's request checks stand in
// front of everything Vite serves, its HMR socket included.

import { readdirSync, readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCli } from './cli';
import { PAGE_POLICY } from './page';
import { tempFolder, writeFiles } from './test-support';

import type { Serving } from './cli';

let folder: ReturnType<typeof tempFolder>;
let serving: Serving;
let base: string;
let port: number;

beforeAll(async () => {
  folder = tempFolder();
  writeFiles(folder.path, { 'site/a.md': '# A\n' });
  const err: string[] = [];
  const result = await runCli(
    ['site', '--port', '0'],
    { cwd: folder.path, out: () => undefined, err: (line) => err.push(line) },
    { dev: true }
  );
  if (typeof result === 'number') throw new Error(`exit ${result}: ${err.join('\n')}`);
  serving = result;
  base = result.url.slice(0, -1);
  port = Number(new URL(base).port);
}, 60_000);

afterAll(async () => {
  await serving?.close();
  folder?.cleanup();
});

/** A request with the headers the test chooses (`Host` included). */
function raw(
  path: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Ask for Vite's HMR socket: `upgraded` when it answered 101, else how it ended. */
function upgrade(headers: Record<string, string>, path = '/'): Promise<string> {
  return new Promise((resolve) => {
    const req = httpRequest({
      host: '127.0.0.1',
      port,
      path,
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-protocol': 'vite-hmr',
        ...headers,
      },
    });
    req.on('upgrade', (_res, socket) => {
      socket.destroy();
      resolve('upgraded');
    });
    req.on('response', (res) => resolve(`answered ${res.statusCode}`));
    req.on('error', () => resolve('closed'));
    req.end();
  });
}

describe('development mode', () => {
  it('serves the page from its source with the policy', async () => {
    const page = await raw('/', { host: `127.0.0.1:${port}` });
    expect(page.status).toBe(200);
    expect(page.body).toContain('/@vite/client');
    expect(page.body).toContain('./main.ts');
    expect(page.headers['content-security-policy']).toBe(`${PAGE_POLICY}; frame-ancestors 'none'`);
  });

  it('answers the API beside it', async () => {
    const list = await raw('/api/list', { host: `localhost:${port}` });
    expect(JSON.parse(list.body)).toEqual({
      nodes: [{ path: 'a.md', type: 'blob' }],
      truncated: false,
    });
  });

  it.each([
    ['another Host', { host: `evil.example:${port}` }],
    ['another IP as the Host', { host: `127.0.0.2:${port}` }],
    ['another Origin', { host: `127.0.0.1:${port}`, origin: 'http://evil.example' }],
    [
      'a cross-site script',
      { host: `127.0.0.1:${port}`, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' },
    ],
  ])('refuses %s for what Vite serves', async (_name, headers) => {
    for (const path of ['/', '/main.ts', '/@vite/client']) {
      const refused = await raw(path, headers);
      expect(refused.status).toBe(403);
      expect(refused.body).not.toContain('import');
    }
  });

  it('lets the HMR socket open only for its own Host and Origin, with Vite’s token', async () => {
    const client = await raw('/@vite/client', { host: `127.0.0.1:${port}` });
    const token = /wsToken = "([^"]+)"/.exec(client.body)?.[1];
    expect(token).toBeTruthy();
    const own = { host: `127.0.0.1:${port}`, origin: base };
    expect(await upgrade(own, `/?token=${token}`)).toBe('upgraded');
    expect(await upgrade({ ...own, host: `evil.example:${port}` }, `/?token=${token}`)).toBe(
      'closed'
    );
    expect(await upgrade({ ...own, origin: 'http://evil.example' }, `/?token=${token}`)).toBe(
      'closed'
    );
    expect(await upgrade({ host: own.host }, `/?token=${token}`)).toBe('closed');
    expect(await upgrade(own, '/?token=wrong')).not.toBe('upgraded');
  });

  it('is the only module that loads Vite, and only by a dynamic import', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const name of readdirSync(here)) {
      if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
      const source = readFileSync(join(here, name), 'utf8');
      // `import type` is erased; anything else would load Vite with the command.
      expect(source, name).not.toMatch(/^import (?!type )[^;]*from 'vite'/m);
      if (name !== 'dev-page.ts') expect(source, name).not.toContain("import('vite')");
    }
  });
});
