// The commit dialog's pure parts: its rows from the host's changes, the request
// from what is chosen and typed, and the page's own checks before anything is
// sent. The request is the commit function's whole input (`HostCommitRequest`),
// which stage 5's check-in review builds the same way.

import { words } from '../words';

import type { HostChange, HostCommitRequest } from '@stillpointlab/common-format/host';

/** One row: a change, and whether it is checked. */
export interface CommitRow {
  change: HostChange;
  checked: boolean;
}

/**
 * The rows for `changes`. A path already shown keeps its check; a path that was
 * not (a change that appeared while the dialog was open) starts unchecked, so
 * nothing is committed that was not there to see when it was checked. With no
 * rows before (the dialog opening), every row starts checked.
 */
export function rowsFor(
  changes: readonly HostChange[],
  before: readonly CommitRow[] | null = null
): CommitRow[] {
  const was = new Map(before?.map((row) => [row.change.path, row.checked]));
  return changes.map((change) => ({
    change,
    checked: before === null ? true : (was.get(change.path) ?? false),
  }));
}

/** The whole message: the summary, then a blank line and the details when there are any. */
export function messageOf(summary: string, details: string): string {
  const head = summary.trim();
  const body = details.replace(/^\s*\n/, '').trimEnd();
  return body.trim() === '' ? head : `${head}\n\n${body}`;
}

export interface CommitInput {
  rows: readonly CommitRow[];
  summary: string;
  details: string;
  /** `null` for the current branch; the name typed for a new one. */
  branch: string | null;
}

/** What is missing before a commit can be asked for, and which field to go back to. */
export type CommitProblem = { message: string; field: 'files' | 'summary' | 'branch' };

export function commitProblem(input: CommitInput): CommitProblem | null {
  if (!input.rows.some((row) => row.checked)) {
    return { message: words.commit.check.noFiles, field: 'files' };
  }
  if (input.summary.trim() === '')
    return { message: words.commit.check.noSummary, field: 'summary' };
  if (input.branch !== null && input.branch.trim() === '') {
    return { message: words.commit.check.noBranch, field: 'branch' };
  }
  return null;
}

/** The commit's request: each checked row's path, and a moved one's old path too. */
export function requestOf(input: CommitInput): HostCommitRequest {
  const paths: string[] = [];
  for (const { change, checked } of input.rows) {
    if (!checked) continue;
    paths.push(change.path);
    if (change.from !== undefined) paths.push(change.from);
  }
  const message = messageOf(input.summary, input.details);
  return input.branch === null
    ? { paths, message }
    : { paths, message, branch: input.branch.trim() };
}
