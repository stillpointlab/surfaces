// The `surfaces` command, through `runCli` (what the bin calls) and a real
// listener on port 0: the adapter from `node:http`, end to end.

import { readFileSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCli } from './cli';
import { eventReader, gitEnv, makeRepository, tempFolder, writeFiles } from './test-support';

import type { Serving } from './cli';
import type { Server } from 'node:http';

let folder: ReturnType<typeof tempFolder>;
let out: string[];
let err: string[];
let serving: Serving | null;
let blocker: Server | null;

beforeEach(() => {
  folder = tempFolder();
  writeFiles(folder.path, {
    'site/a.md': 'a',
    'file.txt': 'not a folder',
    'client/index.html': '<!doctype html><title>the page</title>',
    'client/assets/index-abc.js': 'console.log(1)',
  });
  out = [];
  err = [];
  serving = null;
  blocker = null;
});
afterEach(async () => {
  await serving?.close();
  await new Promise<void>((done) => (blocker ? blocker.close(() => done()) : done()));
  folder.cleanup();
});

const io = (env?: NodeJS.ProcessEnv) => ({
  cwd: folder.path,
  out: (line: string) => out.push(line),
  err: (line: string) => err.push(line),
  env,
});

/**
 * Serve, and the page's address without the token (`url`, ending in `/`), the
 * token, and the header that carries it for a program (`auth`).
 */
async function serve(
  args: string[],
  env?: NodeJS.ProcessEnv
): Promise<{ url: string; token: string; auth: { authorization: string }; printed: string }> {
  const result = await runCli(args, io(env), { clientDir: join(folder.path, 'client') });
  if (typeof result === 'number') throw new Error(`exit ${result}: ${err.join('\n')}`);
  serving = result;
  const printed = new URL(result.url);
  const token = printed.searchParams.get('token') ?? '';
  return {
    url: `${printed.origin}/`,
    token,
    auth: { authorization: `Bearer ${token}` },
    printed: result.url,
  };
}

/** A raw request, so the test chooses the `Host` header. */
function raw(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      { method: options.method ?? 'GET', headers: options.headers },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    req.on('error', reject);
    req.end(options.body);
  });
}

describe('surfaces', () => {
  it('serves a folder relative to where it was typed, and prints the URL', async () => {
    const { url, auth, printed } = await serve(['site', '--port', '0']);
    expect(printed).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]{43}$/);
    expect(out).toEqual([`Serving ${join(folder.path, 'site')} at ${printed}`]);
    const list = await fetch(`${url}api/list`, { headers: auth });
    expect(await list.json()).toEqual({
      nodes: [{ path: 'a.md', type: 'blob' }],
      truncated: false,
    });
    const page = await fetch(url, { headers: auth });
    expect(page.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(await page.text()).toContain('<title>the page</title>');
  });

  it('defaults to the folder it was typed in', async () => {
    await serve(['--port=0']);
    expect(out[0]).toContain(`Serving ${folder.path} at`);
  });

  it('writes through PUT with the Origin, and refuses one without it', async () => {
    const { url, auth } = await serve(['site', '--port', '0']);
    const origin = url.slice(0, -1);
    const body = JSON.stringify({
      changes: [{ kind: 'write', path: 'a.md', content: 'over http' }],
    });
    const refused = await fetch(`${url}api/files`, { method: 'PUT', body, headers: auth });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: 'HOST_FORBIDDEN' });
    const written = await fetch(`${url}api/files`, {
      method: 'PUT',
      body,
      headers: { origin, ...auth },
    });
    expect(written.status).toBe(200);
    expect(readFileSync(join(folder.path, 'site/a.md'), 'utf8')).toBe('over http');
  });

  it('refuses a Host that is not its own, and an absolute URL in the request line', async () => {
    const { url, auth } = await serve(['site', '--port', '0']);
    const port = new URL(url).port;
    expect(
      (await raw(`${url}api/list`, { headers: { host: 'evil.example', ...auth } })).status
    ).toBe(403);
    expect(
      (
        await raw(`${url}api/list`, {
          headers: { host: `127.0.0.1:${Number(port) + 1}`, ...auth },
        })
      ).status
    ).toBe(403);
    expect(
      (await raw(`${url}api/list`, { headers: { host: `localhost:${port}`, ...auth } })).status
    ).toBe(200);
    const absolute = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { host: '127.0.0.1', port, path: 'http://evil.example/api/list', headers: auth },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }
      );
      req.on('error', reject);
      req.end();
    });
    expect(absolute).toBe(400);
  });

  it('reaches no file outside the folder by a raw address sent as written', async () => {
    const { url, auth } = await serve(['site', '--port', '0']);
    const port = new URL(url).port;
    // The request line exactly as given (curl's --path-as-is): the adapter's URL
    // parser resolves the dots, so the host never sees them.
    const asWritten = (path: string) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = httpRequest({ host: '127.0.0.1', port, path, headers: auth }, (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => (body += chunk));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        });
        req.on('error', reject);
        req.end();
      });
    for (const path of [
      '/api/raw/../../file.txt',
      '/api/raw/%2e%2e/%2E%2E/file.txt',
      '/api/raw/..%2F..%2Ffile.txt',
      '/api/raw/..\\..\\file.txt',
      '/api/raw/a.md/../../../file.txt',
    ]) {
      const { status, body } = await asWritten(path);
      expect({ path, refused: status >= 400 }).toEqual({ path, refused: true });
      expect(body).not.toContain('not a folder');
    }
    expect(await asWritten('/api/raw/a.md')).toEqual({ status: 200, body: 'a' });
  });

  it('answers a range of a raw file over HTTP, with its length and where it falls', async () => {
    const { url, auth } = await serve(['site', '--port', '0']);
    writeFileSync(join(folder.path, 'site', 'long.txt'), '0123456789');
    const response = await fetch(`${url}api/raw/long.txt`, {
      headers: { ...auth, range: 'bytes=2-5' },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(response.headers.get('content-length')).toBe('4');
    expect(await response.text()).toBe('2345');
  });

  it('streams events over HTTP', async () => {
    const { url, auth } = await serve(['site', '--port', '0']);
    const response = await fetch(`${url}api/events`, { headers: auth });
    const events = eventReader(response);
    await events.opened;
    writeFileSync(join(folder.path, 'site/a.md'), 'changed on disk');
    expect(await events.next()).toEqual({ type: 'changed', paths: ['a.md'] });
    await events.close();
  });

  it('opens the printed address: the cookie, then the address without the token', async () => {
    const { url, token, printed } = await serve(['site', '--port', '0']);
    const port = new URL(url).port;
    const exchange = await fetch(printed, { redirect: 'manual' });
    expect(exchange.status).toBe(303);
    expect(new URL(exchange.headers.get('location')!, url).href).toBe(url);
    const cookie = exchange.headers.get('set-cookie')!;
    expect(cookie).toBe(`surfaces-${port}=${token}; HttpOnly; SameSite=Strict; Path=/`);
    const sent = { cookie: cookie.split(';')[0] };
    expect(await (await fetch(url, { headers: sent })).text()).toContain('the page');
    expect((await fetch(`${url}api/list`, { headers: sent })).status).toBe(200);
    // A second tab: the address without the token, and the browser's cookie.
    expect((await fetch(`${url}assets/index-abc.js`, { headers: sent })).status).toBe(200);
  });

  it('refuses every route over HTTP without the token, and says only what to do', async () => {
    const { url } = await serve(['site', '--port', '0']);
    const origin = url.slice(0, -1);
    for (const [path, method] of [
      ['', 'GET'],
      ['assets/index-abc.js', 'GET'],
      ['api/list', 'GET'],
      ['api/file?path=a.md', 'GET'],
      ['api/raw/a.md', 'GET'],
      ['api/events', 'GET'],
      ['api/files', 'PUT'],
      ['api/commit', 'POST'],
    ]) {
      const response = await raw(`${url}${path}`, {
        method,
        headers: method === 'GET' ? {} : { origin },
        body: method === 'GET' ? undefined : '{}',
      });
      expect({ path, status: response.status }).toEqual({ path, status: 403 });
      expect(response.body).toContain('Open the address the `surfaces` command printed');
      expect(response.body).not.toContain(folder.path);
      if (path.startsWith('api/')) {
        expect(JSON.parse(response.body)).toMatchObject({ code: 'HOST_TOKEN_REQUIRED' });
      }
    }
    expect(readFileSync(join(folder.path, 'site/a.md'), 'utf8')).toBe('a');
  });

  it('makes a new token at each start: the last run’s is refused', async () => {
    const first = await serve(['site', '--port', '0']);
    const port = new URL(first.url).port;
    await serving!.close();
    const second = await serve(['site', '--port', port]);
    expect(second.token).not.toBe(first.token);
    const old = await fetch(`${second.url}api/root`, {
      headers: { cookie: `surfaces-${port}=${first.token}` },
    });
    expect(old.status).toBe(403);
    expect(await old.json()).toMatchObject({ code: 'HOST_TOKEN_REQUIRED' });
    expect((await fetch(`${second.url}api/root`, { headers: second.auth })).status).toBe(200);
  });

  it('refuses a path that is not a folder, and one that does not exist', async () => {
    expect(await runCli(['file.txt'], io())).toBe(1);
    expect(await runCli(['nowhere'], io())).toBe(1);
    expect(err).toEqual([
      `surfaces: ${join(folder.path, 'file.txt')} is not a folder.`,
      `surfaces: ${join(folder.path, 'nowhere')} does not exist.`,
    ]);
  });

  it('refuses a port in use, with a plain message', async () => {
    blocker = createServer();
    await new Promise<void>((done) => blocker!.listen(0, '127.0.0.1', () => done()));
    const address = blocker.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    expect(await runCli(['site', '--port', String(port)], io())).toBe(1);
    expect(err).toEqual([`surfaces: port ${port} is in use. Choose another with --port <n>.`]);
  });

  it('refuses a port that is not a number, and an unknown option', async () => {
    expect(await runCli(['--port', 'eighty'], io())).toBe(2);
    expect(await runCli(['--port', '70000'], io())).toBe(2);
    expect(await runCli(['--verbose'], io())).toBe(2);
    expect(err.filter((line) => line.startsWith('Usage'))).toHaveLength(3);
  });

  it('says so when git is not found and the folder looks like a repository', async () => {
    const env = gitEnv(folder.path);
    makeRepository(join(folder.path, 'repo'), env, { 'a.md': 'a' });
    await serve(['repo', '--port', '0'], { ...env, PATH: join(folder.path, 'no-bin') });
    expect(err).toEqual(['surfaces: git was not found; listing every file']);
  });

  it('says nothing about git for a folder that is not a repository, with git off the PATH', async () => {
    const env = gitEnv(folder.path);
    await serve(['site', '--port', '0'], { ...env, PATH: join(folder.path, 'no-bin') });
    expect(err).toEqual([]);
  });
});
