// The review's pure parts: its rows from the files and the rows before them,
// the groups the rows sit under, what is missing before the host can be asked,
// and the op from what is chosen and typed. DOM-free, so a host can test what it
// sends without the element.

import type { AppShellOps } from '@stillpointlab/common-format/app';

/** One file the review offers. */
export interface CheckinFile {
  path: string;
  /** For a moved file, where it was. */
  from?: string;
  /** What changed, in the host's or the app's words: "content edited", "todo → done", "new". */
  label: string;
  /** A heading the row sits under: "Phase 2", "Pool & config". */
  group?: string;
}

/** One row: a file, and whether it is checked. */
export interface CheckinRow {
  file: CheckinFile;
  checked: boolean;
}

/** The op the review asks its host. */
export type CheckinOp = AppShellOps['checkin']['op'];

/** The host's answer to it, when it took the check-in. */
export type CheckinReply = AppShellOps['checkin']['reply'];

/**
 * The rows for `files`. A path already shown keeps its check; a path that was
 * not (a file that changed while the review was open) starts unchecked, so
 * nothing is checked in that was not there to see when it was checked. With no
 * rows before (the review opening), every row starts checked.
 */
export function rowsFor(
  files: readonly CheckinFile[],
  before: readonly CheckinRow[] | null = null
): CheckinRow[] {
  const was = new Map(before?.map((row) => [row.file.path, row.checked]));
  return files.map((file) => ({
    file,
    checked: before === null ? true : (was.get(file.path) ?? false),
  }));
}

/** A run of rows under one heading (`null`: no heading), with each row's index among all rows. */
export interface CheckinGroup {
  name: string | null;
  rows: { row: CheckinRow; index: number }[];
}

/**
 * The rows gathered by group: the groups in the order each first appears, the
 * rows in their own order within one. Rows with no group form a group with no
 * heading, where the first of them appears.
 */
export function groupsOf(rows: readonly CheckinRow[]): CheckinGroup[] {
  const groups = new Map<string | null, CheckinGroup>();
  rows.forEach((row, index) => {
    const name = row.file.group === undefined || row.file.group === '' ? null : row.file.group;
    let group = groups.get(name);
    if (!group) {
      group = { name, rows: [] };
      groups.set(name, group);
    }
    group.rows.push({ row, index });
  });
  return [...groups.values()];
}

/** What the form holds when confirm is pressed. */
export interface CheckinInput {
  rows: readonly CheckinRow[];
  title: string;
  body: string;
  /** Whether an empty title is refused. */
  titleRequired: boolean;
  /** `null` for no new branch; the name typed for a new one. */
  branch: string | null;
  /** The current branch the review shows (`null`: not on one); absent when it shows none. */
  onBranch?: string | null;
  context?: Record<string, unknown>;
}

/** Which part of the form a problem sends focus back to. */
export type CheckinField = 'files' | 'title' | 'branch';

/** What is missing before the host can be asked, and the field to go back to. */
export function checkinProblem(input: CheckinInput): CheckinField | null {
  if (!input.rows.some((row) => row.checked)) return 'files';
  if (input.titleRequired && input.title.trim() === '') return 'title';
  if (input.branch !== null && input.branch.trim() === '') return 'branch';
  return null;
}

/** The body as it is sent: blank lines before it and space after it dropped, its own indents kept. */
export function bodyOf(body: string): string {
  const kept = body.replace(/^\s*\n/, '').trimEnd();
  return kept.trim() === '' ? '' : kept;
}

/**
 * The whole message a host over git commits: the title, then a blank line and
 * the body when there is one.
 */
export function messageOf(title: string, body: string): string {
  const head = title.trim();
  const rest = bodyOf(body);
  return rest === '' ? head : `${head}\n\n${rest}`;
}

/**
 * The op: each checked row's path, a moved one's old path too; the title, body
 * and branch when given, and the current branch the review showed.
 */
export function checkinOpOf(input: CheckinInput): CheckinOp {
  const paths: string[] = [];
  for (const { file, checked } of input.rows) {
    if (!checked) continue;
    paths.push(file.path);
    if (file.from !== undefined && file.from !== file.path) paths.push(file.from);
  }
  const title = input.title.trim();
  const body = bodyOf(input.body);
  const branch = input.branch?.trim() ?? '';
  return {
    paths,
    ...(title === '' ? {} : { title }),
    ...(body === '' ? {} : { body }),
    ...(branch === '' ? {} : { branch }),
    ...(input.onBranch === undefined ? {} : { onBranch: input.onBranch }),
    ...(input.context === undefined ? {} : { context: input.context }),
  };
}
