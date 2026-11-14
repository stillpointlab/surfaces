// The commit over real temporary repositories, through the port (which holds the
// write lock): chosen paths only, with other staged work left alone; the host's
// own moves and deletes; a served subfolder; a new branch; each refusal; a
// failing, a hanging and a missing-identity commit leaving everything as it was.
// Every repository sets its own identity and branch and reads no global
// configuration (`test-support.ts`). The commit's pure parts are tested first.

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createNodePort } from '../port';
import { git, gitEnv, makeRepository, tempFolder, writeFiles } from '../test-support';

import {
  MAX_SAID,
  branchProblem,
  choosePaths,
  gitSaid,
  readRequest,
  refsInProgress,
} from './commit';

import type { NodePort } from '../port';
import type { HostCommit, HostCommitRequest } from '@stillpointlab/common-format/host';

describe('the request', () => {
  it('checks the shape, then asks for paths and a message', () => {
    expect(readRequest(null)).toMatchObject({ ok: false, code: 'HOST_BAD_REQUEST' });
    expect(readRequest({ paths: 'a.md', message: 'm' })).toMatchObject({
      code: 'HOST_BAD_REQUEST',
    });
    expect(readRequest({ paths: [1], message: 'm' })).toMatchObject({ code: 'HOST_BAD_REQUEST' });
    expect(readRequest({ paths: ['a'], message: 3 })).toMatchObject({ code: 'HOST_BAD_REQUEST' });
    expect(readRequest({ paths: ['a'], message: 'm', branch: 3 })).toMatchObject({
      code: 'HOST_BAD_REQUEST',
    });
    expect(readRequest({ paths: [], message: 'm' })).toMatchObject({
      code: 'HOST_COMMIT_NO_PATHS',
    });
    expect(readRequest({ paths: ['a'], message: ' \n\t ' })).toMatchObject({
      code: 'HOST_COMMIT_NO_MESSAGE',
    });
    expect(readRequest({ paths: ['a', 'b', 'a'], message: '-m x', branch: 'f' })).toEqual({
      paths: ['a', 'b'],
      message: '-m x',
      branch: 'f',
    });
  });
});

describe('which paths a commit takes', () => {
  const changes = [
    { path: 'a.md', status: 'changed' as const },
    { path: 'new/b.md', status: 'moved' as const, from: 'b.md' },
    { path: 'gone.md', status: 'deleted' as const },
  ];

  it('both halves of a move, whichever was chosen', () => {
    expect(choosePaths(changes, ['new/b.md'])).toEqual({
      paths: ['new/b.md', 'b.md'],
      unchanged: [],
    });
    expect(choosePaths(changes, ['b.md', 'gone.md'])).toEqual({
      paths: ['new/b.md', 'b.md', 'gone.md'],
      unchanged: [],
    });
  });

  it('names a path that is not a change', () => {
    expect(choosePaths(changes, ['a.md', 'clean.md'])).toEqual({
      paths: ['a.md'],
      unchanged: ['clean.md'],
    });
  });
});

describe('the new branch’s name', () => {
  const refs = [
    'refs/heads/main',
    'refs/heads/Feature',
    'refs/heads/team/a',
    'refs/remotes/origin/main',
    'refs/remotes/origin/shared',
  ];
  const problem = (name: string, formatted: string | null = name) =>
    branchProblem(name, formatted, refs, ['origin'])?.code ?? null;

  it('takes a new name', () => {
    expect(problem('topic/x')).toBeNull();
    expect(problem('héllo')).toBeNull();
  });

  it('refuses what git refuses, what git would expand, and “@”', () => {
    expect(problem('a b', null)).toBe('HOST_BRANCH_INVALID');
    expect(problem('@{-1}', 'main')).toBe('HOST_BRANCH_INVALID');
    expect(problem('@')).toBe('HOST_BRANCH_INVALID');
  });

  it('refuses a branch that exists, by case too, as a folder of one, or on a remote', () => {
    expect(problem('main')).toBe('HOST_BRANCH_EXISTS');
    expect(branchProblem('feature', 'feature', refs, ['origin'])?.message).toMatch(
      /"Feature", which differs only in case/
    );
    expect(problem('team')).toBe('HOST_BRANCH_EXISTS');
    expect(problem('main/x')).toBe('HOST_BRANCH_EXISTS');
    expect(branchProblem('shared', 'shared', refs, ['origin'])?.message).toMatch(
      /on "origin" \(origin\/shared\)/
    );
  });
});

describe('what git said', () => {
  it('standard error, then standard output, trimmed', () => {
    const run = {
      ok: false as const,
      missing: false,
      exitCode: 1,
      stderr: 'err\n',
      stdout: 'out\n',
    };
    expect(gitSaid(run)).toBe('err\nout');
  });

  it('keeps the start and the end of very long output, and says what was left out', () => {
    const stderr = `first line\n${'x'.repeat(MAX_SAID * 3)}\nfatal: the useful line`;
    const said = gitSaid({ ok: false, missing: false, exitCode: 1, stderr });
    expect(said.length).toBeLessThan(MAX_SAID + 100);
    expect(said.startsWith('first line\n')).toBe(true);
    expect(said.endsWith('fatal: the useful line')).toBe(true);
    expect(said).toMatch(/… \([\d,]+ characters left out\) …/);
  });

  it('reads which operation git has in progress', () => {
    const oid = 'a'.repeat(40);
    expect(
      refsInProgress(`${oid} commit 200\nCHERRY_PICK_HEAD missing\nREVERT_HEAD missing\n`)
    ).toEqual(['merge']);
    expect(
      refsInProgress('MERGE_HEAD missing\nCHERRY_PICK_HEAD missing\nREVERT_HEAD missing\n')
    ).toEqual([]);
  });
});

// ---- over real repositories ----

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

function port(
  root = repo,
  options: { env?: NodeJS.ProcessEnv; commitTimeoutMs?: number } = {}
): NodePort {
  return createNodePort({
    root,
    env: options.env ?? env,
    warn: (m) => warnings.push(m),
    commitTimeoutMs: options.commitTimeoutMs,
  });
}

async function commit(request: HostCommitRequest, on: NodePort = port()): Promise<HostCommit> {
  const answer = await on.commit(request);
  if (!answer.ok) throw new Error(`${answer.code}: ${answer.message}`);
  return answer;
}

const run = (...args: string[]) => git(repo, env, ...args);
/** A git command expected to fail (a conflict), its words kept off the test's output. */
const fails = (...args: string[]) =>
  expect(() =>
    execFileSync('git', args, { cwd: repo, env, stdio: 'pipe', encoding: 'utf8' })
  ).toThrow();
/** The last commit's files, as `--name-status` with renames. */
const lastCommit = (cwd = repo) =>
  git(cwd, env, 'show', '--format=', '--name-status', '-M', 'HEAD').trim().split('\n');
const staged = (cwd = repo) =>
  git(cwd, env, 'diff', '--cached', '--name-status', '-M').trim().split('\n').filter(Boolean);
const unstaged = (cwd = repo) =>
  git(cwd, env, 'diff', '--name-status').trim().split('\n').filter(Boolean);
const untracked = (cwd = repo) =>
  git(cwd, env, 'ls-files', '--others', '--exclude-standard').trim().split('\n').filter(Boolean);
/** Everything a failed commit must leave as it was. */
const snapshot = (cwd = repo) => ({
  head: git(cwd, env, 'rev-parse', 'HEAD'),
  branch: git(cwd, env, 'symbolic-ref', '-q', 'HEAD'),
  branches: git(cwd, env, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads'),
  index: git(cwd, env, 'ls-files', '-s'),
  status: git(cwd, env, 'status', '--porcelain=v2', '--untracked-files=all'),
});

describe('a commit of chosen paths', () => {
  beforeEach(() => {
    makeRepository(repo, env, {
      'a.md': 'a\n',
      'b.md': 'b\n',
      'staged.md': 's\n',
      'docs/one.md': 'one\n',
      'docs/two.md': 'two\n',
      'old.md': 'line 1\nline 2\nline 3\nline 4\n',
    });
  });

  it('commits those paths alone, leaving other staged and unstaged work as it was', async () => {
    writeFiles(repo, { 'a.md': 'a, edited\n', 'b.md': 'b, edited\n', 'n.md': 'new\n' });
    writeFiles(repo, { 'staged.md': 's, staged\n', 'left.md': 'not chosen\n' });
    run('add', 'staged.md');

    const answer = await commit({ paths: ['a.md', 'n.md'], message: 'Two files' });

    expect(answer.branch).toBe('main');
    expect(answer.commit).toBe(run('rev-parse', 'HEAD').trim());
    expect(answer.short).toBe(run('rev-parse', '--short', 'HEAD').trim());
    expect(lastCommit()).toEqual(['M\ta.md', 'A\tn.md']);
    expect(run('log', '-1', '--format=%B').trim()).toBe('Two files');
    expect(staged()).toEqual(['M\tstaged.md']);
    expect(unstaged()).toEqual(['M\tb.md']);
    expect(untracked()).toEqual(['left.md']);
  });

  it('commits the work tree’s content of a path with staged and unstaged parts', async () => {
    writeFiles(repo, { 'a.md': 'staged\n' });
    run('add', 'a.md');
    writeFiles(repo, { 'a.md': 'on disk\n' });
    await commit({ paths: ['a.md'], message: 'm' });
    expect(run('show', 'HEAD:a.md')).toBe('on disk\n');
    expect(staged()).toEqual([]);
    expect(unstaged()).toEqual([]);
  });

  it('a move and a delete the host staged, a move with edits, from either half', async () => {
    const p = port();
    await p.put([
      { kind: 'move', from: 'old.md', path: 'moved/new.md' },
      { kind: 'delete', path: 'b.md' },
    ]);
    writeFiles(repo, { 'moved/new.md': 'line 1\nline 2\nline 3\nline 4, edited\n' });

    await commit({ paths: ['moved/new.md'], message: 'move' }, p);
    expect(lastCommit()).toEqual([expect.stringMatching(/^R\d+\told\.md\tmoved\/new\.md$/)]);
    expect(run('show', 'HEAD:moved/new.md')).toBe('line 1\nline 2\nline 3\nline 4, edited\n');
    expect(staged()).toEqual(['D\tb.md']);

    await p.put([{ kind: 'move', from: 'a.md', path: 'a2.md' }]);
    // The old half alone still commits the whole move.
    await commit({ paths: ['a.md', 'b.md'], message: 'old half' }, p);
    expect(lastCommit()).toEqual(['R100\ta.md\ta2.md', 'D\tb.md']);
    expect(staged()).toEqual([]);
  });

  it('one file of a renamed folder, the rest left staged as renames', async () => {
    const p = port();
    await p.put([
      { kind: 'move', from: 'docs/one.md', path: 'notes/one.md' },
      { kind: 'move', from: 'docs/two.md', path: 'notes/two.md' },
    ]);
    await commit({ paths: ['notes/one.md'], message: 'one' }, p);
    expect(lastCommit()).toEqual(['R100\tdocs/one.md\tnotes/one.md']);
    expect(staged()).toEqual(['R100\tdocs/two.md\tnotes/two.md']);
  });

  it('a file the host moved into an ignored folder', async () => {
    writeFiles(repo, { '.gitignore': 'ignored/\n' });
    run('add', '.gitignore');
    run('commit', '-q', '-m', 'ignore');
    const p = port();
    await p.put([{ kind: 'move', from: 'a.md', path: 'ignored/a.md' }]);
    await commit({ paths: ['ignored/a.md'], message: 'into ignored' }, p);
    expect(lastCommit()).toEqual(['R100\ta.md\tignored/a.md']);
  });

  it('takes paths literally: a leading dash, a glob, a colon, magic, a space, a newline', async () => {
    const names = [
      '-dash.md',
      'star*.md',
      'col:on.md',
      ':(exclude)a.md',
      'sp ace.md',
      'new\nline.md',
    ];
    writeFiles(repo, Object.fromEntries(names.map((name) => [name, `${name}\n`])));
    writeFiles(repo, { 'star-not-chosen.md': 'x\n' });
    await commit({ paths: names, message: 'odd names' });
    const committed = run('show', '--format=', '--name-only', '-z', 'HEAD')
      .split('\0')
      .filter(Boolean);
    expect(committed.sort()).toEqual([...names].sort());
    expect(untracked()).toEqual(['star-not-chosen.md']);
  });

  it('passes the message as it is: a leading dash, several lines, a # line kept', async () => {
    writeFiles(repo, { 'a.md': 'edited\n' });
    const message = '-m starts with a dash  \n\n# not a comment\nbody line\n\n\n';
    await commit({ paths: ['a.md'], message });
    expect(run('log', '-1', '--format=%B')).toBe(
      '-m starts with a dash\n\n# not a comment\nbody line\n\n'
    );
  });

  it('the first commit of a repository, on the current branch or a new one', async () => {
    const empty = join(folder.path, 'empty');
    makeEmpty(empty);
    writeFiles(empty, { 'a.md': 'a\n', 'b.md': 'b\n' });
    const p = port(empty);
    expect(await commit({ paths: ['a.md'], message: 'first' }, p)).toMatchObject({
      branch: 'main',
    });
    expect(git(empty, env, 'ls-tree', '--name-only', 'HEAD')).toBe('a.md\n');

    const other = join(folder.path, 'other');
    makeEmpty(other);
    writeFiles(other, { 'a.md': 'a\n' });
    expect(
      await commit({ paths: ['a.md'], message: 'first', branch: 'topic' }, port(other))
    ).toMatchObject({
      branch: 'topic',
    });
    expect(git(other, env, 'symbolic-ref', '--short', 'HEAD')).toBe('topic\n');
  });
});

function makeEmpty(path: string): void {
  git(folder.path, env, 'init', '-q', path);
}

describe('a served folder inside a repository', () => {
  it('commits only its own paths, and leaves what is staged outside it staged', async () => {
    makeRepository(repo, env, { 'out.md': 'o\n', 'sub/a.md': 'a\n', 'sub/x.md': 'x\n' });
    writeFiles(repo, { 'out.md': 'o, staged\n' });
    run('add', 'out.md');
    run('mv', 'sub/x.md', 'elsewhere.md');
    writeFiles(repo, { 'sub/a.md': 'a, edited\n', 'sub/n.md': 'n\n' });
    const sub = join(repo, 'sub');

    // The rename out of the folder is, from inside it, a deletion.
    expect(await port(sub).git.changes()).toMatchObject({
      changes: [
        { path: 'a.md', status: 'changed' },
        { path: 'n.md', status: 'new' },
        { path: 'x.md', status: 'deleted' },
      ],
    });
    await commit({ paths: ['a.md', 'n.md', 'x.md'], message: 'sub' }, port(sub));
    expect(lastCommit()).toEqual(['M\tsub/a.md', 'A\tsub/n.md', 'D\tsub/x.md']);
    expect(staged()).toEqual(['A\telsewhere.md', 'M\tout.md']);
  });
});

describe('a new branch', () => {
  beforeEach(() => makeRepository(repo, env, { 'a.md': 'a\n', 'b.md': 'b\n' }));

  it('carries the work across and commits on it; the branch it left is as it was', async () => {
    const before = run('rev-parse', 'main');
    writeFiles(repo, { 'a.md': 'a, edited\n', 'b.md': 'b, edited\n' });
    const answer = await commit({ paths: ['a.md'], message: 'on a branch', branch: 'topic/x' });
    expect(answer.branch).toBe('topic/x');
    expect(run('symbolic-ref', '--short', 'HEAD')).toBe('topic/x\n');
    expect(run('rev-parse', 'main')).toBe(before);
    expect(run('rev-parse', 'topic/x^')).toBe(before);
    expect(unstaged()).toEqual(['M\tb.md']);
  });

  it('from a detached HEAD, which needs one', async () => {
    run('switch', '-q', '--detach');
    writeFiles(repo, { 'a.md': 'edited\n' });
    expect(await port().commit({ paths: ['a.md'], message: 'm' })).toMatchObject({
      ok: false,
      code: 'HOST_DETACHED_HEAD',
    });
    expect(await commit({ paths: ['a.md'], message: 'm', branch: 'rescued' })).toMatchObject({
      branch: 'rescued',
    });
  });

  it('refuses a name git refuses, one that exists, one that differs by case, one on a remote', async () => {
    run('branch', 'Taken');
    run('remote', 'add', 'origin', 'https://example.invalid/repo.git');
    run('update-ref', 'refs/remotes/origin/theirs', 'HEAD');
    writeFiles(repo, { 'a.md': 'edited\n' });
    const before = snapshot();
    const refused = async (branch: string) =>
      port().commit({ paths: ['a.md'], message: 'm', branch });
    expect(await refused('a b')).toMatchObject({ code: 'HOST_BRANCH_INVALID' });
    expect(await refused('-x')).toMatchObject({ code: 'HOST_BRANCH_INVALID' });
    expect(await refused('@{-1}')).toMatchObject({ code: 'HOST_BRANCH_INVALID' });
    expect(await refused('main')).toMatchObject({ code: 'HOST_BRANCH_EXISTS' });
    expect(await refused('taken')).toMatchObject({ code: 'HOST_BRANCH_EXISTS' });
    expect(await refused('theirs')).toMatchObject({ code: 'HOST_BRANCH_EXISTS' });
    expect(snapshot()).toEqual(before);
  });
});

describe('refusals', () => {
  beforeEach(() => makeRepository(repo, env, { 'a.md': 'a\n', 'c.md': 'base\n' }));

  it('no path, no message, a path that is not changed, a path outside the root', async () => {
    writeFiles(repo, { 'a.md': 'edited\n' });
    const p = port();
    expect(await p.commit({ paths: [], message: 'm' })).toMatchObject({
      code: 'HOST_COMMIT_NO_PATHS',
    });
    expect(await p.commit({ paths: ['a.md'], message: '  ' })).toMatchObject({
      code: 'HOST_COMMIT_NO_MESSAGE',
    });
    expect(await p.commit({ paths: ['a.md', 'c.md'], message: 'm' })).toMatchObject({
      code: 'HOST_NOT_CHANGED',
      message: expect.stringContaining('"c.md"'),
    });
    expect(await p.commit({ paths: ['../a.md'], message: 'm' })).toMatchObject({
      code: 'HOST_PATH_OUTSIDE_ROOT',
    });
    expect(await p.commit({ paths: ['.git/config'], message: 'm' })).toMatchObject({
      code: 'HOST_PATH_OUTSIDE_ROOT',
    });
    expect(run('rev-list', '--count', 'HEAD')).toBe('1\n');
  });

  it('outside a repository', async () => {
    const plain = join(folder.path, 'plain');
    writeFiles(plain, { 'a.md': 'a' });
    expect(await port(plain).commit({ paths: ['a.md'], message: 'm' })).toMatchObject({
      code: 'HOST_NOT_A_REPOSITORY',
    });
  });

  /** Two branches that change c.md differently, `main` checked out. */
  function diverge(): void {
    run('switch', '-q', '-c', 'side');
    writeFiles(repo, { 'c.md': 'side\n' });
    run('commit', '-q', '-am', 'side');
    run('switch', '-q', 'main');
    writeFiles(repo, { 'c.md': 'main\n' });
    run('commit', '-q', '-am', 'main');
  }

  it('a merge, a cherry-pick, a revert or a rebase in progress', async () => {
    diverge();
    const attempt = async (expected: RegExp) => {
      writeFiles(repo, { 'a.md': `edited ${Math.random()}\n` });
      const answer = await port().commit({ paths: ['a.md'], message: 'm' });
      expect(answer).toMatchObject({ ok: false, code: 'HOST_GIT_IN_PROGRESS' });
      expect(!answer.ok && answer.message).toMatch(expected);
    };

    fails('merge', '-q', 'side');
    await attempt(/A merge is in progress/);
    run('merge', '--abort');

    fails('cherry-pick', 'side');
    await attempt(/A cherry-pick is in progress/);
    run('cherry-pick', '--abort');

    run('revert', '--no-edit', 'HEAD');
    writeFiles(repo, { 'c.md': 'main again\n' });
    run('commit', '-q', '-am', 'main again');
    fails('revert', '--no-edit', 'HEAD~1');
    await attempt(/A revert is in progress/);
    run('revert', '--abort');

    run('checkout', '-q', '--', 'a.md');
    run('switch', '-q', 'side');
    fails('rebase', 'main');
    await attempt(/A rebase \(or git am\) is in progress/);
    run('rebase', '--abort');
  });

  it('a path in conflict outside a merge (a stash that did not apply cleanly)', async () => {
    writeFiles(repo, { 'c.md': 'stashed\n' });
    run('stash', '-q');
    writeFiles(repo, { 'c.md': 'committed\n' });
    run('commit', '-q', '-am', 'meanwhile');
    fails('stash', 'pop', '-q');
    expect(await port().commit({ paths: ['c.md'], message: 'm' })).toMatchObject({
      code: 'HOST_PATH_CONFLICTED',
    });
  });
});

describe('a commit git refuses leaves everything as it was', () => {
  beforeEach(() => makeRepository(repo, env, { 'a.md': 'a\n', 'b.md': 'b\n' }));

  function hook(script: string): void {
    const path = join(repo, '.git', 'hooks', 'pre-commit');
    writeFileSync(path, `#!/bin/sh\n${script}\n`);
    chmodSync(path, 0o755);
  }

  /** Work of every kind: an edit, a new file, a move and a delete the host staged, a staged edit. */
  async function work(p: NodePort): Promise<void> {
    writeFiles(repo, { 'a.md': 'a, edited\n', 'n.md': 'new\n' });
    await p.put([{ kind: 'move', from: 'b.md', path: 'moved/b.md' }]);
  }

  it('a failing pre-commit hook: its words, and the tree, index and branch as they were', async () => {
    hook('echo "lint: a.md: line 1 is too short"\necho "lint failed" >&2\nexit 1');
    const p = port();
    await work(p);
    const before = snapshot();
    const answer = await p.commit({ paths: ['a.md', 'n.md', 'moved/b.md'], message: 'm' });
    expect(answer).toMatchObject({ ok: false, code: 'HOST_GIT_FAILED' });
    const message = answer.ok ? '' : answer.message;
    expect(message).toMatch(
      /^git commit failed \(exit 1\)\. Nothing was committed, and you are still on main\. git said:\n/
    );
    expect(message).toContain('lint: a.md: line 1 is too short');
    expect(message).toContain('lint failed');
    expect(snapshot()).toEqual(before);
    expect(readFileSync(join(repo, 'a.md'), 'utf8')).toBe('a, edited\n');
  });

  it('on a new branch: back on the branch it started from, and the new one gone', async () => {
    hook('exit 1');
    const p = port();
    await work(p);
    const before = snapshot();
    const answer = await p.commit({ paths: ['a.md', 'n.md'], message: 'm', branch: 'topic' });
    expect(answer).toMatchObject({ ok: false, code: 'HOST_GIT_FAILED' });
    expect(!answer.ok && answer.message).toMatch(
      /Nothing was committed, and you are still on main\./
    );
    expect(snapshot()).toEqual(before);
  });

  it('no identity set: git’s own words, and nothing changed', async () => {
    // As on a fresh machine: no identity in the environment or in any configuration,
    // and none guessed from the host name (whatever this machine's own setup is).
    const bare: NodeJS.ProcessEnv = {
      ...env,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'user.useConfigOnly',
      GIT_CONFIG_VALUE_0: 'true',
    };
    for (const name of [
      'GIT_AUTHOR_NAME',
      'GIT_AUTHOR_EMAIL',
      'GIT_COMMITTER_NAME',
      'GIT_COMMITTER_EMAIL',
      'EMAIL',
    ]) {
      delete bare[name];
    }
    const p = port(repo, { env: bare });
    await work(p);
    const before = snapshot();
    const answer = await p.commit({ paths: ['a.md', 'n.md'], message: 'm' });
    expect(answer).toMatchObject({ ok: false, code: 'HOST_GIT_FAILED' });
    expect(!answer.ok && answer.message).toMatch(/Please tell me who you are/);
    expect(snapshot()).toEqual(before);
  });

  it('a hook that never finishes is stopped at the timeout, with what it is running', async () => {
    const pidFile = join(folder.path, 'hook-child.pid');
    hook(`echo "waiting for an answer" >&2\nsleep 60 &\necho $! > '${pidFile}'\nwait`);
    const p = port(repo, { commitTimeoutMs: 1000 });
    await work(p);
    const before = snapshot();
    const answer = await p.commit({ paths: ['a.md'], message: 'm' });
    expect(answer).toMatchObject({ ok: false, code: 'HOST_GIT_FAILED' });
    expect(!answer.ok && answer.message).toMatch(
      /^git commit did not finish within 1 second \(a hook or signing may be waiting for input\), so it was stopped\. Nothing was committed, and you are still on main\. git said:\nwaiting for an answer/
    );
    expect(snapshot()).toEqual(before);
    expect(existsSync(join(repo, '.git', 'index.lock'))).toBe(false);
    // The hook's own child went with it.
    const child = Number(readFileSync(pidFile, 'utf8'));
    expect(() => process.kill(child, 0)).toThrow();
  });

  it('a signature that would ask on a terminal fails at once, with no terminal to ask on', async () => {
    const gpg = join(folder.path, 'fake-gpg');
    writeFileSync(
      gpg,
      '#!/bin/sh\necho "asking for a passphrase" >&2\nread answer < /dev/tty\nexit 0\n'
    );
    chmodSync(gpg, 0o755);
    run('config', 'commit.gpgsign', 'true');
    run('config', 'gpg.program', gpg);
    writeFiles(repo, { 'a.md': 'edited\n' });
    const before = snapshot();
    const answer = await port(repo, { commitTimeoutMs: 20_000 }).commit({
      paths: ['a.md'],
      message: 'm',
    });
    expect(answer).toMatchObject({ ok: false, code: 'HOST_GIT_FAILED' });
    expect(!answer.ok && answer.message).toMatch(/^git commit failed \(exit 128\)\./);
    expect(!answer.ok && answer.message).toMatch(/gpg failed to sign/);
    expect(snapshot()).toEqual(before);
  });
});

describe('the write lock', () => {
  it('a put that arrives during a commit waits for it', async () => {
    makeRepository(repo, env, { 'a.md': 'a\n' });
    const started = join(folder.path, 'hook-started');
    const release = join(folder.path, 'release');
    const seen = join(folder.path, 'seen');
    const path = join(repo, '.git', 'hooks', 'pre-commit');
    writeFileSync(
      path,
      `#!/bin/sh\ntouch '${started}'\nwhile [ ! -e '${release}' ]; do sleep 0.02; done\ncat a.md > '${seen}'\n`
    );
    chmodSync(path, 0o755);
    writeFiles(repo, { 'a.md': 'a, committed\n' });
    const p = port();
    const order: string[] = [];
    const committing = p.commit({ paths: ['a.md'], message: 'm' }).then((answer) => {
      order.push('commit');
      return answer;
    });
    await vi.waitFor(() => expect(existsSync(started)).toBe(true), { timeout: 5000 });
    const putting = p
      .put([{ kind: 'write', path: 'a.md', content: 'a, written during the commit\n' }])
      .then((answer) => {
        order.push('put');
        return answer;
      });
    // The put cannot land while the hook holds the commit.
    const first = await Promise.race([
      putting.then(() => 'put'),
      new Promise((done) => setTimeout(() => done('still waiting'), 300)),
    ]);
    expect(first).toBe('still waiting');
    writeFileSync(release, '');
    expect(await committing).toMatchObject({ ok: true });
    expect(await putting).toMatchObject({ ok: true });
    expect(order).toEqual(['commit', 'put']);
    expect(readFileSync(seen, 'utf8')).toBe('a, committed\n');
    expect(run('show', 'HEAD:a.md')).toBe('a, committed\n');
  });
});
