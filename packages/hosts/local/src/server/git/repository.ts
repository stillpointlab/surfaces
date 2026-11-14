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
// `status` event of its own. Staging is the one write, and it may fail on the
// lock; the port's write stands, and the port warns.

import { lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { fail, ok } from '@stillpointlab/common-format/app';

import { MAX_TEXT_BYTES } from '../limits';
import { pathProblem } from '../paths';
import { decodeText } from '../text';

import { runGit } from './run';
import { chunkPaths, parseIndexEntries, stagedSources, stagingPlan } from './stage';
import { changesFromStatus, parseStatusEntries, withIndexRemovals } from './status';

import type { GitRun } from './run';
import type { Failure, Result } from '@stillpointlab/common-format/app';
import type {
  FileStatus,
  GitState,
  HostChange,
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
    let found = changesFromStatus(
      parseStatusEntries(status.stdout.toString('utf8')),
      at.prefix,
      keep
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
    return ok({ changes: found });
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

  return { start, info, changes, status, base, stage };
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
