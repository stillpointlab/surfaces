// What the page's commit is, for the check-in review: the review's rows from the
// host's changes, in the tree's order; the words for a commit; the field a
// refusal is about; and the commit request a review's `checkin` op makes, for
// the explorer's review and an app's alike. Pure: no DOM, no client.

import { messageOf } from '@stillpointlab/checkin-review-component';

import { words } from '../words';

import type { CheckinField, CheckinFile, CheckinOp } from '@stillpointlab/checkin-review-component';
import type { CheckinWords } from '@stillpointlab/common-format/app';
import type { HostChange, HostCommitRequest } from '@stillpointlab/common-format/host';

/** The review's words for a commit: the explorer's and every app's, in this host. */
export const COMMIT_WORDS: CheckinWords = {
  heading: words.commit.title,
  title: words.commit.summary,
  body: words.commit.details,
  confirm: words.commit.confirm,
  cancel: words.commit.cancel,
  busy: words.commit.committing,
  noFiles: words.commit.check.noFiles,
  noTitle: words.commit.check.noSummary,
  detached: words.commit.detached,
  nothing: words.commit.nothing,
};

const collator = new Intl.Collator(undefined, { numeric: true });

/**
 * Two paths in the tree's order: at the first segment they differ in, a folder
 * before a file, then names as the tree sorts them (numbers in order).
 */
export function compareTreePaths(a: string, b: string): number {
  const left = a.split('/');
  const right = b.split('/');
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    if (left[i] === right[i]) continue;
    const leftFolder = i < left.length - 1;
    const rightFolder = i < right.length - 1;
    if (leftFolder !== rightFolder) return leftFolder ? -1 : 1;
    return collator.compare(left[i], right[i]) || (left[i] < right[i] ? -1 : 1);
  }
  return left.length - right.length;
}

/** The review's rows: each change with its status as its label, a moved one with where it was, in the tree's order. */
export function commitFiles(changes: readonly HostChange[]): CheckinFile[] {
  return [...changes]
    .sort((a, b) => compareTreePaths(a.path, b.path))
    .map((change) => ({
      path: change.path,
      ...(change.from !== undefined ? { from: change.from } : {}),
      label: words.commit.status[change.status],
    }));
}

/** The field a commit's refusal is about, by its code; `null` sends focus to the refusal itself. */
export function refusalField(code: string): CheckinField | null {
  if (code.startsWith('HOST_BRANCH_')) return 'branch';
  if (code === 'HOST_COMMIT_NO_MESSAGE') return 'title';
  if (code === 'HOST_COMMIT_NO_PATHS') return 'files';
  return null;
}

/**
 * The commit a review's `checkin` op asks for: its paths; the title as the
 * summary, `fallback` when there is none, and the body as the details, joined
 * as the commit dialog joined them; `branch` a new branch; `onBranch` the
 * branch the review showed, which the server holds the commit to.
 */
export function commitRequestOf(op: CheckinOp, fallback: string): HostCommitRequest {
  const title = op.title !== undefined && op.title.trim() !== '' ? op.title : fallback;
  const message = messageOf(title, op.body ?? '');
  return {
    paths: [...op.paths],
    message,
    ...(op.branch !== undefined && op.branch.trim() !== '' ? { branch: op.branch.trim() } : {}),
    ...(op.onBranch !== undefined ? { onBranch: op.onBranch } : {}),
  };
}

/** An op as a review raised it, checked: string paths, and strings where strings go. */
export function checkinOpFrom(op: Record<string, unknown>): CheckinOp | null {
  const { paths, title, body, branch, onBranch } = op;
  if (!Array.isArray(paths) || !paths.every((path) => typeof path === 'string')) return null;
  for (const value of [title, body, branch]) {
    if (value !== undefined && typeof value !== 'string') return null;
  }
  if (onBranch !== undefined && onBranch !== null && typeof onBranch !== 'string') return null;
  return {
    paths: paths as string[],
    ...(title !== undefined ? { title: title as string } : {}),
    ...(body !== undefined ? { body: body as string } : {}),
    ...(branch !== undefined ? { branch: branch as string } : {}),
    ...(onBranch !== undefined ? { onBranch: onBranch as string | null } : {}),
  };
}
