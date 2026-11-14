// `git status --porcelain=v2 -z` read into the host's changes: one `FileStatus`
// per path, relative to the served root. Pure, so every entry kind is tested
// without a repository.
//
// The entries (git's documentation, "Porcelain Format Version 2"):
//
//   1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>                 an ordinary change
//   2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>\0<from>  a rename or copy
//   u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>       unmerged (a conflict)
//   ? <path>                                                     untracked
//
// Under `-z` a record ends in NUL, a path is never quoted and may hold spaces, and
// a rename's two paths are separate records, the new one first. Paths are from
// the work tree's top, whatever folder git ran in. `X` is the index against
// `HEAD`, `Y` the work tree against the index; `.` is no change.
//
// What each maps to (how the file on disk differs from `HEAD`):
//
// | Entry                                   | Status                                |
// | --------------------------------------- | ------------------------------------- |
// | `?` untracked                           | `new`                                 |
// | `A` added, `.A` intent to add, `C` copy | `new` (a copy's source is unchanged)  |
// | `R` rename                              | `moved` on the new path, with `from`  |
// | `Y` = `D` (gone from disk)              | `deleted`; a rename's at its `from`   |
// | `AD` added, then gone from disk         | nothing: not in `HEAD`, not on disk   |
// | `D.` removed from the index             | `deleted`, or `changed` when the file |
// |                                         | is still on disk (`git rm --cached`)  |
// | `M`, `T` (type change) in `X` or `Y`    | `changed`                             |
// | `u` unmerged, any `XY`                  | `changed`                             |
//
// A served root inside the repository sees only its own paths. A rename across
// its edge is half of one: from outside in is `new`, from inside out is `deleted`.

import type { FileStatus, HostChange } from '@stillpointlab/common-format/host';

/** `text` with its first `count` space-separated fields split off: `[fields, rest]`. */
function fields(text: string, count: number): [string[], string] | null {
  const parts: string[] = [];
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    const space = text.indexOf(' ', at);
    if (space < 0) return null;
    parts.push(text.slice(at, space));
    at = space + 1;
  }
  return [parts, text.slice(at)];
}

/** One entry as git gave it, paths from the top of the work tree. */
export interface StatusEntry {
  kind: '1' | '2' | 'u' | '?';
  /** `XY`; `??` for an untracked file. */
  xy: string;
  path: string;
  /** A rename's or a copy's old path. */
  from?: string;
}

/** The records of `git status --porcelain=v2 -z`, in order. Headers and ignored files are skipped. */
export function parseStatusEntries(output: string): StatusEntry[] {
  const records = output.split('\0');
  const entries: StatusEntry[] = [];
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (record === '') continue;
    const kind = record[0];
    if (kind === '?') {
      entries.push({ kind: '?', xy: '??', path: record.slice(2) });
    } else if (kind === '1') {
      const split = fields(record, 8);
      if (split) entries.push({ kind: '1', xy: split[0][1], path: split[1] });
    } else if (kind === '2') {
      const split = fields(record, 9);
      // The old path is the next record.
      const from = records[i + 1];
      i += 1;
      if (split && from !== undefined) {
        entries.push({ kind: '2', xy: split[0][1], path: split[1], from });
      }
    } else if (kind === 'u') {
      const split = fields(record, 10);
      if (split) entries.push({ kind: 'u', xy: split[0][1], path: split[1] });
    }
    // `#` headers and `!` ignored files are not asked for, and passed over if given.
  }
  return entries;
}

/**
 * The changes under the served root (`prefix`: its path from the work tree's
 * top, `''` or ending in `/`), by path relative to it, sorted. `keep` passes over
 * a path the host could not address (the port's path rule).
 */
export function changesFromStatus(
  entries: readonly StatusEntry[],
  prefix: string,
  keep: (path: string) => boolean = () => true
): HostChange[] {
  const inside = (path: string): string | null => {
    if (!path.startsWith(prefix)) return null;
    const rel = path.slice(prefix.length);
    return rel !== '' && keep(rel) ? rel : null;
  };
  const found = new Map<string, HostChange>();
  const set = (path: string | null, status: FileStatus, from?: string | null) => {
    if (path === null) return;
    found.set(path, from ? { path, status, from } : { path, status });
  };
  const untracked: string[] = [];

  for (const entry of entries) {
    const at = inside(entry.path);
    if (entry.kind === '?') {
      untracked.push(entry.path);
      continue;
    }
    const [x, y] = entry.xy;
    if (entry.kind === 'u') {
      set(at, 'changed');
    } else if (entry.kind === '2') {
      const from = inside(entry.from ?? '');
      if (x === 'C') {
        // A copy leaves its source as it was.
        if (y !== 'D') set(at, 'new');
      } else if (y === 'D') {
        // Renamed in the index, then gone from disk: the old path is what went.
        set(from, 'deleted');
      } else if (at !== null) {
        set(at, from === null ? 'new' : 'moved', from);
      } else {
        // Moved out of the served root: from here, it went.
        set(from, 'deleted');
      }
    } else if (y === 'D') {
      if (x !== 'A') set(at, 'deleted');
    } else if (x === 'A' || y === 'A') {
      set(at, 'new');
    } else if (x === 'D') {
      set(at, 'deleted');
    } else {
      set(at, 'changed');
    }
  }
  // An untracked file is new, unless git also has it removed from the index
  // (`git rm --cached`): then it is on disk and in `HEAD`, a change.
  for (const path of untracked) {
    const at = inside(path);
    if (at === null) continue;
    set(at, found.get(at)?.status === 'deleted' ? 'changed' : 'new');
  }
  return [...found.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The paths under the root that the index has removed since `HEAD` and the
 * changes do not account for: the old half of a rename out of the served root,
 * which `git status` limited to the root leaves out. Added as `deleted`.
 */
export function withIndexRemovals(
  changes: readonly HostChange[],
  removed: readonly string[],
  prefix: string,
  keep: (path: string) => boolean = () => true
): HostChange[] {
  const named = new Set<string>();
  for (const change of changes) {
    named.add(change.path);
    if (change.from) named.add(change.from);
  }
  const added: HostChange[] = [];
  for (const path of removed) {
    if (!path.startsWith(prefix)) continue;
    const rel = path.slice(prefix.length);
    if (rel === '' || !keep(rel) || named.has(rel)) continue;
    named.add(rel);
    added.push({ path: rel, status: 'deleted' });
  }
  if (added.length === 0) return [...changes];
  return [...changes, ...added].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
