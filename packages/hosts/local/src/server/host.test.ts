import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHost } from './host';
import { LIST_LIMIT } from './limits';
import { versionOf } from './port';
import { eventReader, gitEnv, makeRepository, tempFolder, writeFiles } from './test-support';

import type { LocalHost } from './host';

const origin = 'http://127.0.0.1:5199';

let folder: ReturnType<typeof tempFolder>;
let root: string;
let host: LocalHost;

beforeEach(() => {
  folder = tempFolder();
  root = join(folder.path, 'served');
  writeFiles(root, {
    'a.md': '# A\n',
    'docs/b.md': 'b',
    'img/dot.png': new Uint8Array([0x89, 0x50, 0, 7]),
  });
});
afterEach(async () => {
  await host?.close();
  folder.cleanup();
});

function start(at = root, env?: NodeJS.ProcessEnv): LocalHost {
  host = createHost({ root: at, origin, env, warn: () => undefined });
  return host;
}

function request(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
): Promise<Response> {
  return host.fetch(new Request(`${origin}${path}`, init));
}

function put(changes: unknown, headers: Record<string, string> = { origin }): Promise<Response> {
  return request('/api/files', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ changes }),
  });
}

describe('the routes', () => {
  beforeEach(() => void start());

  it('GET /api/list answers the nodes, not cut', async () => {
    const response = await request('/api/list');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await response.json()).toEqual({
      nodes: [
        { path: 'a.md', type: 'blob' },
        { path: 'docs', type: 'tree' },
        { path: 'docs/b.md', type: 'blob' },
        { path: 'img', type: 'tree' },
        { path: 'img/dot.png', type: 'blob' },
      ],
      truncated: false,
    });
  });

  it('GET /api/list cuts the list past the limit and says so', async () => {
    mkdirSync(join(root, 'many'));
    for (let i = 0; i <= LIST_LIMIT; i += 1) writeFileSync(join(root, 'many', `${i}.txt`), '');
    const { nodes, truncated } = (await (await request('/api/list')).json()) as {
      nodes: unknown[];
      truncated: boolean;
    };
    expect(truncated).toBe(true);
    expect(nodes).toHaveLength(LIST_LIMIT);
  }, 60_000);

  it('GET /api/file answers the text and its version', async () => {
    const response = await request('/api/file?path=a.md');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      text: '# A\n',
      version: versionOf(Buffer.from('# A\n')),
    });
  });

  it.each([
    ['docs/none.md', 404, 'HOST_FILE_NOT_FOUND'],
    ['img/dot.png', 400, 'HOST_NOT_TEXT'],
    ['../x', 400, 'HOST_PATH_OUTSIDE_ROOT'],
    ['', 400, 'HOST_PATH_OUTSIDE_ROOT'],
  ])('GET /api/file?path=%s refuses with %i %s', async (path, status, code) => {
    const response = await request(`/api/file?path=${encodeURIComponent(path)}`);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ ok: false, code, message: expect.any(String) });
  });

  it('GET /api/raw sends the bytes, the type for the extension, nosniff and a sandbox', async () => {
    const response = await request('/api/raw?path=img/dot.png');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toBe('sandbox');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0x89, 0x50, 0, 7])
    );
  });

  it('GET /api/raw sends an HTML file sandboxed, and an unknown extension as bytes', async () => {
    writeFiles(root, { 'page.html': '<script>alert(1)</script>', 'blob.xyz': 'x' });
    const html = await request('/api/raw?path=page.html');
    expect(html.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(html.headers.get('content-security-policy')).toBe('sandbox');
    await html.arrayBuffer();
    const other = await request('/api/raw?path=blob.xyz');
    expect(other.headers.get('content-type')).toBe('application/octet-stream');
    await other.arrayBuffer();
  });

  it('GET /api/raw refuses a missing file and a folder with 404', async () => {
    for (const path of ['none.png', 'img']) {
      const response = await request(`/api/raw?path=${path}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'HOST_FILE_NOT_FOUND' });
    }
  });

  it('PUT /api/files writes and answers the versions', async () => {
    const base = versionOf(Buffer.from('# A\n'));
    const response = await put([
      { kind: 'write', path: 'a.md', content: '# A2\n', base },
      { kind: 'create', path: 'new/c.md', content: 'c' },
      { kind: 'move', from: 'img/dot.png', path: 'dot.png' },
      { kind: 'delete', path: 'docs/b.md' },
    ]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      versions: {
        'a.md': versionOf(Buffer.from('# A2\n')),
        'new/c.md': versionOf(Buffer.from('c')),
        'dot.png': versionOf(new Uint8Array([0x89, 0x50, 0, 7])),
      },
    });
    expect(readFileSync(join(root, 'a.md'), 'utf8')).toBe('# A2\n');
  });

  it.each([
    [
      'a missing file',
      [{ kind: 'write', path: 'none.md', content: '' }],
      404,
      'HOST_FILE_NOT_FOUND',
    ],
    [
      'a stale base',
      [{ kind: 'write', path: 'a.md', content: '', base: 'old' }],
      409,
      'HOST_FILE_CHANGED',
    ],
    ['a taken path', [{ kind: 'create', path: 'a.md', content: '' }], 409, 'HOST_PATH_EXISTS'],
    [
      'a path outside',
      [{ kind: 'create', path: '../x.md', content: '' }],
      400,
      'HOST_PATH_OUTSIDE_ROOT',
    ],
    ['a malformed change', [{ kind: 'write', path: 'a.md' }], 400, 'HOST_BAD_REQUEST'],
  ])('PUT /api/files refuses %s with %i', async (_what, changes, status, code) => {
    const response = await put(changes);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ ok: false, code, message: expect.any(String) });
    expect(readFileSync(join(root, 'a.md'), 'utf8')).toBe('# A\n');
  });

  it('PUT /api/files refuses a body that is not JSON, or has no changes', async () => {
    for (const body of ['not json', '{}', '{"changes":{}}', 'null']) {
      const response = await request('/api/files', { method: 'PUT', headers: { origin }, body });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'HOST_BAD_REQUEST' });
    }
  });

  it('GET /api/status answers {} until git arrives', async () => {
    expect(await (await request('/api/status')).json()).toEqual({});
  });

  it('GET /api/root names the folder, with a hash of its real path as the id', async () => {
    expect(await (await request('/api/root')).json()).toEqual({
      name: 'served',
      id: createHash('sha256').update(root).digest('hex'),
    });
  });

  it('GET / answers a one-line page naming the root', async () => {
    const response = await request('/');
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toContain(`Serving <code>${root}</code>.`);
  });

  it('answers 404 for no route and 405 for a method a route does not take', async () => {
    expect((await request('/api/nothing')).status).toBe(404);
    const response = await request('/api/list', { method: 'DELETE', headers: { origin } });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });
});

describe('the request checks', () => {
  beforeEach(() => void start());

  it.each([['127.0.0.1:5199'], ['localhost:5199'], ['LOCALHOST:5199']])(
    'answers Host %s',
    async (value) => {
      expect((await request('/api/root', { headers: { host: value } })).status).toBe(200);
    }
  );

  it.each([
    ['another name', 'evil.example:5199'],
    ['another port', '127.0.0.1:5200'],
    ['localhost on another port', 'localhost:5200'],
    ['no port', '127.0.0.1'],
    ['a name that ends like ours', 'evil.127.0.0.1:5199'],
    ['an address that starts like ours', '127.0.0.1.nip.io:5199'],
    ['a user part', 'evil@127.0.0.1:5199'],
  ])('refuses %s in Host with 403, for reads and writes', async (_what, value) => {
    for (const response of [
      await request('/api/file?path=a.md', { headers: { host: value } }),
      await put([{ kind: 'write', path: 'a.md', content: 'x' }], { origin, host: value }),
    ]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'HOST_FORBIDDEN' });
    }
    expect(readFileSync(join(root, 'a.md'), 'utf8')).toBe('# A\n');
  });

  it.each([
    ['no Origin', {}],
    ['an Origin of null', { origin: 'null' }],
    ['another port', { origin: 'http://127.0.0.1:5200' }],
    ['another scheme', { origin: 'https://127.0.0.1:5199' }],
    ['another site', { origin: 'https://evil.example' }],
    ['a trailing slash', { origin: `${origin}/` }],
  ])('refuses a PUT with %s', async (_what, headers: Record<string, string>) => {
    const response = await put([{ kind: 'write', path: 'a.md', content: 'x' }], headers);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'HOST_FORBIDDEN' });
    expect(readFileSync(join(root, 'a.md'), 'utf8')).toBe('# A\n');
  });

  it('takes a PUT from the origin, or from its localhost twin (the same server)', async () => {
    expect((await put([{ kind: 'write', path: 'a.md', content: '1' }], { origin })).status).toBe(
      200
    );
    const twin = { origin: 'http://localhost:5199', host: 'localhost:5199' };
    expect((await put([{ kind: 'write', path: 'a.md', content: '2' }], twin)).status).toBe(200);
  });

  it('refuses a read that another origin started', async () => {
    const response = await request('/api/file?path=a.md', {
      headers: { origin: 'https://evil.example' },
    });
    expect(response.status).toBe(403);
  });

  it('refuses what another site started by Sec-Fetch-Site, except a navigation', async () => {
    const fetchFrom = (site: string, mode: string) =>
      request('/api/raw?path=img/dot.png', {
        headers: { 'sec-fetch-site': site, 'sec-fetch-mode': mode },
      });
    expect((await fetchFrom('cross-site', 'no-cors')).status).toBe(403);
    expect((await fetchFrom('same-site', 'cors')).status).toBe(403);
    expect((await fetchFrom('same-origin', 'cors')).status).toBe(200);
    expect((await fetchFrom('none', 'navigate')).status).toBe(200);
    expect((await fetchFrom('cross-site', 'navigate')).status).toBe(200);
  });
});

describe('events', () => {
  async function listen() {
    const response = await request('/api/events');
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    const events = eventReader(response);
    await events.opened;
    return events;
  }

  it('sends changed for a file written outside the server', async () => {
    await start().ready();
    const events = await listen();
    writeFileSync(join(root, 'a.md'), 'edited elsewhere');
    expect(await events.next()).toEqual({ type: 'changed', paths: ['a.md'] });
    await events.close();
  });

  it('keeps reporting a file an editor replaced by a rename', async () => {
    await start().ready();
    const events = await listen();
    writeFileSync(join(root, 'docs', '.b.md.swp'), 'new');
    renameSync(join(root, 'docs', '.b.md.swp'), join(root, 'docs', 'b.md'));
    expect(await events.next()).toEqual({ type: 'changed', paths: ['docs/b.md'] });
    writeFileSync(join(root, 'docs', 'b.md'), 'again, in place');
    expect(await events.next()).toEqual({ type: 'changed', paths: ['docs/b.md'] });
    await events.close();
  });

  it('sends listed and changed when files appear and go, in new folders too', async () => {
    await start().ready();
    const events = await listen();
    writeFiles(root, { 'new/deeper/c.md': 'c' });
    expect(await events.next((e) => e.type === 'listed')).toEqual({ type: 'listed' });
    expect(await events.next()).toEqual({ type: 'changed', paths: ['new/deeper/c.md'] });

    // The new folder is watched now.
    writeFileSync(join(root, 'new', 'deeper', 'c.md'), 'edited');
    expect(await events.next()).toEqual({ type: 'changed', paths: ['new/deeper/c.md'] });

    rmSync(join(root, 'new'), { recursive: true });
    expect(await events.next((e) => e.type === 'listed')).toEqual({ type: 'listed' });
    expect(await events.next()).toEqual({ type: 'changed', paths: ['new/deeper/c.md'] });
    await events.close();
  });

  it('passes over ignored files and git’s own folder', async () => {
    const env = gitEnv(folder.path);
    const repo = join(folder.path, 'repo');
    makeRepository(repo, env, { '.gitignore': '*.log\n', 'a.md': 'a' });
    await start(repo, env).ready();
    const events = await listen();
    writeFileSync(join(repo, 'debug.log'), 'ignored');
    writeFileSync(join(repo, '.git', 'description'), 'git’s own');
    writeFileSync(join(repo, 'a.md'), 'tracked');
    expect(await events.next()).toEqual({ type: 'changed', paths: ['a.md'] });
    await events.close();
  });

  it('sends changed for the server’s own write too (the page compares versions)', async () => {
    await start().ready();
    const events = await listen();
    expect((await put([{ kind: 'write', path: 'a.md', content: 'mine' }])).status).toBe(200);
    expect(await events.next()).toEqual({ type: 'changed', paths: ['a.md'] });
    await events.close();
  });

  it('ends the stream when the host closes', async () => {
    await start().ready();
    const response = await request('/api/events');
    const reader = response.body!.getReader();
    await reader.read();
    await host.close();
    expect((await reader.read()).done).toBe(true);
  });
});
