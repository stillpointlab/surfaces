import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHost } from './host';
import { LIST_LIMIT } from './limits';
import { versionOf } from './port';
import { eventReader, git, gitEnv, makeRepository, tempFolder, writeFiles } from './test-support';

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

  it('GET /api/status answers {} outside a repository', async () => {
    expect(await (await request('/api/status')).json()).toEqual({});
  });

  it('GET /api/root names the folder, with a hash of its real path as the id', async () => {
    expect(await (await request('/api/root')).json()).toEqual({
      name: 'served',
      id: createHash('sha256').update(root).digest('hex'),
    });
  });

  it('GET / answers HOST_NO_ROUTE when the host is given no page', async () => {
    const response = await request('/');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'HOST_NO_ROUTE' });
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

describe('git', () => {
  let env: NodeJS.ProcessEnv;
  let repo: string;

  beforeEach(() => {
    env = gitEnv(folder.path);
    repo = join(folder.path, 'repo');
    makeRepository(repo, env, { 'a.md': 'a\n', 'docs/b.md': 'b\n', 'sub/s.md': 's\n' });
  });

  async function listen() {
    const events = eventReader(await request('/api/events'));
    await events.opened;
    return events;
  }

  const json = async (path: string): Promise<unknown> => (await request(path)).json();

  it('GET /api/git, /api/changes, /api/base and /api/status in a repository', async () => {
    await start(repo, env).ready();
    writeFileSync(join(repo, 'a.md'), 'edited\n');
    writeFiles(repo, { 'n.md': 'n' });
    expect((await put([{ kind: 'move', from: 'docs/b.md', path: 'docs/c.md' }])).status).toBe(200);
    rmSync(join(repo, 'sub', 's.md'));

    expect(await json('/api/git')).toEqual({ state: 'repository', branch: 'main' });
    expect(await json('/api/changes')).toEqual({
      ok: true,
      changes: [
        { path: 'a.md', status: 'changed' },
        { path: 'docs/c.md', status: 'moved', from: 'docs/b.md' },
        { path: 'n.md', status: 'new' },
        { path: 'sub/s.md', status: 'deleted' },
      ],
    });
    expect(await json('/api/status')).toEqual({
      'a.md': 'changed',
      'docs/c.md': 'moved',
      'n.md': 'new',
      'sub/s.md': 'deleted',
    });
    expect(await json('/api/base?path=a.md')).toEqual({ ok: true, text: 'a\n' });
    expect(await json('/api/base?path=docs%2Fc.md')).toEqual({ ok: true, text: 'b\n' });
    const missing = await request('/api/base?path=n.md');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ ok: false, code: 'HOST_FILE_NOT_FOUND' });
  });

  it('a served subfolder answers its own paths', async () => {
    await start(join(repo, 'sub'), env).ready();
    writeFileSync(join(repo, 'a.md'), 'edited outside the served folder\n');
    writeFileSync(join(repo, 'sub', 's.md'), 'edited\n');
    expect(await json('/api/changes')).toEqual({
      ok: true,
      changes: [{ path: 's.md', status: 'changed' }],
    });
    expect(await json('/api/base?path=s.md')).toEqual({ ok: true, text: 's\n' });
  });

  function post(body: unknown, headers: Record<string, string> = { origin }): Promise<Response> {
    return request('/api/commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('POST /api/commit commits the chosen paths, answers the commit, and sends status', async () => {
    await start(repo, env).ready();
    const events = await listen();
    writeFileSync(join(repo, 'a.md'), 'edited\n');
    writeFileSync(join(repo, 'docs', 'b.md'), 'not chosen\n');
    expect((await put([{ kind: 'move', from: 'sub/s.md', path: 'sub/t.md' }])).status).toBe(200);
    await events.next((e) => e.type === 'status');

    const response = await post({ paths: ['a.md', 'sub/t.md'], message: 'From the page' });
    expect(response.status).toBe(200);
    const answer = (await response.json()) as { ok: boolean; commit: string; short: string };
    expect(answer).toEqual({
      ok: true,
      commit: git(repo, env, 'rev-parse', 'HEAD').trim(),
      short: git(repo, env, 'rev-parse', '--short', 'HEAD').trim(),
      branch: 'main',
    });
    expect(
      git(repo, env, 'show', '--format=%s', '--name-status', 'HEAD').trim().split('\n')
    ).toEqual(['From the page', '', 'M\ta.md', 'R100\tsub/s.md\tsub/t.md']);
    expect(await events.next((e) => e.type === 'status')).toEqual({ type: 'status' });
    expect(await json('/api/status')).toEqual({ 'docs/b.md': 'changed' });
    await events.close();
  });

  it('POST /api/commit refuses by code and status, and needs the origin', async () => {
    await start(repo, env).ready();
    writeFileSync(join(repo, 'a.md'), 'edited\n');
    const cases: Array<[body: unknown, status: number, code: string]> = [
      ['not json', 400, 'HOST_BAD_REQUEST'],
      [{ paths: 'a.md', message: 'm' }, 400, 'HOST_BAD_REQUEST'],
      [{ paths: [], message: 'm' }, 400, 'HOST_COMMIT_NO_PATHS'],
      [{ paths: ['a.md'], message: '' }, 400, 'HOST_COMMIT_NO_MESSAGE'],
      [{ paths: ['../x'], message: 'm' }, 400, 'HOST_PATH_OUTSIDE_ROOT'],
      [{ paths: ['docs/b.md'], message: 'm' }, 409, 'HOST_NOT_CHANGED'],
      [{ paths: ['a.md'], message: 'm', branch: 'a..b' }, 400, 'HOST_BRANCH_INVALID'],
      [{ paths: ['a.md'], message: 'm', branch: 'main' }, 409, 'HOST_BRANCH_EXISTS'],
    ];
    for (const [body, status, code] of cases) {
      const response = await post(body);
      expect({ body, status: response.status }).toEqual({ body, status });
      expect(await response.json()).toMatchObject({ ok: false, code });
    }
    git(repo, env, 'switch', '-q', '--detach');
    const detached = await post({ paths: ['a.md'], message: 'm' });
    expect(detached.status).toBe(409);
    expect(await detached.json()).toMatchObject({ code: 'HOST_DETACHED_HEAD' });
    expect((await post({ paths: ['a.md'], message: 'm' }, {})).status).toBe(403);
    expect((await request('/api/commit')).status).toBe(405);
    expect(git(repo, env, 'rev-list', '--count', '--all')).toBe('1\n');
  });

  it('POST /api/commit answers git’s failure as HOST_GIT_FAILED (500)', async () => {
    const hook = join(repo, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, `#!/bin/sh\necho '<b>no</b> & "quotes"' >&2\nexit 1\n`);
    chmodSync(hook, 0o755);
    await start(repo, env).ready();
    writeFileSync(join(repo, 'a.md'), 'edited\n');
    const response = await post({ paths: ['a.md'], message: 'm' });
    expect(response.status).toBe(500);
    const body = (await response.json()) as { code: string; message: string };
    expect(body.code).toBe('HOST_GIT_FAILED');
    expect(body.message).toContain('<b>no</b> & "quotes"');
  });

  it('outside a repository the routes refuse with 409, and /api/git says why', async () => {
    await start().ready();
    expect(await json('/api/git')).toEqual({ state: 'no-repository', branch: null });
    for (const route of ['/api/changes', '/api/base?path=a.md']) {
      const response = await request(route);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ ok: false, code: 'HOST_NOT_A_REPOSITORY' });
    }
    const commit = await post({ paths: ['a.md'], message: 'm' });
    expect(commit.status).toBe(409);
    expect(await commit.json()).toMatchObject({ ok: false, code: 'HOST_NOT_A_REPOSITORY' });
  });

  it('with git off the PATH a repository is served, walked, written, and says so', async () => {
    const noGit = { ...env, PATH: join(folder.path, 'no-bin') };
    expect((await start(repo, noGit).ready()).listing).toBe('walk');
    expect(await json('/api/git')).toEqual({ state: 'no-git', branch: null });
    const response = await request('/api/changes');
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'HOST_GIT_NOT_FOUND' });
    const commit = await post({ paths: ['a.md'], message: 'm' });
    expect(commit.status).toBe(409);
    expect(await commit.json()).toMatchObject({ code: 'HOST_GIT_NOT_FOUND' });
    expect(await json('/api/status')).toEqual({});
    expect((await put([{ kind: 'move', from: 'a.md', path: 'moved.md' }])).status).toBe(200);
    expect(git(repo, env, 'diff', '--cached', '--name-status')).toBe('');
    const listed = (await json('/api/list')) as { nodes: { path: string }[] };
    expect(listed.nodes.map((n) => n.path)).toContain('moved.md');
  });

  it('sends status when the host stages, and after a commit or a stage in a terminal', async () => {
    await start(repo, env).ready();
    const events = await listen();
    expect((await put([{ kind: 'delete', path: 'a.md' }])).status).toBe(200);
    expect(await events.next((e) => e.type === 'status')).toEqual({ type: 'status' });

    git(repo, env, 'commit', '-q', '-m', 'delete a');
    expect(await events.next((e) => e.type === 'status')).toEqual({ type: 'status' });
    expect(await json('/api/status')).toEqual({});

    writeFileSync(join(repo, 'docs', 'b.md'), 'edited\n');
    git(repo, env, 'add', 'docs/b.md');
    expect(await events.next((e) => e.type === 'status')).toEqual({ type: 'status' });
    git(repo, env, 'switch', '-q', '-c', 'elsewhere');
    expect(await events.next((e) => e.type === 'status')).toEqual({ type: 'status' });
    await events.close();
  });

  it('reading the status after a status event raises no other (no loop)', async () => {
    await start(repo, env).ready();
    const events = await listen();
    expect((await put([{ kind: 'move', from: 'a.md', path: 'b.md' }])).status).toBe(200);
    expect(await events.next((e) => e.type === 'status')).toEqual({ type: 'status' });
    // What the page does on that event, a few times over.
    for (let i = 0; i < 3; i += 1) {
      await json('/api/status');
      await json('/api/changes');
      await json('/api/base?path=b.md');
    }
    await expect(events.next((e) => e.type === 'status', 1500)).rejects.toThrow(
      /no matching event/
    );
    await events.close();
  });

  it('watches git’s own folder for a served subfolder and for a worktree', async () => {
    await start(join(repo, 'sub'), env).ready();
    let events = await listen();
    git(repo, env, 'rm', '-q', 'a.md');
    expect(await events.next((e) => e.type === 'status')).toEqual({ type: 'status' });
    await events.close();
    await host.close();

    const tree = join(folder.path, 'tree');
    git(repo, env, 'worktree', 'add', '-q', '-b', 'side', tree);
    await start(tree, env).ready();
    events = await listen();
    expect((await put([{ kind: 'delete', path: 'docs/b.md' }])).status).toBe(200);
    expect(await events.next((e) => e.type === 'status')).toEqual({ type: 'status' });
    expect(git(tree, env, 'diff', '--cached', '--name-status')).toBe('D\tdocs/b.md\n');
    expect(await json('/api/git')).toEqual({ state: 'repository', branch: 'side' });
    await events.close();
  });
});
