// Confinement: no path outside the served root, symbolic links included, for
// reads and writes, through the port and through the routes.

import { lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHost } from './host';
import { createNodePort } from './port';
import { tempFolder, writeFiles } from './test-support';

import type { NodePort } from './port';
import type { PortChange } from '@stillpointlab/common-format/host';

let folder: ReturnType<typeof tempFolder>;
/** The served root, with a sibling outside it that holds a secret. */
let root: string;
let outside: string;
let p: NodePort;

beforeEach(() => {
  folder = tempFolder();
  root = join(folder.path, 'root');
  outside = join(folder.path, 'outside');
  writeFiles(outside, { 'secret.txt': 'secret', 'dir/inner.txt': 'inner' });
  writeFiles(root, {
    'a.md': 'a',
    'docs/b.md': 'b',
    'real/target.md': 'target',
    '.git/config': '[core]',
  });
  // Links out: one to a file, one to a folder, one that leads nowhere outside.
  symlinkSync(join(outside, 'secret.txt'), join(root, 'out-file'));
  symlinkSync(join(outside, 'dir'), join(root, 'out-dir'));
  symlinkSync(join(outside, 'missing', 'x.txt'), join(root, 'out-dangling'));
  // Links that stay inside: to a file, and (relative) to a folder.
  symlinkSync(join(root, 'real', 'target.md'), join(root, 'in-file'));
  symlinkSync('real', join(root, 'in-dir'));
  // Links that stay inside and lead into git's folder: to a file in it, and to it.
  symlinkSync(join('.git', 'config'), join(root, 'cfg.md'));
  symlinkSync('.git', join(root, 'dotgit'));
  p = createNodePort({ root });
});
afterEach(() => folder.cleanup());

const OUTSIDE = 'HOST_PATH_OUTSIDE_ROOT';
const INVALID = 'HOST_PATH_INVALID';

const secretUntouched = () => {
  expect(readFileSync(join(outside, 'secret.txt'), 'utf8')).toBe('secret');
  expect(readFileSync(join(outside, 'dir', 'inner.txt'), 'utf8')).toBe('inner');
};

describe('reads', () => {
  it.each([
    ['..', '../outside/secret.txt', OUTSIDE],
    ['an absolute path', '/etc/hostname', OUTSIDE],
    ['.git', '.git/config', INVALID],
    ['.GIT', '.GIT/config', INVALID],
    ['a . segment', './a.md', INVALID],
    ['a link out, as the file', 'out-file', OUTSIDE],
    ['a link out, as a folder on the path', 'out-dir/inner.txt', OUTSIDE],
    ['a link out that leads nowhere', 'out-dangling', OUTSIDE],
    ['a link to a file in git’s folder', 'cfg.md', INVALID],
    ['a link to git’s folder, as a folder on the path', 'dotgit/config', INVALID],
  ])('refuses %s', async (_what, path, code) => {
    expect(await p.get(path)).toMatchObject({ ok: false, code });
  });

  it('says a link leads into git’s folder', async () => {
    expect(await p.get('cfg.md')).toMatchObject({
      code: INVALID,
      message: '"cfg.md" is not a usable path: a symbolic link on it leads into git\'s own folder.',
    });
  });

  it('answers where a path leads, for a rule about a place', async () => {
    expect(await p.leadsTo('a.md')).toBe('a.md');
    expect(await p.leadsTo('in-file')).toBe('real/target.md');
    expect(await p.leadsTo('in-dir/target.md')).toBe('real/target.md');
    expect(await p.leadsTo('in-dir/new/deep.md')).toBe('real/new/deep.md');
    expect(await p.leadsTo('out-file')).toBeNull();
    expect(await p.leadsTo('cfg.md')).toBeNull();
  });

  it('says which: a path that would leave the folder, or one it does not take', async () => {
    expect(await p.get('../a.md')).toMatchObject({
      code: OUTSIDE,
      message: '"../a.md" is outside the served folder: The path has a ".." segment.',
    });
    expect(await p.get('docs\\b.md')).toMatchObject({
      code: INVALID,
      message:
        '"docs\\\\b.md" is not a usable path: The path has a backslash; separate folders with "/".',
    });
  });

  it('refuses an absolute path to a file inside the root', async () => {
    expect(await p.get(join(root, 'a.md'))).toMatchObject({ code: 'HOST_PATH_OUTSIDE_ROOT' });
  });

  it('opens a file through a link that stays inside, as the file and as a folder', async () => {
    expect(await p.get('in-file')).toMatchObject({ ok: true, text: 'target' });
    expect(await p.get('in-dir/target.md')).toMatchObject({ ok: true, text: 'target' });
  });

  it('lists a link out, which still cannot be opened', async () => {
    const listed = (await p.list()).map((node) => node.path);
    expect(listed).toEqual(expect.arrayContaining(['out-file', 'out-dir', 'in-file', 'in-dir']));
    expect(listed.some((path) => path.startsWith('.git'))).toBe(false);
  });
});

describe('writes', () => {
  // Each with its code: outside the root unless it says otherwise.
  const refusedWrites: Array<[string, PortChange[], string?]> = [
    ['a write through a link out', [{ kind: 'write', path: 'out-file', content: 'x' }]],
    [
      'a write through a link to a file in git’s folder',
      [{ kind: 'write', path: 'cfg.md', content: 'x' }],
      INVALID,
    ],
    [
      'a create under a link to git’s folder',
      [{ kind: 'create', path: 'dotgit/hooks/pre-commit', content: 'x' }],
      INVALID,
    ],
    [
      'a write under a folder link out',
      [{ kind: 'write', path: 'out-dir/inner.txt', content: 'x' }],
    ],
    [
      'a create under a folder link out',
      [{ kind: 'create', path: 'out-dir/new.txt', content: 'x' }],
    ],
    [
      'a create under a folder link out, in a folder that does not exist yet',
      [{ kind: 'create', path: 'out-dir/deep/new.txt', content: 'x' }],
    ],
    [
      'a create through a link out that leads nowhere',
      [{ kind: 'create', path: 'out-dangling', content: 'x' }],
    ],
    ['a create with ..', [{ kind: 'create', path: '../outside/new.txt', content: 'x' }]],
    [
      'a create with an absolute path',
      [{ kind: 'create', path: '/tmp/surfaces-escape.txt', content: 'x' }],
    ],
    [
      'a create in .git',
      [{ kind: 'create', path: '.git/hooks/pre-commit', content: 'x' }],
      INVALID,
    ],
    [
      'a create in .Git',
      [{ kind: 'create', path: '.Git/hooks/pre-commit', content: 'x' }],
      INVALID,
    ],
    ['a delete of a link out', [{ kind: 'delete', path: 'out-file' }]],
    ['a delete under a folder link out', [{ kind: 'delete', path: 'out-dir/inner.txt' }]],
    ['a move of a link out', [{ kind: 'move', from: 'out-file', path: 'moved.txt' }]],
    [
      'a move out of the root',
      [{ kind: 'move', from: 'a.md', path: '../outside/a.md', content: 'a' }],
    ],
    [
      'a move into a folder link out',
      [{ kind: 'move', from: 'a.md', path: 'out-dir/a.md', content: 'a' }],
    ],
    ['a move into .git', [{ kind: 'move', from: 'a.md', path: '.git/a.md' }], INVALID],
  ];

  it.each(refusedWrites)('refuses %s, and writes nothing', async (_what, changes, code) => {
    const before = readFileSync(join(root, 'a.md'), 'utf8');
    expect(await p.put(changes)).toMatchObject({ ok: false, code: code ?? OUTSIDE });
    secretUntouched();
    expect(readFileSync(join(root, 'a.md'), 'utf8')).toBe(before);
    expect(lstatSync(join(root, 'out-file')).isSymbolicLink()).toBe(true);
  });

  it('a call with one change outside refuses the ones inside too', async () => {
    const answer = await p.put([
      { kind: 'write', path: 'a.md', content: 'changed' },
      { kind: 'create', path: 'docs/new.md', content: 'new' },
      { kind: 'write', path: 'out-dir/inner.txt', content: 'x' },
    ]);
    expect(answer).toMatchObject({ code: 'HOST_PATH_OUTSIDE_ROOT' });
    expect(readFileSync(join(root, 'a.md'), 'utf8')).toBe('a');
    expect(() => lstatSync(join(root, 'docs/new.md'))).toThrow();
  });

  it('writes through a link that stays inside to its target, and keeps the link', async () => {
    expect((await p.put([{ kind: 'write', path: 'in-file', content: 'through' }])).ok).toBe(true);
    expect(lstatSync(join(root, 'in-file')).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(root, 'in-file'))).toBe(join(root, 'real', 'target.md'));
    expect(readFileSync(join(root, 'real/target.md'), 'utf8')).toBe('through');
  });

  it('creates under a folder link that stays inside, in the link’s real folder', async () => {
    expect((await p.put([{ kind: 'create', path: 'in-dir/new/n.md', content: 'n' }])).ok).toBe(
      true
    );
    expect(readFileSync(join(root, 'real/new/n.md'), 'utf8')).toBe('n');
  });

  it('creates where the parent does not exist yet', async () => {
    expect((await p.put([{ kind: 'create', path: 'x/y/z.md', content: 'z' }])).ok).toBe(true);
    expect(readFileSync(join(root, 'x/y/z.md'), 'utf8')).toBe('z');
  });

  it('deletes a link that stays inside, not its target', async () => {
    expect((await p.put([{ kind: 'delete', path: 'in-file' }])).ok).toBe(true);
    expect(() => lstatSync(join(root, 'in-file'))).toThrow();
    expect(readFileSync(join(root, 'real/target.md'), 'utf8')).toBe('target');
  });
});

describe('the routes', () => {
  const origin = 'http://127.0.0.1:5199';
  /** One request by its address as sent; the URL parser reads it as a browser would. */
  const get = async (address: string) => {
    const host = createHost({ root, origin, token: null });
    try {
      const response = await host.fetch(new Request(`${origin}${address}`));
      return { status: response.status, body: (await response.json()) as { code?: string } };
    } finally {
      await host.close();
    }
  };

  it.each([
    ['percent-encoded ..', '..%2Foutside%2Fsecret.txt', OUTSIDE],
    ['an encoded separator inside ..', 'docs%2F..%2F..%2Foutside%2Fsecret.txt', OUTSIDE],
    ['a doubled separator', 'docs//b.md', INVALID],
    ['a leading separator', '%2Fetc%2Fpasswd', OUTSIDE],
    ['an encoded backslash', '..%5Coutside%5Csecret.txt', INVALID],
    ['an encoded NUL', 'a.md%00.png', INVALID],
    ['.git', '.git/config', INVALID],
    ['.git, encoded', '%2Egit/config', INVALID],
    ['a link out', 'out-file', OUTSIDE],
    ['a folder link out', 'out-dir/inner.txt', OUTSIDE],
    ['a link out that leads nowhere', 'out-dangling', OUTSIDE],
    ['a link into git’s folder', 'cfg.md', INVALID],
    ['a link to git’s folder, as a folder on the path', 'dotgit/config', INVALID],
  ])('/api/file?path= and /api/raw/ refuse %s with 400', async (_what, rawPath, code) => {
    for (const address of [`/api/file?path=${rawPath}`, `/api/raw/${rawPath}`]) {
      const { status, body } = await get(address);
      expect({ address, status, code: body.code }).toEqual({ address, status: 400, code });
    }
  });

  it('/api/file?path= refuses percent-encoded dots with 400', async () => {
    expect(await get('/api/file?path=%2e%2e/outside/secret.txt')).toEqual({
      status: 400,
      body: expect.objectContaining({ code: OUTSIDE }),
    });
  });

  // The raw route's path is the address's own, so the URL parser has resolved its
  // dot segments, in any spelling, and read a backslash as `/`, before the host
  // sees it: an address that climbs out of `/api/raw/` is no route's at all.
  it.each([
    ['..', '/api/raw/../outside/secret.txt'],
    ['.. past a folder', '/api/raw/docs/../../outside/secret.txt'],
    ['percent-encoded dots', '/api/raw/%2e%2e/outside/secret.txt'],
    ['dots half encoded', '/api/raw/.%2E/%2e./outside/secret.txt'],
    ['backslashes', '/api/raw/..\\..\\outside\\secret.txt'],
  ])('/api/raw/ by %s leaves the route, and reaches no file', async (_what, address) => {
    expect(await get(address)).toEqual({
      status: 404,
      body: expect.objectContaining({ code: 'HOST_NO_ROUTE' }),
    });
  });

  // An encoded slash is decoded with the rest, so it separates as `/` does.
  it('/api/raw/ serves what a dot segment, a backslash or an encoded slash leads to inside it', async () => {
    const host = createHost({ root, origin, token: null });
    try {
      for (const address of [
        '/api/raw/docs/../a.md',
        '/api/raw/./a.md',
        '/api/raw/real\\target.md',
        '/api/raw/real%2Ftarget.md',
      ]) {
        const response = await host.fetch(new Request(`${origin}${address}`));
        expect({ address, status: response.status }).toEqual({ address, status: 200 });
        await response.arrayBuffer();
      }
    } finally {
      await host.close();
    }
  });

  it.each([
    ['a trailing slash', '/api/raw/docs/', INVALID],
    ['no path', '/api/raw/', INVALID],
    ['an encoding that does not decode', '/api/raw/a%E0%A4%A.md', INVALID],
    ['a stray percent sign', '/api/raw/100%.md', INVALID],
  ])('/api/raw/ refuses %s with 400', async (_what, address, code) => {
    expect(await get(address)).toEqual({
      status: 400,
      body: expect.objectContaining({ code }),
    });
  });

  it.each([
    ['a folder', '/api/raw/docs'],
    ['a link to a folder that stays inside', '/api/raw/in-dir'],
    ['the route with no slash', '/api/raw'],
  ])('/api/raw/ answers %s with 404', async (_what, address) => {
    expect((await get(address)).status).toBe(404);
  });

  it('the old raw address, with the path in its query, is gone', async () => {
    expect(await get('/api/raw?path=a.md')).toEqual({
      status: 404,
      body: expect.objectContaining({ code: 'HOST_NO_ROUTE' }),
    });
  });

  it('PUT /api/files refuses a write through a link out', async () => {
    const host = createHost({ root, origin, token: null });
    try {
      const response = await host.fetch(
        new Request(`${origin}/api/files`, {
          method: 'PUT',
          headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify({
            changes: [{ kind: 'write', path: 'out-dir/inner.txt', content: 'x' }],
          }),
        })
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, code: 'HOST_PATH_OUTSIDE_ROOT' });
    } finally {
      await host.close();
    }
    secretUntouched();
  });

  it('serves a missing path under a real folder as not found, not outside', async () => {
    mkdirSync(join(root, 'empty'));
    for (const address of ['/api/file?path=empty/none.md', '/api/raw/empty/none.md']) {
      expect(await get(address)).toEqual({
        status: 404,
        body: expect.objectContaining({ code: 'HOST_FILE_NOT_FOUND' }),
      });
    }
  });
});
