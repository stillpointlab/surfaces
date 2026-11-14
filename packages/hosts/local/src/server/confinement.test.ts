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
  p = createNodePort({ root });
});
afterEach(() => folder.cleanup());

const secretUntouched = () => {
  expect(readFileSync(join(outside, 'secret.txt'), 'utf8')).toBe('secret');
  expect(readFileSync(join(outside, 'dir', 'inner.txt'), 'utf8')).toBe('inner');
};

describe('reads', () => {
  it.each([
    ['..', '../outside/secret.txt'],
    ['an absolute path', '/etc/hostname'],
    ['.git', '.git/config'],
    ['.GIT', '.GIT/config'],
    ['a link out, as the file', 'out-file'],
    ['a link out, as a folder on the path', 'out-dir/inner.txt'],
    ['a link out that leads nowhere', 'out-dangling'],
  ])('refuses %s', async (_what, path) => {
    expect(await p.get(path)).toMatchObject({ ok: false, code: 'HOST_PATH_OUTSIDE_ROOT' });
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
  const refusedWrites: Array<[string, PortChange[]]> = [
    ['a write through a link out', [{ kind: 'write', path: 'out-file', content: 'x' }]],
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
    ['a create in .git', [{ kind: 'create', path: '.git/hooks/pre-commit', content: 'x' }]],
    ['a create in .Git', [{ kind: 'create', path: '.Git/hooks/pre-commit', content: 'x' }]],
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
    ['a move into .git', [{ kind: 'move', from: 'a.md', path: '.git/a.md' }]],
  ];

  it.each(refusedWrites)('refuses %s, and writes nothing', async (_what, changes) => {
    const before = readFileSync(join(root, 'a.md'), 'utf8');
    expect(await p.put(changes)).toMatchObject({ ok: false, code: 'HOST_PATH_OUTSIDE_ROOT' });
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
  const get = async (rawPath: string, route = 'file') => {
    const host = createHost({ root, origin });
    try {
      const response = await host.fetch(new Request(`${origin}/api/${route}?path=${rawPath}`));
      return { status: response.status, body: (await response.json()) as { code?: string } };
    } finally {
      await host.close();
    }
  };

  it.each([
    ['percent-encoded ..', '..%2Foutside%2Fsecret.txt'],
    ['percent-encoded dots', '%2e%2e/outside/secret.txt'],
    ['an encoded separator inside ..', 'docs%2F..%2F..%2Foutside%2Fsecret.txt'],
    ['a doubled separator', 'docs//b.md'],
    ['a leading separator', '%2Fetc%2Fpasswd'],
    ['an encoded backslash', '..%5Coutside%5Csecret.txt'],
    ['an encoded NUL', 'a.md%00.png'],
    ['.git, encoded', '%2Egit/config'],
    ['a link out', 'out-file'],
    ['a folder link out', 'out-dir/inner.txt'],
  ])('/api/file and /api/raw refuse %s with 400', async (_what, rawPath) => {
    for (const route of ['file', 'raw']) {
      const { status, body } = await get(rawPath, route);
      expect({ route, status, code: body.code }).toEqual({
        route,
        status: 400,
        code: 'HOST_PATH_OUTSIDE_ROOT',
      });
    }
  });

  it('PUT /api/files refuses a write through a link out', async () => {
    const host = createHost({ root, origin });
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
    expect(await get('empty/none.md')).toEqual({
      status: 404,
      body: expect.objectContaining({ code: 'HOST_FILE_NOT_FOUND' }),
    });
  });
});
