// The commit's pure parts: the request's shape, which paths a commit takes, what
// is in progress, the new branch's name against the refs there are, and git's
// own words made fit to show a person. `repository.ts` runs git around them.
//
// What a commit of chosen paths runs, in the order `repository.ts` runs it (each
// one checked against real git, 2.56 on Fedora 44, 2026-11-14):
//
// 1. `git switch -c <branch>`, when a new branch is asked for: from the current
//    commit, carrying the index and the work tree as they are.
// 2. `git add --intent-to-add` for each chosen path git does not track (a new
//    file): `commit --only` takes only paths git knows, in `HEAD` or the index.
//    Only those paths, so nothing else is staged.
// 3. `git commit --only --cleanup=whitespace -F <file> --pathspec-from-file=-`,
//    the paths on standard input. `--only` builds the commit from `HEAD` plus
//    the work tree's content of those paths, so it leaves every other staged
//    change staged, outside the served root too. It is also why no `git add`
//    runs for the rest: a path in `HEAD` or the index is taken as it is on
//    disk, and one gone from disk is taken as removed (the old path of a move
//    the host staged is in `HEAD`, so it is known). `git add -A` is not used:
//    it refuses a tracked path under an ignored folder, which a move can make.
//
// If the commit fails, the paths step 2 added go back out of the index and the
// branch step 1 made is taken back, so the person is where they were.

import { fail } from '@stillpointlab/common-format/app';

import type { GitRun } from './run';
import type { Failure } from '@stillpointlab/common-format/app';
import type { HostChange, HostCommitRequest } from '@stillpointlab/common-format/host';

/** A request from a body: its shape checked, its paths each once, or the refusal. */
export function readRequest(body: unknown): HostCommitRequest | Failure {
  if (typeof body !== 'object' || body === null) {
    return fail('HOST_BAD_REQUEST', 'The body must be { "paths": [...], "message": "..." }.');
  }
  const { paths, message, branch } = body as Record<string, unknown>;
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string')) {
    return fail('HOST_BAD_REQUEST', '"paths" must be a list of paths.');
  }
  if (typeof message !== 'string') {
    return fail('HOST_BAD_REQUEST', '"message" must be a string.');
  }
  if (branch !== undefined && typeof branch !== 'string') {
    return fail('HOST_BAD_REQUEST', '"branch" must be a string when it is given.');
  }
  if (paths.length === 0) {
    return fail('HOST_COMMIT_NO_PATHS', 'Choose at least one file to commit.');
  }
  if (message.trim() === '') {
    return fail('HOST_COMMIT_NO_MESSAGE', 'Write a message for the commit.');
  }
  return {
    paths: [...new Set(paths as string[])],
    message,
    ...(branch === undefined ? {} : { branch }),
  };
}

/**
 * The paths a commit names, given the changes: each chosen one, and for a moved
 * file both its paths whichever was chosen, since a commit of one half leaves the
 * other staged (the removal, or the addition). `unchanged` holds the chosen
 * paths that are neither a change nor a moved file's old path.
 */
export function choosePaths(
  changes: readonly HostChange[],
  chosen: readonly string[]
): { paths: string[]; unchanged: string[] } {
  const byPath = new Map<string, HostChange>();
  const byFrom = new Map<string, HostChange>();
  for (const change of changes) {
    byPath.set(change.path, change);
    if (change.from !== undefined) byFrom.set(change.from, change);
  }
  const paths = new Set<string>();
  const unchanged: string[] = [];
  for (const path of chosen) {
    const change = byPath.get(path) ?? byFrom.get(path);
    if (!change) {
      unchanged.push(path);
      continue;
    }
    paths.add(change.path);
    if (change.from !== undefined) paths.add(change.from);
  }
  return { paths: [...paths], unchanged };
}

/** The operations that keep a commit out, and how git shows each one. */
export type InProgress = 'merge' | 'cherry-pick' | 'revert' | 'rebase' | 'sequence';

/** The pseudo-refs `git cat-file --batch-check` is asked for, one a line. */
export const PROGRESS_REFS: ReadonlyArray<[ref: string, what: InProgress]> = [
  ['MERGE_HEAD', 'merge'],
  ['CHERRY_PICK_HEAD', 'cherry-pick'],
  ['REVERT_HEAD', 'revert'],
];

/** The folders `git rev-parse --git-path` is asked for, in this order. */
export const PROGRESS_FOLDERS: ReadonlyArray<[name: string, what: InProgress]> = [
  ['rebase-merge', 'rebase'],
  ['rebase-apply', 'rebase'],
  ['sequencer', 'sequence'],
];

/** Which of `PROGRESS_REFS` git found, from its `--batch-check` answer. */
export function refsInProgress(output: string): InProgress[] {
  const lines = output.split('\n');
  const found: InProgress[] = [];
  PROGRESS_REFS.forEach(([, what], index) => {
    const line = lines[index] ?? '';
    // `<oid> <type> <size>` when it resolves; `<ref> missing` when it does not.
    if (/^[0-9a-f]{40,64} /.test(line)) found.push(what);
  });
  return found;
}

export function inProgressRefusal(what: InProgress): Failure {
  const say: Record<InProgress, string> = {
    merge:
      'A merge is in progress. Finish it (git commit) or abort it (git merge --abort) in a terminal, then commit here.',
    'cherry-pick':
      'A cherry-pick is in progress. Finish it (git cherry-pick --continue) or abort it (git cherry-pick --abort) in a terminal, then commit here.',
    revert:
      'A revert is in progress. Finish it (git revert --continue) or abort it (git revert --abort) in a terminal, then commit here.',
    rebase:
      'A rebase (or git am) is in progress. Finish it (--continue) or abort it (--abort) in a terminal, then commit here.',
    sequence:
      'A cherry-pick or revert of several commits is in progress. Finish it (--continue) or stop it (--quit) in a terminal, then commit here.',
  };
  return fail('HOST_GIT_IN_PROGRESS', say[what]);
}

/**
 * Why `name` cannot be the new branch, given what `git check-ref-format
 * --branch` answered for it (`null` when it refused) and the repository's refs
 * (`refs/heads/...` and `refs/remotes/...`) and remotes; `null` when it can.
 */
export function branchProblem(
  name: string,
  formatted: string | null,
  refs: readonly string[],
  remotes: readonly string[]
): Failure | null {
  const quoted = JSON.stringify(name);
  // `--branch` also expands `@{-1}` to the branch before; only a name as typed counts.
  if (formatted === null || formatted !== name || name === '@') {
    return fail(
      'HOST_BRANCH_INVALID',
      `git does not take ${quoted} as a branch name (no spaces, no “..”, “~”, “^”, “:”, “?”, “*” or “[”, and no “-” or “/” to start).`
    );
  }
  const heads = refs
    .filter((ref) => ref.startsWith('refs/heads/'))
    .map((ref) => ref.slice('refs/heads/'.length));
  if (heads.includes(name)) {
    return fail('HOST_BRANCH_EXISTS', `There is already a branch named ${quoted}.`);
  }
  const sameButCase = heads.find((head) => head.toLowerCase() === name.toLowerCase());
  if (sameButCase !== undefined) {
    return fail(
      'HOST_BRANCH_EXISTS',
      `There is already a branch named ${JSON.stringify(sameButCase)}, which differs only in case; choose another name.`
    );
  }
  const nested = heads.find((head) => head.startsWith(`${name}/`) || name.startsWith(`${head}/`));
  if (nested !== undefined) {
    return fail(
      'HOST_BRANCH_EXISTS',
      `There is a branch named ${JSON.stringify(nested)}, so ${quoted} cannot be one too (one would be a folder of the other).`
    );
  }
  const remote = remotes.find((r) => refs.includes(`refs/remotes/${r}/${name}`));
  if (remote !== undefined) {
    return fail(
      'HOST_BRANCH_EXISTS',
      `There is a branch ${quoted} on ${JSON.stringify(remote)} (${remote}/${name}). A new branch here would not be that one; choose another name, or switch to it in a terminal.`
    );
  }
  return null;
}

/** Past this many characters, git's words keep their start and their end. */
export const MAX_SAID = 8000;

/**
 * What git said (its standard error, then its standard output, where a commit
 * puts "nothing to commit"), trimmed, as text. Very long output (a hook that
 * prints a whole test run) keeps its first and last parts, where the useful
 * lines are, with a line saying how much was left out.
 */
export function gitSaid(run: Extract<GitRun, { ok: false }>, max = MAX_SAID): string {
  const said = [run.stderr.trim(), (run.stdout ?? '').trim()].filter(Boolean).join('\n');
  if (said.length <= max) return said;
  const half = Math.floor(max / 2);
  const left = said.length - 2 * half;
  return `${said.slice(0, half)}\n… (${left.toLocaleString('en')} characters left out) …\n${said.slice(-half)}`;
}
