// The host's git: whether the served folder is in a repository (decided once),
// the branch, what changed, a file's text at `HEAD`, and staging the host's own
// moves and deletes. With `run.ts`, the only code that runs git.
//
// The served root may be a folder inside a repository. Every path here is
// relative to the root, as the port's are; git is given them relative to the root
// (it runs there) or, where it wants paths from the top (`--index-info`), with the
// root's prefix. Every command that takes paths reads them literally
// (`--literal-pathspecs`), so a file named `*.md` or `:(exclude)x` is that file.
//
// Reads pass `GIT_OPTIONAL_LOCKS=0`: a status never takes the index lock, so it
// neither waits on a person's own git nor writes the index, which would raise a
// `status` event of its own. Staging and the commit are the writes. Staging may
// fail on the lock; the port's write stands, and the port warns. The commit
// (`commit.ts` says what it runs) takes no lock of the host's own: the port runs
// it under its write lock, so it never interleaves with a `put`.

import { lstat, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { fail, ok } from '@stillpointlab/common-format/app';

import { COMMIT_TIMEOUT_MS, MAX_TEXT_BYTES } from '../limits';
import { pathProblem } from '../paths';
import { decodeText } from '../text';

import {
  PROGRESS_FOLDERS,
  PROGRESS_REFS,
  branchProblem,
  choosePaths,
  gitSaid,
  inProgressRefusal,
  readRequest,
  refsInProgress,
} from './commit';
import { runGit } from './run';
import { chunkPaths, parseIndexEntries, stagedSources, stagingPlan } from './stage';
import { changesFromStatus, parseStatusEntries, withIndexRemovals } from './status';

import type { GitRun } from './run';
import type { Failure, Result } from '@stillpointlab/common-format/app';
import type {
  FileStatus,
  GitState,
  HostChange,
  HostCommit,
  HostCommitRequest,
  HostGit,
  PortChange,
} from '@stillpointlab/common-format/host';

/** What the host learned about git when it started. */
export type GitStart =
  | {
      state: 'repository';
      /** The root's path from the work tree's top: `''`, or ending in `/`. */
      prefix: string;
      /** git's own folder, absolute: where `HEAD` and `index` are (in a worktree, its own). */
      gitDir: string;
    }
  | {
      state: 'no-repository';
      /** Whether `git` could be run at all. */
      gitFound: boolean;
    }
  | { state: 'no-git' };

export interface GitOptions {
  /** The served root's real path. */
  root: string;
  /** The environment `git` runs in; the process's own by default. */
  env?: NodeJS.ProcessEnv;
  /** Something git could not do that the host works without. */
  warn?(message: string): void;
  /** How long a commit may run, hooks and signing included: `COMMIT_TIMEOUT_MS` by default. */
  commitTimeoutMs?: number;
}

export type StageResult = { ok: true; staged: string[] } | { ok: false; message: string };

export interface HostGitAccess {
  /** Decided once: the first call asks git, later calls answer the same. */
  start(): Promise<GitStart>;
  /** `{ state, branch }`; the branch is read each time. */
  info(): Promise<HostGit>;
  /** What differs from `HEAD` under the root, deleted files included, or the state's refusal. */
  changes(): Promise<Result<{ changes: HostChange[] }>>;
  /** The changes by path, for the tree's marks: `{}` outside `repository`, and when git fails. */
  status(): Promise<Record<string, FileStatus>>;
  /** A file's text at `HEAD`, found under its old path when it was moved. */
  base(path: string): Promise<Result<{ text: string }>>;
  /** Stage the moves and deletes in changes the port has written. Nothing else is staged. */
  stage(changes: readonly PortChange[]): Promise<StageResult>;
  /**
   * Commit the chosen paths, and nothing else, on the current branch or a new
   * one. Takes no lock: run it through the port (`NodePort.commit`), which holds
   * its write lock around it. The request may come from a body: it is checked.
   */
  commit(request: HostCommitRequest): Promise<Result<HostCommit>>;
}

/** The refusal for a route that needs a repository, by state. */
export function notARepository(state: GitState): Failure {
  return state === 'no-git'
    ? fail('HOST_GIT_NOT_FOUND', 'git was not found, so changes and commit are off.')
    : fail('HOST_NOT_A_REPOSITORY', 'The served folder is not in a git repository.');
}

const keep = (path: string) => pathProblem(path) === null;

export function createGit(options: GitOptions): HostGitAccess {
  const { root, env } = options;
  const warn = options.warn ?? ((message: string) => console.warn(`surfaces: ${message}`));
  let started: Promise<GitStart> | null = null;
  /** The last status failure warned about, so a broken repository warns once, not per read. */
  let warned: string | null = null;

  const read = (args: readonly string[]): Promise<GitRun> =>
    runGit(['--literal-pathspecs', ...args], { cwd: root, env, read: true });

  function start(): Promise<GitStart> {
    started ??= (async (): Promise<GitStart> => {
      const inside = await read(['rev-parse', '--is-inside-work-tree']);
      if (inside.ok && inside.stdout.toString('utf8').trim() === 'true') {
        const where = await read(['rev-parse', '--show-prefix', '--absolute-git-dir']);
        if (where.ok) {
          const [prefix, gitDir] = where.stdout.toString('utf8').split('\n');
          if (gitDir) return { state: 'repository', prefix, gitDir };
        }
        warn(`git could not say where the repository is; working without git.`);
        return { state: 'no-repository', gitFound: true };
      }
      if (!inside.ok && inside.missing) {
        return (await hasGitEntryAbove(root))
          ? { state: 'no-git' }
          : { state: 'no-repository', gitFound: false };
      }
      return { state: 'no-repository', gitFound: true };
    })();
    return started;
  }

  async function info(): Promise<HostGit> {
    const at = await start();
    if (at.state !== 'repository') return { state: at.state, branch: null };
    // Exit 1, quietly, when `HEAD` is detached.
    const run = await read(['symbolic-ref', '--quiet', '--short', 'HEAD']);
    const branch = run.ok ? run.stdout.toString('utf8').trim() : '';
    return { state: 'repository', branch: branch === '' ? null : branch };
  }

  async function changes(): Promise<Result<{ changes: HostChange[] }>> {
    const read = await readChanges();
    return read.ok ? ok({ changes: read.changes }) : read;
  }

  /** The changes, and which of their paths git does not track (`?` in the status). */
  async function readChanges(): Promise<Result<{ changes: HostChange[]; untracked: Set<string> }>> {
    const at = await start();
    if (at.state !== 'repository') return notARepository(at.state);
    const status = await read([
      'status',
      '--porcelain=v2',
      '-z',
      '--untracked-files=all',
      '--ignore-submodules=all',
      '--',
      '.',
    ]);
    if (!status.ok) return gitFailed('git status', status);
    const entries = parseStatusEntries(status.stdout.toString('utf8'));
    let found = changesFromStatus(entries, at.prefix, keep);
    const untracked = new Set(
      entries
        .filter((entry) => entry.kind === '?' && entry.path.startsWith(at.prefix))
        .map((entry) => entry.path.slice(at.prefix.length))
    );
    if (at.prefix !== '') {
      // Limited to the root, status leaves out a rename whose new path is outside
      // it; the index still shows its old path removed. (Fails without a first
      // commit, when there is nothing to have removed.)
      const removed = await read([
        'diff-index',
        '--cached',
        '-z',
        '--name-only',
        '--no-renames',
        '--diff-filter=D',
        '--ignore-submodules=all',
        'HEAD',
        '--',
        '.',
      ]);
      if (removed.ok) {
        const paths = removed.stdout.toString('utf8').split('\0').filter(Boolean);
        found = withIndexRemovals(found, paths, at.prefix, keep);
      }
    }
    return ok({ changes: found, untracked });
  }

  async function status(): Promise<Record<string, FileStatus>> {
    const answer = await changes();
    if (!answer.ok) {
      if (answer.code === 'HOST_GIT_FAILED' && warned !== answer.message) {
        warned = answer.message;
        warn(answer.message);
      }
      return {};
    }
    warned = null;
    return Object.fromEntries(answer.changes.map((change) => [change.path, change.status]));
  }

  async function base(path: string): Promise<Result<{ text: string }>> {
    const at = await start();
    if (at.state !== 'repository') return notARepository(at.state);
    const problem = pathProblem(path);
    if (problem !== null) {
      return fail('HOST_PATH_OUTSIDE_ROOT', `${JSON.stringify(path)} is not usable: ${problem}`);
    }
    // A moved file was at its old path in the last commit.
    const listed = await changes();
    if (!listed.ok) return listed;
    const change = listed.changes.find((c) => c.path === path);
    const headPath = change?.from ?? path;
    const notInHead = fail(
      'HOST_FILE_NOT_FOUND',
      `${JSON.stringify(path)} is not in the last commit.`
    );
    if (change?.status === 'new') return notInHead;

    const tree = await read(['ls-tree', '-z', '-l', 'HEAD', '--', headPath]);
    // Fails with no first commit: nothing is in it.
    if (!tree.ok) return notInHead;
    const entry = tree.stdout
      .toString('utf8')
      .split('\0')
      .map((record) => /^(\d+) (\w+) ([0-9a-f]+) +(\S+)\t(.*)$/s.exec(record))
      .find((match) => match !== null && match[5] === headPath);
    if (!entry || entry[2] !== 'blob') return notInHead;
    const [, mode, , oid, size] = entry;
    if (mode === '120000') {
      return fail(
        'HOST_NOT_TEXT',
        `${JSON.stringify(path)} was a symbolic link in the last commit.`
      );
    }
    if (Number(size) > MAX_TEXT_BYTES) {
      return fail(
        'HOST_FILE_TOO_LARGE',
        `${JSON.stringify(path)} in the last commit is over ${MAX_TEXT_BYTES / 1024 / 1024} MiB, too large to compare as text.`
      );
    }
    const blob = await read(['cat-file', 'blob', oid]);
    if (!blob.ok) return gitFailed('git cat-file', blob);
    const text = decodeText(blob.stdout);
    if (text === null) {
      return fail(
        'HOST_NOT_TEXT',
        `${JSON.stringify(path)} in the last commit is not text (UTF-8 without NUL bytes).`
      );
    }
    return ok({ text });
  }

  async function stage(written: readonly PortChange[]): Promise<StageResult> {
    const at = await start();
    if (at.state !== 'repository') return { ok: true, staged: [] };
    const sources = stagedSources(written);
    if (sources.length === 0) return { ok: true, staged: [] };

    // The sources' index entries: still there, since the write touched only the disk.
    let listed = '';
    for (const chunk of chunkPaths(sources)) {
      const run = await read(['ls-files', '-s', '-z', '--full-name', '--', ...chunk]);
      if (!run.ok) return { ok: false, message: describe('git ls-files', run) };
      listed += run.stdout.toString('utf8');
    }
    const plan = stagingPlan(written, parseIndexEntries(listed), at.prefix);
    if (plan.input === '') return { ok: true, staged: [] };
    const run = await runGit(['update-index', '-z', '--index-info'], {
      cwd: root,
      env,
      input: plan.input,
    });
    if (!run.ok) return { ok: false, message: describe('git update-index', run) };
    return { ok: true, staged: plan.staged };
  }

  const commitTimeoutMs = options.commitTimeoutMs ?? COMMIT_TIMEOUT_MS;
  /** A write that may run a hook: isolated, with the commit's timeout. */
  const write = (args: readonly string[], input?: string): Promise<GitRun> =>
    runGit(['--literal-pathspecs', ...args], {
      cwd: root,
      env,
      input,
      isolate: true,
      timeoutMs: commitTimeoutMs,
    });
  /** The first sentence of a failure: what failed, and how. */
  const failedHow = (command: string, run: Extract<GitRun, { ok: false }>): string => {
    if (run.timedOut) {
      const seconds = Math.round(commitTimeoutMs / 100) / 10;
      return `${command} did not finish within ${seconds} ${seconds === 1 ? 'second' : 'seconds'} (a hook or signing may be waiting for input), so it was stopped.`;
    }
    if (run.missing) return `${command} could not be run.`;
    return `${command} failed${run.exitCode === null ? '' : ` (exit ${run.exitCode})`}.`;
  };

  /** Where `HEAD` is: its branch (`null` when detached) and its commit (`null` before the first). */
  async function head(): Promise<{ branch: string | null; oid: string | null }> {
    const [symbolic, verified] = await Promise.all([
      read(['symbolic-ref', '--quiet', 'HEAD']),
      read(['rev-parse', '--quiet', '--verify', 'HEAD^{commit}']),
    ]);
    const ref = symbolic.ok ? symbolic.stdout.toString('utf8').trim() : '';
    const oid = verified.ok ? verified.stdout.toString('utf8').trim() : '';
    return {
      branch: ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null,
      oid: oid === '' ? null : oid,
    };
  }

  /** The merge, rebase, cherry-pick or revert that keeps a commit out, if one is in progress. */
  async function inProgress(): Promise<Failure | null> {
    const refs = await runGit(['cat-file', '--batch-check'], {
      cwd: root,
      env,
      read: true,
      input: PROGRESS_REFS.map(([ref]) => `${ref}\n`).join(''),
    });
    if (!refs.ok) return gitFailed('git cat-file', refs);
    const [found] = refsInProgress(refs.stdout.toString('utf8'));
    if (found) return inProgressRefusal(found);
    // A rebase is a folder, not a ref; git says where it would be (a worktree's own).
    const where = await read([
      'rev-parse',
      ...PROGRESS_FOLDERS.flatMap(([name]) => ['--git-path', name]),
    ]);
    if (!where.ok) return gitFailed('git rev-parse', where);
    const folders = where.stdout.toString('utf8').split('\n');
    for (const [index, [, what]] of PROGRESS_FOLDERS.entries()) {
      const folder = folders[index];
      if (!folder) continue;
      const there = await lstat(resolve(root, folder)).then(
        () => true,
        () => false
      );
      if (there) return inProgressRefusal(what);
    }
    return null;
  }

  /** Why `name` cannot be the new branch, or null. */
  async function checkBranch(name: string): Promise<Failure | null> {
    const [formatted, refs, remotes] = await Promise.all([
      read(['check-ref-format', '--branch', name]),
      read(['for-each-ref', '--format=%(refname)', 'refs/heads/', 'refs/remotes/']),
      read(['remote']),
    ]);
    if (!refs.ok) return gitFailed('git for-each-ref', refs);
    if (!remotes.ok) return gitFailed('git remote', remotes);
    const lines = (run: GitRun) =>
      run.ok ? run.stdout.toString('utf8').split('\n').filter(Boolean) : [];
    return branchProblem(
      name,
      formatted.ok ? formatted.stdout.toString('utf8').replace(/\n$/, '') : null,
      lines(refs),
      lines(remotes)
    );
  }

  async function commit(request: HostCommitRequest): Promise<Result<HostCommit>> {
    const at = await start();
    if (at.state !== 'repository') return notARepository(at.state);
    const asked = readRequest(request);
    if ('ok' in asked) return asked;
    const { message, branch } = asked;
    for (const path of asked.paths) {
      const problem = pathProblem(path);
      if (problem !== null) {
        return fail('HOST_PATH_OUTSIDE_ROOT', `${JSON.stringify(path)} is not usable: ${problem}`);
      }
    }

    const busy = await inProgress();
    if (busy) return busy;
    const was = await head();
    if (branch === undefined && was.branch === null) {
      return fail(
        'HOST_DETACHED_HEAD',
        'HEAD is detached (not on a branch), so the commit needs a new branch: name one.'
      );
    }

    const listed = await readChanges();
    if (!listed.ok) return listed;
    const { paths, unchanged } = choosePaths(listed.changes, asked.paths);
    if (unchanged.length > 0) {
      const named = unchanged.map((path) => JSON.stringify(path)).join(', ');
      return fail(
        'HOST_NOT_CHANGED',
        `${named} ${unchanged.length === 1 ? 'has' : 'have'} nothing to commit: not changed since the last commit. The list may be out of date.`
      );
    }
    const unmerged = await read(['ls-files', '-z', '--unmerged', '--', '.']);
    if (!unmerged.ok) return gitFailed('git ls-files', unmerged);
    const conflicted = new Set(
      unmerged.stdout
        .toString('utf8')
        .split('\0')
        .map((record) => /^\d+ [0-9a-f]+ \d\t(.*)$/s.exec(record)?.[1])
        .filter((path): path is string => path !== undefined)
    );
    const inConflict = paths.filter((path) => conflicted.has(path));
    if (inConflict.length > 0) {
      return fail(
        'HOST_PATH_CONFLICTED',
        `${inConflict.map((path) => JSON.stringify(path)).join(', ')} ${inConflict.length === 1 ? 'is' : 'are'} in conflict. Resolve and stage ${inConflict.length === 1 ? 'it' : 'them'} in a terminal first.`
      );
    }
    if (branch !== undefined) {
      const problem = await checkBranch(branch);
      if (problem) return problem;
    }

    // Where the person is, in words, for a message after a failure.
    const where = (name: string | null) =>
      name !== null
        ? `on ${name}`
        : `on a detached HEAD${was.oid ? ` at ${was.oid.slice(0, 12)}` : ''}`;

    if (branch !== undefined) {
      const switched = await write(['switch', '--quiet', '--create', branch]);
      if (!switched.ok) {
        // A switch that failed made nothing; the post-checkout hook runs after it has.
        const now = await head();
        if (now.branch === branch) await goBack(branch);
        return fail(
          'HOST_GIT_FAILED',
          `${failedHow('git switch', switched)} Nothing was committed, and you are still ${where(was.branch)}.${saidOf(switched)}`
        );
      }
    }

    const toAdd = paths.filter((path) => listed.untracked.has(path));
    const nul = (list: readonly string[]) => list.map((path) => `${path}\0`).join('');
    if (toAdd.length > 0) {
      const added = await write(
        ['add', '--intent-to-add', '--pathspec-from-file=-', '--pathspec-file-nul'],
        nul(toAdd)
      );
      if (!added.ok) {
        await forget(toAdd);
        const back = branch === undefined ? null : await goBack(branch);
        return fail(
          'HOST_GIT_FAILED',
          `${failedHow('git add', added)} Nothing was committed${afterGoingBack(back)}.${saidOf(added)}`
        );
      }
    }

    const folder = await mkdtemp(join(tmpdir(), 'surfaces-commit-'));
    let committed: GitRun;
    try {
      const file = join(folder, 'message');
      await writeFile(file, message, { mode: 0o600 });
      committed = await write(
        [
          'commit',
          '--only',
          '--quiet',
          '--cleanup=whitespace',
          '--file',
          file,
          '--pathspec-from-file=-',
          '--pathspec-file-nul',
        ],
        nul(paths)
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }

    const now = await head();
    // A hook after the commit (post-commit) may fail or be stopped once the
    // commit is made: `HEAD` moved, so it was.
    const landed = now.oid !== null && now.oid !== was.oid;
    if (!committed.ok && !landed) {
      await forget(toAdd);
      const back = branch === undefined ? null : await goBack(branch);
      return fail(
        'HOST_GIT_FAILED',
        `${failedHow('git commit', committed)} Nothing was committed${afterGoingBack(back)}.${saidOf(committed)}`
      );
    }
    const short = await read(['rev-parse', '--short', now.oid!]);
    return ok({
      commit: now.oid!,
      short: short.ok ? short.stdout.toString('utf8').trim() : now.oid!.slice(0, 7),
      branch: now.branch ?? branch ?? '',
    });

    /** After a failure: the paths step 2 added go back to untracked. */
    async function forget(added: readonly string[]): Promise<void> {
      if (added.length === 0) return;
      const run = await runGit(['update-index', '-z', '--force-remove', '--stdin'], {
        cwd: root,
        env,
        input: nul(added),
      });
      if (!run.ok) {
        warn(
          `the commit failed, and ${added.length} new file(s) it had added to the index could not be taken out again (${describe('git update-index', run)}).`
        );
      }
    }

    /**
     * After a failure on a new branch: `HEAD` back where it was, and the new
     * branch deleted while it still points where it started (nothing was
     * committed on it). Answers null when that worked, or what went wrong.
     */
    async function goBack(made: string): Promise<string | null> {
      const back =
        was.branch !== null
          ? await runGit(['symbolic-ref', 'HEAD', `refs/heads/${was.branch}`], { cwd: root, env })
          : await runGit(['update-ref', '--no-deref', 'HEAD', was.oid!], { cwd: root, env });
      if (!back.ok) return describe('going back', back);
      if (was.oid !== null) {
        const dropped = await runGit(['update-ref', '-d', `refs/heads/${made}`, was.oid], {
          cwd: root,
          env,
        });
        if (!dropped.ok) {
          warn(`the commit failed, and the branch ${made} it made could not be deleted.`);
        }
      }
      return null;
    }

    function afterGoingBack(problem: string | null): string {
      if (branch === undefined || problem === null) {
        return `, and you are still ${where(was.branch)}`;
      }
      return `. The new branch ${branch} was made and you are on it; going back ${where(was.branch).replace(/^on /, 'to ')} failed (${problem})`;
    }
  }

  return { start, info, changes, status, base, stage, commit };
}

/** git's words after the message, on lines of their own. */
function saidOf(run: Extract<GitRun, { ok: false }>): string {
  const said = gitSaid(run);
  return said === '' ? '' : ` git said:\n${said}`;
}

function describe(command: string, run: Extract<GitRun, { ok: false }>): string {
  const said = run.stderr.trim();
  return `${command} failed${run.exitCode === null ? '' : ` (exit ${run.exitCode})`}${said ? `: ${said}` : '.'}`;
}

function gitFailed(command: string, run: GitRun): Failure {
  return fail('HOST_GIT_FAILED', run.ok ? `${command} failed.` : describe(command, run));
}

/**
 * Whether a `.git` entry, a folder or a file (a worktree's, a submodule's), is in
 * `folder` or any folder above it. Used only when `git` cannot be run; it reads
 * nothing in the entry and knows none of git's other rules.
 */
export async function hasGitEntryAbove(folder: string): Promise<boolean> {
  let at = folder;
  for (;;) {
    try {
      await lstat(join(at, '.git'));
      return true;
    } catch {
      // not here
    }
    const up = dirname(at);
    if (up === at) return false;
    at = up;
  }
}
