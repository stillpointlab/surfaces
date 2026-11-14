// Staging the host's own moves and deletes, as `git mv` and `git rm` would have,
// after the port has written them. Pure: the index entries in, the lines for
// `git update-index -z --index-info` out.
//
// A move takes the old path's index entry (its mode and blob) to the new path,
// and a delete removes the entry: exactly what `git mv` and `git rm --cached`
// leave in the index. So git always reports a rename, however much the file was
// edited; an edit that was not staged stays unstaged; a staged one moves with the
// file; and a new path that `.gitignore` covers stays tracked, as `git mv` keeps
// it. A file the index does not have (untracked) has nothing to stage, and a
// conflicted one (an entry at stage 1 to 3) is left for the person to resolve.
//
// Nothing else is staged: a write or a create never reaches here, and only the
// entries of the paths a move or delete named change.

import type { PortChange } from '@stillpointlab/common-format/host';

/** One line of `git ls-files -s -z --full-name`. */
export interface IndexEntry {
  mode: string;
  oid: string;
  stage: string;
  /** From the top of the work tree. */
  path: string;
}

export function parseIndexEntries(output: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const record of output.split('\0')) {
    const match = /^(\d+) ([0-9a-f]+) (\d)\t(.+)$/s.exec(record);
    if (match) entries.push({ mode: match[1], oid: match[2], stage: match[3], path: match[4] });
  }
  return entries;
}

/** The paths, from the served root, whose index entries a staging needs: every move's source and every delete. */
export function stagedSources(changes: readonly PortChange[]): string[] {
  const sources: string[] = [];
  for (const change of changes) {
    if (change.kind === 'move') sources.push(change.from);
    else if (change.kind === 'delete') sources.push(change.path);
  }
  return sources;
}

export interface StagingPlan {
  /** The input for `git update-index -z --index-info`; `''` when nothing is staged. */
  input: string;
  /** The paths, from the served root, whose index entries change: each source, and each move's target. */
  staged: string[];
}

/**
 * The index lines that stage `changes`, given the index entries of their sources
 * (`entries`, as `git ls-files -s` answered them) and the served root's prefix.
 */
export function stagingPlan(
  changes: readonly PortChange[],
  entries: readonly IndexEntry[],
  prefix: string
): StagingPlan {
  const byPath = new Map<string, IndexEntry[]>();
  for (const entry of entries) {
    const list = byPath.get(entry.path) ?? [];
    list.push(entry);
    byPath.set(entry.path, list);
  }
  /** The path's one entry, when it is tracked and not in conflict. */
  const tracked = (path: string): IndexEntry | null => {
    const list = byPath.get(prefix + path);
    return list?.length === 1 && list[0].stage === '0' ? list[0] : null;
  };

  const lines: string[] = [];
  const staged: string[] = [];
  for (const change of changes) {
    if (change.kind !== 'move' && change.kind !== 'delete') continue;
    const source = change.kind === 'move' ? change.from : change.path;
    const entry = tracked(source);
    if (!entry) continue;
    // Mode 0 removes the path; its object id is zeros of the repository's length.
    lines.push(`0 ${'0'.repeat(entry.oid.length)}\t${prefix}${source}`);
    staged.push(source);
    if (change.kind === 'move') {
      lines.push(`${entry.mode} ${entry.oid} 0\t${prefix}${change.path}`);
      staged.push(change.path);
    }
  }
  return { input: lines.map((line) => `${line}\0`).join(''), staged };
}

/**
 * Paths split into groups whose total length stays under `maxBytes`, so one
 * `git` command line never passes the system's limit on arguments.
 */
export function chunkPaths(paths: readonly string[], maxBytes = 64 * 1024): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const path of paths) {
    const length = Buffer.byteLength(path) + 1;
    if (current.length > 0 && size + length > maxBytes) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(path);
    size += length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
