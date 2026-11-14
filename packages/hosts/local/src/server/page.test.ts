import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CLIENT_ROOT } from './client-build';
import { createHost } from './host';
import { createStaticPage, PAGE_HEADERS, PAGE_POLICY } from './page';
import { tempFolder, writeFiles } from './test-support';

import type { LocalHost } from './host';

const origin = 'http://127.0.0.1:5199';

let folder: ReturnType<typeof tempFolder>;
let client: string;
let host: LocalHost;

beforeEach(() => {
  folder = tempFolder();
  client = join(folder.path, 'client');
  writeFiles(folder.path, {
    'served/a.md': '# A\n',
    'client/index.html': '<!doctype html><title>page</title>',
    'client/assets/index-abc.js': 'console.log(1)',
    'client/assets/index-abc.css': 'body{}',
    'client/.hidden': 'no',
    'secret.txt': 'outside the client',
  });
  host = createHost({
    root: join(folder.path, 'served'),
    origin,
    warn: () => undefined,
    page: createStaticPage(client),
  });
});
afterEach(async () => {
  await host.close();
  folder.cleanup();
});

function request(path: string, init: RequestInit = {}): Promise<Response> {
  return host.fetch(new Request(`${origin}${path}`, init));
}

describe('the page', () => {
  it('serves index.html at / with the policy and no caching', async () => {
    const response = await request('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('content-security-policy')).toBe(
      `${PAGE_POLICY}; frame-ancestors 'none'`
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain('<title>page</title>');
  });

  it('serves the hashed assets, typed, for a long time', async () => {
    const script = await request('/assets/index-abc.js');
    expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(script.headers.get('cache-control')).toContain('immutable');
    expect(await script.text()).toBe('console.log(1)');
    expect((await request('/assets/index-abc.css')).headers.get('content-type')).toBe(
      'text/css; charset=utf-8'
    );
  });

  it.each([
    '/../secret.txt',
    '/assets/../../secret.txt',
    '/assets/%2e%2e/%2e%2e/secret.txt',
    '/assets/..%2f..%2fsecret.txt',
    '/assets%2findex-abc.js',
    '/.hidden',
    '/assets/',
    '/nothing.js',
  ])('serves nothing outside the built files: %s', async (path) => {
    const response = await request(path);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('outside the client');
  });

  it('follows no link, even one that points inside', async () => {
    symlinkSync(join(folder.path, 'secret.txt'), join(client, 'assets', 'leak.js'));
    symlinkSync(join(client, 'index.html'), join(client, 'twin.html'));
    mkdirSync(join(folder.path, 'elsewhere'));
    writeFileSync(join(folder.path, 'elsewhere', 'x.js'), 'outside the client');
    symlinkSync(join(folder.path, 'elsewhere'), join(client, 'linked'));
    for (const path of ['/assets/leak.js', '/twin.html', '/linked/x.js']) {
      expect((await request(path)).status).toBe(404);
    }
  });

  it('answers only GET and HEAD, and leaves /api/ to the routes', async () => {
    // The host's checks ask a HEAD for its Origin, as they do every method but GET.
    expect((await request('/', { method: 'HEAD', headers: { origin } })).status).toBe(200);
    const post = await request('/', { method: 'POST', headers: { origin } });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET, HEAD');
    const api = await request('/api/nothing');
    expect(api.status).toBe(404);
    expect(await api.json()).toMatchObject({ code: 'HOST_NO_ROUTE' });
  });

  it('passes the request checks first', async () => {
    const response = await request('/', { headers: { origin: 'http://evil.example' } });
    expect(response.status).toBe(403);
  });

  it('says the page is not built until it is, and finds it once built', async () => {
    const page = createStaticPage(join(folder.path, 'not-yet'));
    const url = new URL(`${origin}/`);
    const before = await page(new Request(url), url);
    expect(before.status).toBe(503);
    expect(await before.text()).toContain('not built');
    writeFiles(folder.path, { 'not-yet/index.html': '<!doctype html>built' });
    expect(await (await page(new Request(url), url)).text()).toBe('<!doctype html>built');
  });
});

describe('the policy', () => {
  it('is the same in the page as in the header', () => {
    const html = readFileSync(join(CLIENT_ROOT, 'index.html'), 'utf8');
    const meta = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
    expect(meta).toBe(PAGE_POLICY);
    expect(PAGE_HEADERS['content-security-policy']).toBe(`${PAGE_POLICY}; frame-ancestors 'none'`);
  });

  it('lets scripts come from the page alone', () => {
    expect(PAGE_POLICY).toContain("script-src 'self'");
    expect(PAGE_POLICY).not.toMatch(/script-src[^;]*'unsafe/);
  });
});
