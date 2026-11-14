// The git module over real temporary repositories: each status, a served root
// inside a repository, `HEAD` text, and the port staging its own moves and
// deletes (and nothing else). Every repository sets its own identity and branch
// and reads no global configuration (`test-support.ts`).

import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MAX_TEXT_BYTES } from '../limits';
import { createNodePort } from '../port';
import { git, gitEnv, makeRepository, tempFolder, writeFiles } from '../test-support';

import { createGit } from './repository';

import type { NodePort } from '../port';
import type { PortChange } from '@stillpointlab/common-format/host';

let folder: ReturnType<typeof tempFolder>;
let env: NodeJS.ProcessEnv;
let repo: string;
let warnings: string[];

beforeEach(() => {
  folder = tempFolder();
  env = gitEnv(folder.path);
  repo = join(folder.path, 'repo');
  warnings = [];
});
afterEach(() => folder.cleanup());

const lines = 'one\ntwo\nthree\nfour\nfive\n';

function access(root = repo, extra: NodeJS.ProcessEnv = {}) {
  return createGit({ root, env: { ...env, ...extra }, warn: (m) => warnings.push(m) });
}

function port(root = repo, extra: NodeJS.ProcessEnv = {}): NodePort {
  return createNodePort({ root, env: { ...env, ...extra }, warn: (m) => warnings.push(m) });
}

/** What the index holds against HEAD: the staged changes, with renames. */
const staged = (cwd = repo) =>
  git(cwd, env, 'diff', '--cached', '--name-status', '-M').trim().split('\n').filter(Boolean);
/** What the work tree holds against the index. */
const unstaged = (cwd = repo) =>
  git(cwd, env, 'diff', '--name-status').trim().split('\n').filter(Boolean);

async function changesOf(root = repo) {
  const answer = await access(root).changes();
  if (!answer.ok) throw new Error(answer.message);
  return answer.changes;
}

describe('start and info', () => {
  it('a repository: its prefix, git’s folder and the branch', async () => {
    makeRepository(repo, env, { 'a.md': 'a', 'sub/b.md': 'b' });
    expect(await access().start()).toEqual({
      state: 'repository',
      prefix: '',
      gitDir: join(repo, '.git'),
    });
    expect(await access(join(repo, 'sub')).start()).toEqual({
      state: 'repository',
      prefix: 'sub/',
      gitDir: join(repo, '.git'),
    });
    expect(await access().info()).toEqual({ state: 'repository', branch: 'main' });
    git(repo, env, 'switch', '-q', '-c', 'feature/x');
    expect(await access().info()).toEqual({ state: 'repository', branch: 'feature/x' });
    git(repo, env, 'switch', '-q', '--detach');
    expect(await access().info()).toEqual({ state: 'repository', branch: null });
  });

  it('a worktree: git’s folder is the worktree’s own, where its HEAD and index are', async () => {
    makeRepository(repo, env, { 'a.md': 'a' });
    const tree = join(folder.path, 'tree');
    git(repo, env, 'worktree', 'add', '-q', '-b', 'side', tree);
    const at = await access(tree).start();
    expect(at).toEqual({
      state: 'repository',
      prefix: '',
      gitDir: join(repo, '.git', 'worktrees', 'tree'),
    });
    expect(await access(tree).info()).toEqual({ state: 'repository', branch: 'side' });
  });

  it('no repository, with git on the PATH and off it; no git, for what looks like one', async () => {
    writeFiles(folder.path, { 'plain/a.md': 'a' });
    makeRepository(repo, env, { 'a.md': 'a', 'sub/b.md': 'b' });
    const plain = join(folder.path, 'plain');
    const noGit = { PATH: join(folder.path, 'no-bin') };

    expect(await access(plain).start()).toEqual({ state: 'no-repository', gitFound: true });
    expect(await access(plain).info()).toEqual({ state: 'no-repository', branch: null });
    expect(await access(plain, noGit).start()).toEqual({
      state: 'no-repository',
      gitFound: false,
    });
    expect(await access(repo, noGit).info()).toEqual({ state: 'no-git', branch: null });
    expect((await access(join(repo, 'sub'), noGit).start()).state).toBe('no-git');
  });

  it('outside a repository the routes refuse, status is {}, and a base is refused', async () => {
    writeFiles(folder.path, { 'plain/a.md': 'a' });
    makeRepository(repo, env, { 'a.md': 'a' });
    const plain = access(join(folder.path, 'plain'));
    expect(await plain.changes()).toMatchObject({ ok: false, code: 'HOST_NOT_A_REPOSITORY' });
    expect(await plain.base('a.md')).toMatchObject({ ok: false, code: 'HOST_NOT_A_REPOSITORY' });
    expect(await plain.status()).toEqual({});
    const noGit = access(repo, { PATH: join(folder.path, 'no-bin') });
    expect(await noGit.changes()).toMatchObject({ ok: false, code: 'HOST_GIT_NOT_FOUND' });
    expect(await noGit.base('a.md')).toMatchObject({ ok: false, code: 'HOST_GIT_NOT_FOUND' });
    expect(await noGit.status()).toEqual({});
  });
});

describe('changes and status', () => {
  beforeEach(() => {
    makeRepository(repo, env, {
      'changed.md': lines,
      'staged.md': lines,
      'twice.md': lines,
      'deleted.md': lines,
      'removed.md': lines,
      'old.md': lines,
      'link.md': lines,
      'same.md': lines,
    });
  });

  it('maps each kind of change to its status, deleted files included', async () => {
    writeFileSync(join(repo, 'changed.md'), 'edited\n');
    writeFileSync(join(repo, 'staged.md'), 'edited\n');
    git(repo, env, 'add', 'staged.md');
    writeFileSync(join(repo, 'twice.md'), 'edited\n');
    git(repo, env, 'add', 'twice.md');
    writeFileSync(join(repo, 'twice.md'), 'edited again\n');
    rmSync(join(repo, 'deleted.md'));
    git(repo, env, 'rm', '-q', 'removed.md');
    git(repo, env, 'mv', 'old.md', 'new name.md');
    writeFiles(repo, { 'untracked.md': 'u', 'added.md': 'a', 'intent.md': 'i', 'gone.md': 'g' });
    git(repo, env, 'add', 'added.md', 'gone.md');
    git(repo, env, 'add', '-N', 'intent.md');
    rmSync(join(repo, 'gone.md'));
    rmSync(join(repo, 'link.md'));
    symlinkSync('same.md', join(repo, 'link.md'));

    expect(await changesOf()).toEqual([
      { path: 'added.md', status: 'new' },
      { path: 'changed.md', status: 'changed' },
      { path: 'deleted.md', status: 'deleted' },
      { path: 'intent.md', status: 'new' },
      { path: 'link.md', status: 'changed' },
      { path: 'new name.md', status: 'moved', from: 'old.md' },
      { path: 'removed.md', status: 'deleted' },
      { path: 'staged.md', status: 'changed' },
      { path: 'twice.md', status: 'changed' },
      { path: 'untracked.md', status: 'new' },
    ]);
    expect(await access().status()).toEqual({
      'added.md': 'new',
      'changed.md': 'changed',
      'deleted.md': 'deleted',
      'intent.md': 'new',
      'link.md': 'changed',
      'new name.md': 'moved',
      'removed.md': 'deleted',
      'staged.md': 'changed',
      'twice.md': 'changed',
      'untracked.md': 'new',
    });
  });

  it('a file in conflict is changed', async () => {
    git(repo, env, 'switch', '-q', '-c', 'other');
    writeFileSync(join(repo, 'changed.md'), 'theirs\n');
    git(repo, env, 'commit', '-q', '-am', 'theirs');
    git(repo, env, 'switch', '-q', 'main');
    writeFileSync(join(repo, 'changed.md'), 'ours\n');
    git(repo, env, 'commit', '-q', '-am', 'ours');
    expect(() => git(repo, env, 'merge', '-q', 'other')).toThrow();
    expect(await access().status()).toEqual({ 'changed.md': 'changed' });
  });

  it('a status read neither fails nor waits on a lock another git holds', async () => {
    writeFileSync(join(repo, 'changed.md'), 'edited\n');
    writeFileSync(join(repo, '.git', 'index.lock'), '');
    expect(await access().status()).toEqual({ 'changed.md': 'changed' });
  });

  it('a git failure answers {} and warns once', async () => {
    const broken = access();
    await broken.start();
    rmSync(join(repo, '.git'), { recursive: true });
    expect(await broken.status()).toEqual({});
    expect(await broken.status()).toEqual({});
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^git status failed/);
  });
});

describe('a served root inside a repository', () => {
  const sub = () => join(repo, 'sub');

  beforeEach(() => {
    makeRepository(repo, env, {
      'top.md': lines,
      'out/o.md': lines,
      'sub/a.md': lines,
      'sub/b.md': 'b only\n',
      'sub/c.md': 'c only\n',
      'sub/deep/d.md': lines,
    });
  });

  it('sees its own changes, relative to itself, and none elsewhere', async () => {
    writeFileSync(join(repo, 'top.md'), 'edited\n');
    writeFileSync(join(repo, 'out', 'o.md'), 'edited\n');
    writeFiles(repo, { 'untracked-top.md': 'u', 'sub/n.md': 'n' });
    writeFileSync(join(sub(), 'deep', 'd.md'), 'edited\n');
    expect(await changesOf(sub())).toEqual([
      { path: 'deep/d.md', status: 'changed' },
      { path: 'n.md', status: 'new' },
    ]);
  });

  it('a staged rename into it is new, out of it is deleted, inside it is moved', async () => {
    git(repo, env, 'mv', 'out/o.md', 'sub/in.md');
    git(repo, env, 'mv', 'sub/b.md', 'out/b.md');
    git(repo, env, 'mv', 'sub/a.md', 'sub/deep/a.md');
    expect(await changesOf(sub())).toEqual([
      { path: 'b.md', status: 'deleted' },
      { path: 'deep/a.md', status: 'moved', from: 'a.md' },
      { path: 'in.md', status: 'new' },
    ]);
  });

  it('a move made in a terminal is a deletion and a new file until it is staged', async () => {
    git(repo, env, 'mv', 'sub/c.md', 'sub/c-staged.md');
    writeFiles(repo, { 'out/c-plain.md': 'x' });
    rmSync(join(sub(), 'b.md'));
    writeFileSync(join(sub(), 'b2.md'), 'b only\n');
    expect(await changesOf(sub())).toEqual([
      { path: 'b.md', status: 'deleted' },
      { path: 'b2.md', status: 'new' },
      { path: 'c-staged.md', status: 'moved', from: 'c.md' },
    ]);
  });
});

describe('base: the text at HEAD', () => {
  beforeEach(() => {
    makeRepository(repo, env, {
      'a.md': 'committed\n',
      '*.md': 'a star\n',
      'sub/b.md': 'b at head\n',
      'big.txt': 'x'.repeat(MAX_TEXT_BYTES + 1),
    });
    writeFileSync(join(repo, 'bin.dat'), new Uint8Array([1, 0, 2]));
    git(repo, env, 'add', 'bin.dat');
    git(repo, env, 'commit', '-q', '-m', 'binary');
  });

  it('answers the committed text of a changed file, from the root or a subfolder', async () => {
    writeFileSync(join(repo, 'a.md'), 'edited\n');
    expect(await access().base('a.md')).toEqual({ ok: true, text: 'committed\n' });
    expect(await access(join(repo, 'sub')).base('b.md')).toEqual({
      ok: true,
      text: 'b at head\n',
    });
  });

  it('reads a path literally, not as a pattern', async () => {
    expect(await access().base('*.md')).toEqual({ ok: true, text: 'a star\n' });
  });

  it('a moved file’s base is its old path’s text, edited or not', async () => {
    const p = port();
    await p.put([{ kind: 'move', from: 'a.md', path: 'docs/renamed.md' }]);
    writeFileSync(join(repo, 'docs', 'renamed.md'), 'committed\nand edited\n');
    expect(await p.git.base('docs/renamed.md')).toEqual({ ok: true, text: 'committed\n' });
  });

  it('refuses a new file, a binary one, a large one, a missing one and a bad path', async () => {
    writeFiles(repo, { 'new.md': 'n' });
    const g = access();
    expect(await g.base('new.md')).toMatchObject({ ok: false, code: 'HOST_FILE_NOT_FOUND' });
    expect(await g.base('nothing.md')).toMatchObject({ ok: false, code: 'HOST_FILE_NOT_FOUND' });
    expect(await g.base('sub')).toMatchObject({ ok: false, code: 'HOST_FILE_NOT_FOUND' });
    expect(await g.base('bin.dat')).toMatchObject({ ok: false, code: 'HOST_NOT_TEXT' });
    expect(await g.base('big.txt')).toMatchObject({ ok: false, code: 'HOST_FILE_TOO_LARGE' });
    expect(await g.base('../a.md')).toMatchObject({ ok: false, code: 'HOST_PATH_OUTSIDE_ROOT' });
  });

  it('refuses everything before the first commit', async () => {
    const empty = join(folder.path, 'empty');
    mkdirSync(empty);
    git(empty, env, 'init', '-q');
    writeFiles(empty, { 'a.md': 'a' });
    git(empty, env, 'add', 'a.md');
    const g = access(empty);
    expect(await g.base('a.md')).toMatchObject({ ok: false, code: 'HOST_FILE_NOT_FOUND' });
    expect(await g.status()).toEqual({ 'a.md': 'new' });
    expect(await g.info()).toEqual({ state: 'repository', branch: 'main' });
  });
});

describe('staging the port’s own moves and deletes', () => {
  beforeEach(() => {
    makeRepository(repo, env, {
      '.gitignore': 'ignored/\n',
      'clean.md': lines,
      'edited.md': lines,
      'gone.md': lines,
      'gone-edited.md': lines,
      'folder/one.md': 'one\n',
      'folder/two.md': 'two\n',
      'folder/deep/three.md': 'three\n',
      'sub/s.md': lines,
    });
  });

  async function put(changes: PortChange[], p = port()) {
    const answer = await p.put(changes);
    expect(answer.ok).toBe(true);
    return p;
  }

  it('stages a move of a clean file as a rename', async () => {
    await put([{ kind: 'move', from: 'clean.md', path: 'renamed.md' }]);
    expect(staged()).toEqual(['R100\tclean.md\trenamed.md']);
    expect(unstaged()).toEqual([]);
  });

  it('a moved file with edits is still a rename, and its edits stay unstaged', async () => {
    writeFileSync(join(repo, 'edited.md'), 'nothing like the original\n');
    await put([{ kind: 'move', from: 'edited.md', path: 'moved/edited.md' }]);
    expect(staged()).toEqual(['R100\tedited.md\tmoved/edited.md']);
    expect(unstaged()).toEqual(['M\tmoved/edited.md']);
    expect(await port().status()).toEqual({ 'moved/edited.md': 'moved' });
  });

  it('stages a delete of a clean file and of a changed one', async () => {
    writeFileSync(join(repo, 'gone-edited.md'), 'edited\n');
    await put([
      { kind: 'delete', path: 'gone.md' },
      { kind: 'delete', path: 'gone-edited.md' },
    ]);
    expect(staged()).toEqual(['D\tgone-edited.md', 'D\tgone.md']);
    expect(unstaged()).toEqual([]);
  });

  it('a folder rename is one put, staged as one rename per file', async () => {
    await put([
      { kind: 'move', from: 'folder/one.md', path: 'renamed/one.md' },
      { kind: 'move', from: 'folder/two.md', path: 'renamed/two.md' },
      { kind: 'move', from: 'folder/deep/three.md', path: 'renamed/deep/three.md' },
    ]);
    expect(staged()).toEqual([
      'R100\tfolder/deep/three.md\trenamed/deep/three.md',
      'R100\tfolder/one.md\trenamed/one.md',
      'R100\tfolder/two.md\trenamed/two.md',
    ]);
  });

  it('a move into an ignored folder keeps the file tracked, as git mv does', async () => {
    const p = await put([{ kind: 'move', from: 'clean.md', path: 'ignored/clean.md' }]);
    expect(staged()).toEqual(['R100\tclean.md\tignored/clean.md']);
    // So it is still listed.
    expect((await p.list()).map((node) => node.path)).toContain('ignored/clean.md');
  });

  it('an untracked file moved or deleted stages nothing, and neither does a write or a create', async () => {
    writeFiles(repo, { 'u.md': 'u', 'v.md': 'v' });
    writeFileSync(join(repo, 'edited.md'), 'edited\n');
    git(repo, env, 'add', 'edited.md');
    writeFileSync(join(repo, 'edited.md'), 'edited again\n');
    const before = staged();
    await put([
      { kind: 'move', from: 'u.md', path: 'u2.md' },
      { kind: 'delete', path: 'v.md' },
      { kind: 'write', path: 'clean.md', content: 'saved from the editor\n' },
      { kind: 'create', path: 'created.md', content: 'new\n' },
    ]);
    expect(staged()).toEqual(before);
    expect(git(repo, env, 'ls-files', '--', 'u2.md', 'created.md')).toBe('');
  });

  it('a save and a create leave the index exactly as it was', async () => {
    git(repo, env, 'mv', 'gone.md', 'mv-by-hand.md');
    const before = git(repo, env, 'ls-files', '-s');
    const cached = staged();
    await put([{ kind: 'write', path: 'clean.md', content: 'saved\n' }]);
    await put([{ kind: 'create', path: 'fresh.md', content: 'fresh\n' }]);
    expect(staged()).toEqual(cached);
    expect(git(repo, env, 'ls-files', '-s')).toBe(before);
  });

  it('stages under a served subfolder with the paths git wants', async () => {
    await put([{ kind: 'move', from: 's.md', path: 'deeper/s.md' }], port(join(repo, 'sub')));
    expect(staged()).toEqual(['R100\tsub/s.md\tsub/deeper/s.md']);
    await put([{ kind: 'delete', path: 'deeper/s.md' }], port(join(repo, 'sub')));
    expect(staged()).toEqual(['D\tsub/s.md']);
  });

  it('when staging fails the write stands, put succeeds, and the port warns', async () => {
    writeFileSync(join(repo, '.git', 'index.lock'), '');
    const p = port();
    expect(await p.put([{ kind: 'delete', path: 'gone.md' }])).toEqual({ ok: true, versions: {} });
    rmSync(join(repo, '.git', 'index.lock'));
    expect(staged()).toEqual([]);
    expect(await p.status()).toEqual({ 'gone.md': 'deleted' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/could not stage/);
  });

  it('outside a repository, and with git off the PATH, a move or delete stages nothing', async () => {
    const noGit = port(repo, { PATH: join(folder.path, 'no-bin') });
    await put([{ kind: 'move', from: 'clean.md', path: 'by-walk.md' }], noGit);
    expect(staged()).toEqual([]);
    expect(await noGit.status()).toEqual({});
    writeFiles(folder.path, { 'plain/a.md': 'a' });
    const plain = port(join(folder.path, 'plain'));
    await put([{ kind: 'delete', path: 'a.md' }], plain);
    expect(warnings).toEqual([]);
  });
});
