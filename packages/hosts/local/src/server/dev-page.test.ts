// Development mode: Vite as middleware in the host's own process. The page comes
// from its sources with the page's headers, and the host's request checks stand in
// front of everything Vite serves, its HMR socket included, the token among them.

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
let token: string;
/** The run's cookie, as the browser sends it once the printed address has set it. */
let cookie: string;

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
  const printed = new URL(result.url);
  base = printed.origin;
  port = Number(printed.port);
  token = printed.searchParams.get('token')!;
  cookie = `surfaces-${port}=${token}`;
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
    const page = await raw('/', { host: `127.0.0.1:${port}`, cookie });
    expect(page.status).toBe(200);
    expect(page.body).toContain('/@vite/client');
    expect(page.body).toContain('./main.ts');
    expect(page.headers['content-security-policy']).toBe(`${PAGE_POLICY}; frame-ancestors 'none'`);
  });

  it('answers the API beside it', async () => {
    const list = await raw('/api/list', { host: `localhost:${port}`, cookie });
    expect(JSON.parse(list.body)).toEqual({
      nodes: [{ path: 'a.md', type: 'blob' }],
      truncated: false,
    });
  });

  // The `port` is known once `beforeAll` has run, so the cases are built in the test.
  it.each([
    ['another Host', () => ({ host: `evil.example:${port}` })],
    ['another IP as the Host', () => ({ host: `127.0.0.2:${port}` })],
    ['another Origin', () => ({ host: `127.0.0.1:${port}`, origin: 'http://evil.example' })],
    [
      'a cross-site script',
      () => ({
        host: `127.0.0.1:${port}`,
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'no-cors',
      }),
    ],
  ])('refuses %s for what Vite serves, with the token', async (_name, headers) => {
    for (const path of ['/', '/main.ts', '/@vite/client']) {
      const refused = await raw(path, { ...headers(), cookie });
      expect(refused.status).toBe(403);
      expect(refused.body).not.toContain('import');
      expect(JSON.parse(refused.body)).toMatchObject({ code: 'HOST_FORBIDDEN' });
    }
  });

  it('refuses what Vite serves without the token, or with a wrong one', async () => {
    const carried: Record<string, string>[] = [{}, { cookie: `surfaces-${port}=wrong` }];
    for (const headers of carried) {
      for (const path of ['/', '/main.ts', '/@vite/client']) {
        const refused = await raw(path, { host: `127.0.0.1:${port}`, ...headers });
        expect(refused.status).toBe(403);
        expect(refused.body).toBe(
          'Open the address the `surfaces` command printed in its terminal.\n'
        );
      }
    }
    const api = await raw('/api/list', { host: `127.0.0.1:${port}` });
    expect(api.status).toBe(403);
    expect(JSON.parse(api.body)).toMatchObject({ code: 'HOST_TOKEN_REQUIRED' });
  });

  it('exchanges the printed address for the cookie, as the built page does', async () => {
    const exchange = await raw(`/?token=${token}`, { host: `127.0.0.1:${port}` });
    expect(exchange.status).toBe(303);
    expect(exchange.headers.location).toBe('/');
    expect(exchange.headers['set-cookie']).toEqual([
      `${cookie}; HttpOnly; SameSite=Strict; Path=/`,
    ]);
    const wrong = await raw('/?token=wrong', { host: `127.0.0.1:${port}` });
    expect(wrong.status).toBe(403);
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('lets the HMR socket open only for its own Host and Origin, with both tokens', async () => {
    const client = await raw('/@vite/client', { host: `127.0.0.1:${port}`, cookie });
    const viteToken = /wsToken = "([^"]+)"/.exec(client.body)?.[1];
    expect(viteToken).toBeTruthy();
    const own = { host: `127.0.0.1:${port}`, origin: base, cookie };
    const path = `/?token=${viteToken}`;
    expect(await upgrade(own, path)).toBe('upgraded');
    expect(await upgrade({ ...own, host: `evil.example:${port}` }, path)).toBe('closed');
    expect(await upgrade({ ...own, origin: 'http://evil.example' }, path)).toBe('closed');
    expect(await upgrade({ host: own.host, cookie }, path)).toBe('closed');
    expect(await upgrade(own, '/?token=wrong')).not.toBe('upgraded');
    // The run's token is asked of the socket too.
    expect(await upgrade({ host: own.host, origin: base }, path)).toBe('closed');
    expect(await upgrade({ ...own, cookie: `surfaces-${port}=wrong` }, path)).toBe('closed');
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
