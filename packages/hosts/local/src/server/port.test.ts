import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MAX_TEXT_BYTES } from './limits';
import { createNodePort, versionOf } from './port';
import { git, gitEnv, makeRepository, tempFolder, writeFiles } from './test-support';

import type { NodePort } from './port';
import type { FolderNode } from '@stillpointlab/common-format/app';

let folder: ReturnType<typeof tempFolder>;
let env: NodeJS.ProcessEnv;

beforeEach(() => {
  folder = tempFolder();
  env = gitEnv(folder.path);
});
afterEach(() => folder.cleanup());

const paths = (nodes: FolderNode[]) =>
  nodes.map((node) => `${node.type === 'tree' ? 'd' : 'f'} ${node.path}`);
const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8');
/** Every name under `root`, temporary files included: nothing may be left behind. */
const everything = (root: string) =>
  (readdirSync(root, { recursive: true }) as string[]).filter((p) => !p.startsWith('.git')).sort();

function port(root: string, extra: Partial<Parameters<typeof createNodePort>[0]> = {}): NodePort {
  return createNodePort({ root, env, ...extra });
}

describe('list', () => {
  it('in a repository: tracked and untracked files, not ignored ones or ones gone from disk', async () => {
    const root = join(folder.path, 'repo');
    makeRepository(root, env, {
      '.gitignore': 'dist/\n*.log\n',
      'a.md': 'a',
      'docs/b.md': 'b',
      'deleted.md': 'd',
    });
    writeFiles(root, {
      'new.md': 'n',
      'dist/out.js': 'x',
      'debug.log': 'l',
      'docs/deep/c.md': 'c',
    });
    // Tracked, but gone from disk: left out.
    rmSync(join(root, 'deleted.md'));

    const p = port(root);
    expect(await p.start()).toEqual({
      listing: 'git',
      gitFound: true,
      looksLikeRepository: false,
      git: 'repository',
    });
    expect(paths(await p.list())).toEqual([
      'f .gitignore',
      'f a.md',
      'd docs',
      'f docs/b.md',
      'd docs/deep',
      'f docs/deep/c.md',
      'f new.md',
    ]);
  });

  it('a folder inside a repository lists its own files, relative to itself', async () => {
    const root = join(folder.path, 'repo');
    makeRepository(root, env, { 'top.md': 't', 'pkg/a.md': 'a', 'pkg/src/b.ts': 'b' });
    const p = port(join(root, 'pkg'));
    expect(paths(await p.list())).toEqual(['f a.md', 'd src', 'f src/b.ts']);
  });

  it('a nested repository and a submodule are each one folder with nothing listed under it', async () => {
    const root = join(folder.path, 'repo');
    makeRepository(join(folder.path, 'other'), env, { 'o.md': 'o' });
    makeRepository(root, env, { 'a.md': 'a' });
    git(
      root,
      env,
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'add',
      '-q',
      join(folder.path, 'other'),
      'sub'
    );
    git(root, env, 'commit', '-q', '-m', 'sub');
    makeRepository(join(root, 'nested'), env, { 'n.md': 'n' });

    expect(paths(await port(root).list())).toEqual([
      'f .gitmodules',
      'f a.md',
      'd nested',
      'd sub',
    ]);
  });

  it('outside a repository: a walk that skips .git and node_modules and lists ignored files', async () => {
    writeFiles(folder.path, {
      'a.md': 'a',
      'node_modules/x/index.js': 'x',
      'src/node_modules/y.js': 'y',
      '.gitignore': '*.log\n',
      'debug.log': 'l',
      'src/b.ts': 'b',
    });
    mkdirSync(join(folder.path, 'empty'));
    const p = port(folder.path);
    expect(await p.start()).toEqual({
      listing: 'walk',
      gitFound: true,
      looksLikeRepository: false,
      git: 'no-repository',
    });
    expect(paths(await p.list())).toEqual([
      'f .gitignore',
      'f a.md',
      'f debug.log',
      'd src',
      'f src/b.ts',
    ]);
  });

  it('with git off the PATH, a repository is walked and said to look like one', async () => {
    const root = join(folder.path, 'repo');
    makeRepository(root, env, { '.gitignore': '*.log\n', 'a.md': 'a' });
    writeFiles(root, { 'debug.log': 'l', 'pkg/b.md': 'b' });
    const noGit = { ...env, PATH: join(folder.path, 'empty-bin') };

    const p = port(root, { env: noGit });
    expect(await p.start()).toEqual({
      listing: 'walk',
      gitFound: false,
      looksLikeRepository: true,
      git: 'no-git',
    });
    expect(paths(await p.list())).toEqual([
      'f .gitignore',
      'f a.md',
      'f debug.log',
      'd pkg',
      'f pkg/b.md',
    ]);

    // A folder inside one, and a worktree's `.git` file, look like one too.
    expect((await port(join(root, 'pkg'), { env: noGit }).start()).looksLikeRepository).toBe(true);
    writeFiles(folder.path, { 'worktree/.git': 'gitdir: /elsewhere\n', 'plain/a.md': 'a' });
    expect(
      (await port(join(folder.path, 'worktree'), { env: noGit }).start()).looksLikeRepository
    ).toBe(true);
    expect(
      (await port(join(folder.path, 'plain'), { env: noGit }).start()).looksLikeRepository
    ).toBe(false);
  });
});

describe('get', () => {
  it('answers the text and a version that is a SHA-256 of the bytes', async () => {
    writeFiles(folder.path, { 'a.md': '# A\n' });
    const answer = await port(folder.path).get('a.md');
    expect(answer).toEqual({ ok: true, text: '# A\n', version: versionOf(Buffer.from('# A\n')) });
  });

  it('keeps a byte order mark and CRLF line breaks', async () => {
    writeFiles(folder.path, { 'bom.txt': '﻿one\r\ntwo' });
    const answer = await port(folder.path).get('bom.txt');
    expect(answer.ok && answer.text).toBe('﻿one\r\ntwo');
  });

  it.each([
    ['a missing file', 'missing.md', 'HOST_FILE_NOT_FOUND'],
    ['a folder', 'docs', 'HOST_FILE_NOT_FOUND'],
    ['a file with a NUL byte', 'nul.bin', 'HOST_NOT_TEXT'],
    ['bytes that are not UTF-8', 'latin1.txt', 'HOST_NOT_TEXT'],
    ['a file over 2 MiB', 'big.txt', 'HOST_FILE_TOO_LARGE'],
  ])('refuses %s', async (_what, path, code) => {
    writeFiles(folder.path, {
      'docs/x.md': 'x',
      'nul.bin': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]),
      'latin1.txt': new Uint8Array([0x63, 0x61, 0x66, 0xe9]),
      'big.txt': 'a'.repeat(MAX_TEXT_BYTES + 1),
    });
    const answer = await port(folder.path).get(path);
    expect(answer).toMatchObject({ ok: false, code });
  });

  it('opens a file of exactly 2 MiB', async () => {
    writeFiles(folder.path, { 'edge.txt': 'a'.repeat(MAX_TEXT_BYTES) });
    expect((await port(folder.path).get('edge.txt')).ok).toBe(true);
  });
});

describe('put', () => {
  async function versionOfPath(p: NodePort, path: string): Promise<string> {
    const answer = await p.get(path);
    if (!answer.ok) throw new Error(answer.message);
    return answer.version;
  }

  it('writes with a matching base and answers the new version', async () => {
    writeFiles(folder.path, { 'a.md': 'old' });
    const p = port(folder.path);
    const base = await versionOfPath(p, 'a.md');
    const answer = await p.put([{ kind: 'write', path: 'a.md', content: 'new', base }]);
    expect(answer).toEqual({ ok: true, versions: { 'a.md': versionOf(Buffer.from('new')) } });
    expect(read(folder.path, 'a.md')).toBe('new');
    expect(everything(folder.path)).toEqual(['a.md']);
  });

  it('writes without a base, and keeps the file mode', async () => {
    writeFiles(folder.path, { 'run.sh': 'echo 1' });
    chmodSync(join(folder.path, 'run.sh'), 0o755);
    expect(
      (await port(folder.path).put([{ kind: 'write', path: 'run.sh', content: 'echo 2' }])).ok
    ).toBe(true);
    expect(statSync(join(folder.path, 'run.sh')).mode & 0o777).toBe(0o755);
  });

  it('one stale base refuses the whole call and writes nothing', async () => {
    writeFiles(folder.path, { 'a.md': 'a', 'b.md': 'b', 'c.md': 'c' });
    const p = port(folder.path);
    const a = await versionOfPath(p, 'a.md');
    const stale = versionOf(Buffer.from('what b was'));
    const answer = await p.put([
      { kind: 'write', path: 'a.md', content: 'A', base: a },
      { kind: 'create', path: 'new.md', content: 'N' },
      { kind: 'delete', path: 'c.md' },
      { kind: 'write', path: 'b.md', content: 'B', base: stale },
    ]);
    expect(answer).toMatchObject({ ok: false, code: 'HOST_FILE_CHANGED' });
    expect(answer.ok || answer.message).toContain('b.md');
    expect(everything(folder.path)).toEqual(['a.md', 'b.md', 'c.md']);
    expect([read(folder.path, 'a.md'), read(folder.path, 'b.md')]).toEqual(['a', 'b']);
  });

  it('a refusal anywhere in the call writes nothing (a create onto an existing file)', async () => {
    writeFiles(folder.path, { 'a.md': 'a', 'taken.md': 't' });
    const answer = await port(folder.path).put([
      { kind: 'write', path: 'a.md', content: 'A' },
      { kind: 'create', path: 'taken.md', content: 'T' },
    ]);
    expect(answer).toMatchObject({ ok: false, code: 'HOST_PATH_EXISTS' });
    expect(read(folder.path, 'a.md')).toBe('a');
  });

  it('creates a file, with the folders it needs', async () => {
    const p = port(folder.path);
    const answer = await p.put([{ kind: 'create', path: 'new/deep/n.md', content: 'n' }]);
    expect(answer).toEqual({
      ok: true,
      versions: { 'new/deep/n.md': versionOf(Buffer.from('n')) },
    });
    expect(read(folder.path, 'new/deep/n.md')).toBe('n');
  });

  it.each([
    ['a create onto a file', [{ kind: 'create', path: 'a.md', content: '' }], 'HOST_PATH_EXISTS'],
    ['a create onto a folder', [{ kind: 'create', path: 'docs', content: '' }], 'HOST_PATH_EXISTS'],
    [
      'a create under a file',
      [{ kind: 'create', path: 'a.md/x.md', content: '' }],
      'HOST_PATH_EXISTS',
    ],
    [
      'a move onto a file',
      [{ kind: 'move', from: 'a.md', path: 'docs/b.md', content: '' }],
      'HOST_PATH_EXISTS',
    ],
    [
      'a write of a missing file',
      [{ kind: 'write', path: 'no.md', content: '' }],
      'HOST_FILE_NOT_FOUND',
    ],
    [
      'a move of a missing file',
      [{ kind: 'move', from: 'no.md', path: 'docs/b.md', content: '' }],
      'HOST_FILE_NOT_FOUND',
    ],
    ['a delete of a missing file', [{ kind: 'delete', path: 'no.md' }], 'HOST_FILE_NOT_FOUND'],
    ['a delete of a folder', [{ kind: 'delete', path: 'docs' }], 'HOST_FILE_NOT_FOUND'],
    [
      'a stale base on a move',
      [{ kind: 'move', from: 'a.md', path: 'c.md', base: 'stale' }],
      'HOST_FILE_CHANGED',
    ],
    [
      'a stale base on a delete',
      [{ kind: 'delete', path: 'a.md', base: 'stale' }],
      'HOST_FILE_CHANGED',
    ],
    [
      'two new files where one is the folder of the other',
      [
        { kind: 'create', path: 'n', content: '' },
        { kind: 'create', path: 'n/m.md', content: '' },
      ],
      'HOST_PATH_EXISTS',
    ],
    [
      'one path named twice',
      [
        { kind: 'write', path: 'a.md', content: '1' },
        { kind: 'delete', path: 'a.md' },
      ],
      'HOST_BAD_REQUEST',
    ],
    ['an unknown kind', [{ kind: 'chmod', path: 'a.md' }], 'HOST_BAD_REQUEST'],
    ['a write without content', [{ kind: 'write', path: 'a.md' }], 'HOST_BAD_REQUEST'],
  ])('refuses %s, and writes nothing', async (_what, changes, code) => {
    writeFiles(folder.path, { 'a.md': 'a', 'docs/b.md': 'b' });
    const answer = await port(folder.path).put(changes as never);
    expect(answer).toMatchObject({ ok: false, code });
    expect(everything(folder.path)).toEqual(['a.md', 'docs', 'docs/b.md']);
  });

  it('moves a file with new content, keeping its mode, and removes the folder it emptied', async () => {
    writeFiles(folder.path, { 'old/a.sh': 'echo a', 'keep.md': 'k' });
    chmodSync(join(folder.path, 'old/a.sh'), 0o755);
    const p = port(folder.path);
    const base = await versionOfPath(p, 'old/a.sh');
    const answer = await p.put([
      { kind: 'move', from: 'old/a.sh', path: 'new/b.sh', content: 'echo b', base },
    ]);
    expect(answer).toEqual({
      ok: true,
      versions: { 'new/b.sh': versionOf(Buffer.from('echo b')) },
    });
    expect(everything(folder.path)).toEqual(['keep.md', 'new', 'new/b.sh']);
    expect(statSync(join(folder.path, 'new/b.sh')).mode & 0o777).toBe(0o755);
  });

  it('moves a file that is not text without content, keeping its bytes', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);
    writeFiles(folder.path, { 'img/a.png': png });
    const answer = await port(folder.path).put([
      { kind: 'move', from: 'img/a.png', path: 'b.png' },
    ]);
    expect(answer).toEqual({ ok: true, versions: { 'b.png': versionOf(png) } });
    expect(new Uint8Array(readFileSync(join(folder.path, 'b.png')))).toEqual(png);
    expect(everything(folder.path)).toEqual(['b.png']);
  });

  it('deletes files, with a base, and removes the folders left empty', async () => {
    writeFiles(folder.path, { 'a/b/c.md': 'c', 'a/b/d.md': 'd', 'e.md': 'e' });
    const p = port(folder.path);
    const base = await versionOfPath(p, 'a/b/c.md');
    const answer = await p.put([
      { kind: 'delete', path: 'a/b/c.md', base },
      { kind: 'delete', path: 'a/b/d.md' },
    ]);
    expect(answer).toEqual({ ok: true, versions: {} });
    expect(everything(folder.path)).toEqual(['e.md']);
  });

  it.skipIf(process.getuid?.() === 0)(
    'a write that fails part way (a folder it cannot write) takes back the changes before it',
    async () => {
      writeFiles(folder.path, { 'a.md': 'a', 'b.md': 'b', 'locked/c.md': 'c', 'gone.md': 'g' });
      chmodSync(join(folder.path, 'locked'), 0o555);
      try {
        const answer = await port(folder.path).put([
          { kind: 'write', path: 'a.md', content: 'A' },
          { kind: 'create', path: 'new/n.md', content: 'N' },
          { kind: 'delete', path: 'gone.md' },
          { kind: 'move', from: 'b.md', path: 'moved/b.md' },
          { kind: 'write', path: 'locked/c.md', content: 'C' },
        ]);
        expect(answer).toMatchObject({ ok: false, code: 'HOST_WRITE_FAILED' });
        expect(answer.ok || answer.message).toContain('locked/c.md');
        expect(answer.ok || answer.message).toContain('nothing was changed');
      } finally {
        chmodSync(join(folder.path, 'locked'), 0o755);
      }
      expect(everything(folder.path)).toEqual(['a.md', 'b.md', 'gone.md', 'locked', 'locked/c.md']);
      expect(['a.md', 'b.md', 'gone.md', 'locked/c.md'].map((p) => read(folder.path, p))).toEqual([
        'a',
        'b',
        'g',
        'c',
      ]);
    }
  );

  it('two puts at once run one after the other: the second sees the first', async () => {
    writeFiles(folder.path, { 'a.md': 'a' });
    const p = port(folder.path);
    const base = await versionOfPath(p, 'a.md');
    const [first, second] = await Promise.all([
      p.put([{ kind: 'write', path: 'a.md', content: 'first', base }]),
      p.put([{ kind: 'write', path: 'a.md', content: 'second', base }]),
    ]);
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, code: 'HOST_FILE_CHANGED' });
    expect(read(folder.path, 'a.md')).toBe('first');

    // And two creates of one path: one wins, the other is told it exists.
    const both = await Promise.all([
      p.put([{ kind: 'create', path: 'n.md', content: '1' }]),
      p.put([{ kind: 'create', path: 'n.md', content: '2' }]),
    ]);
    expect(both.map((answer) => answer.ok)).toEqual([true, false]);
    expect(both[1]).toMatchObject({ code: 'HOST_PATH_EXISTS' });
    expect(read(folder.path, 'n.md')).toBe('1');
  });

  it('answers an empty call with no versions', async () => {
    expect(await port(folder.path).put([])).toEqual({ ok: true, versions: {} });
  });

  it('status is empty until git arrives', async () => {
    expect(await port(folder.path).status()).toEqual({});
    expect(existsSync(folder.path)).toBe(true);
  });
});
