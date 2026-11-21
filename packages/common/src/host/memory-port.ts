// The storage port in memory: a map of paths to text, with the node port's
// rules for `put` (`packages/hosts/local/src/server/port.ts`) and its refusal
// codes, so the runner reads and writes it as it would a folder. The harness
// runs its apps on it, and a test runs the runner on it.
//
// Beside the port's four methods it keeps what a repository would: the files
// as they were last committed. `changes()` is what differs from them, a moved
// file with the path it had, as the node port's git reports a staged move; and
// `commit` makes the files as they are now the ones compared against.
//
// The rules `put` keeps, all checked before anything is written:
//
// - the changes are a list, each one well formed (`HOST_BAD_REQUEST`);
// - a path is named once per call, as a change's path or a move's source
//   (`HOST_BAD_REQUEST`);
// - a path is relative and does not climb with `..`
//   (`HOST_PATH_OUTSIDE_ROOT`), with `/` between names, and no empty or `.`
//   name, no NUL, no backslash and nothing git takes for its own folder
//   (`HOST_PATH_INVALID`);
// - a write, a move or a delete acts on a file that is there
//   (`HOST_FILE_NOT_FOUND`), at the `base` it gives, if it gives one
//   (`HOST_FILE_CHANGED`);
// - a create or a move lands where nothing is: not on a file, not on a
//   folder, not under a file, and not on a folder of another new file
//   (`HOST_PATH_EXISTS`);
// - a move without `content` keeps the file's text;
// - all the changes or none, and one call at a time: a call is checked and
//   written in one step, so the next sees what it wrote.
//
// `get` refuses a file over 2 MiB as UTF-8 (`HOST_FILE_TOO_LARGE`) and a text
// with a NUL (`HOST_NOT_TEXT`), as the node port does. A version is a digest of
// the text: equal texts have equal versions, as the node port's SHA-256 has.

import { fail, ok } from '../app';

import { digest } from './digest';

import type { Failure, FolderNode, Result } from '../app';
import type { FileStatus, HostChange, PortChange, StoragePort } from './index';

/** The memory port: a `StoragePort` that also answers what changed since its last commit. */
export interface MemoryPort extends StoragePort {
  /**
   * What differs from the files last committed, sorted by path: a moved file
   * with the path it had (`from`), and each change with the text it had then
   * (`base`, for a moved file the text under `from`) unless it is new.
   */
  changes(): HostChange[];
  /**
   * Make the named files, or all of them, as they are now the ones `changes()`
   * compares against. Naming either path of a moved file commits both halves.
   */
  commit(paths?: readonly string[]): void;
  /** The files as they are now, by path: a copy. */
  files(): Record<string, string>;
}

export interface MemoryPortOptions {
  /** The files as last committed, when they are not `files` themselves: what `changes()` compares against. */
  committed?: Readonly<Record<string, string>>;
}

/** `get` refuses a file over this many bytes of UTF-8 (the node port's limit). */
export const MEMORY_MAX_TEXT_BYTES = 2 * 1024 * 1024;

// Code points HFS+ ignores in a name, so `.g` U+200C `it` is `.git` there (git's own list).
const IGNORABLE = /[\u200c-\u200f\u202a-\u202e\u206a-\u206f\ufeff]/g;

/** Whether a name is, or on some file system would be, git's folder (the node port's rule). */
function isGitName(name: string): boolean {
  const folded = name
    .normalize('NFC')
    .replace(IGNORABLE, '')
    .replace(/[. ]+$/, '')
    .toLowerCase();
  return folded === '.git' || folded === 'git~1';
}

const outside = (path: unknown, why: string): Failure =>
  fail('HOST_PATH_OUTSIDE_ROOT', `${JSON.stringify(path)} is outside the served folder: ${why}`);

const invalid = (path: unknown, why: string): Failure =>
  fail('HOST_PATH_INVALID', `${JSON.stringify(path)} is not a usable path: ${why}`);

/**
 * The refusal for a path as written, or `null` for a path a port takes. A path
 * that would leave the root is outside it; one that is only written wrong, or
 * names git's folder, is invalid.
 */
function pathRefusal(path: unknown): Failure | null {
  if (typeof path !== 'string') return invalid(path, 'A path must be a string.');
  if (path === '') return invalid(path, 'The path is empty.');
  if (path.includes('\0')) return invalid(path, 'The path has a NUL character.');
  if (path.includes('\\')) {
    return invalid(path, 'The path has a backslash; separate folders with "/".');
  }
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    return outside(path, 'The path is absolute.');
  }
  for (const segment of path.split('/')) {
    if (segment === '') return invalid(path, 'The path has an empty segment.');
    if (segment === '..') return outside(path, 'The path has a ".." segment.');
    if (segment === '.') return invalid(path, 'The path has a "." segment.');
    if (isGitName(segment)) return invalid(path, "The path names git's own folder.");
  }
  return null;
}

/** The bytes a text takes as UTF-8. */
function byteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (
      unit >= 0xd800 &&
      unit <= 0xdbff &&
      i + 1 < text.length &&
      (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00
    ) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

const notFound = (path: string): Failure =>
  fail('HOST_FILE_NOT_FOUND', `There is no file at ${JSON.stringify(path)}.`);

const exists = (path: string, what = 'a file'): Failure =>
  fail('HOST_PATH_EXISTS', `There is already ${what} at ${JSON.stringify(path)}.`);

const changed = (path: string): Failure =>
  fail(
    'HOST_FILE_CHANGED',
    `${JSON.stringify(path)} changed after it was read; nothing was written.`
  );

const badRequest = (message: string): Failure => fail('HOST_BAD_REQUEST', message);

/** The shape of a change, checked before anything else (a `put` can come from a request body). */
function shapeProblem(change: unknown, index: number): string | null {
  const at = `Change ${index + 1}`;
  if (typeof change !== 'object' || change === null) return `${at} is not an object.`;
  const c = change as Record<string, unknown>;
  if (typeof c.path !== 'string') return `${at} has no path.`;
  if (c.base !== undefined && typeof c.base !== 'string')
    return `${at} has a base that is not a string.`;
  switch (c.kind) {
    case 'write':
    case 'create':
      if (typeof c.content !== 'string') return `${at} (${c.kind}) has no content.`;
      return null;
    case 'move':
      // Not the node port's words: the entry test reads a quote after this word as an import.
      if (typeof c.from !== 'string') return `${at} (move) has no source path.`;
      if (c.content !== undefined && typeof c.content !== 'string')
        return `${at} (move) has content that is not a string.`;
      return null;
    case 'delete':
      return null;
    default:
      return `${at} has an unknown kind, ${JSON.stringify(c.kind)}.`;
  }
}

/** The folders above a path, nearest the root first. */
function foldersOf(path: string): string[] {
  const segments = path.split('/');
  return segments.slice(1).map((_, i) => segments.slice(0, i + 1).join('/'));
}

/** The paths with every folder above them, sorted by path, as the node port lists them. */
function toNodes(paths: Iterable<string>): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  for (const path of paths) {
    nodes.set(path, { path, type: 'blob' });
    for (const folder of foldersOf(path)) {
      if (!nodes.has(folder)) nodes.set(folder, { path: folder, type: 'tree' });
    }
  }
  return [...nodes.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function checkedFiles(files: Readonly<Record<string, string>>, what: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [path, text] of Object.entries(files)) {
    const refused = pathRefusal(path);
    if (refused !== null) throw new Error(`${what}: ${refused.message}`);
    if (typeof text !== 'string') throw new Error(`${what}: ${JSON.stringify(path)} is not text`);
    map.set(path, text);
  }
  return map;
}

export function createMemoryPort(
  files: Readonly<Record<string, string>>,
  options: MemoryPortOptions = {}
): MemoryPort {
  const current = checkedFiles(files, 'createMemoryPort');
  let committed =
    options.committed === undefined
      ? new Map(current)
      : checkedFiles(options.committed, 'createMemoryPort (committed)');
  // Where each file now was at the last commit: its own path, the path a move
  // took it from, or `null` for a file made since.
  let origin = new Map<string, string | null>(
    [...current.keys()].map((path) => [path, committed.has(path) ? path : null])
  );

  /** Whether a path is a folder: a file sits somewhere under it. */
  const isFolder = (path: string): boolean => {
    const prefix = `${path}/`;
    for (const file of current.keys()) if (file.startsWith(prefix)) return true;
    return false;
  };

  async function list(): Promise<FolderNode[]> {
    return toNodes(current.keys());
  }

  async function get(path: string): Promise<Result<{ text: string; version: string }>> {
    const refused = pathRefusal(path);
    if (refused !== null) return refused;
    const text = current.get(path);
    if (text === undefined) return notFound(path);
    if (byteLength(text) > MEMORY_MAX_TEXT_BYTES) {
      return fail(
        'HOST_FILE_TOO_LARGE',
        `${JSON.stringify(path)} is over ${MEMORY_MAX_TEXT_BYTES / 1024 / 1024} MiB, too large to open as text.`
      );
    }
    if (text.includes('\0')) {
      return fail('HOST_NOT_TEXT', `${JSON.stringify(path)} is not text (it has a NUL character).`);
    }
    return ok({ text, version: digest(text) });
  }

  /** Every change checked against the files as they are, or the first refusal. */
  function check(changes: readonly PortChange[]): Failure | null {
    if (!Array.isArray(changes)) return badRequest('The changes must be a list.');
    for (const [index, change] of changes.entries()) {
      const problem = shapeProblem(change, index);
      if (problem !== null) return badRequest(problem);
    }
    const named = new Set<string>();
    for (const change of changes) {
      for (const path of change.kind === 'move' ? [change.from, change.path] : [change.path]) {
        if (named.has(path)) {
          return badRequest(
            `${JSON.stringify(path)} is named twice; name each path once per call.`
          );
        }
        named.add(path);
      }
    }

    for (const change of changes) {
      // A move's source is checked before its target, so a missing source says so.
      if (change.kind === 'move') {
        const refused = pathRefusal(change.from);
        if (refused !== null) return refused;
        if (!current.has(change.from)) return notFound(change.from);
      }
      const refused = pathRefusal(change.path);
      if (refused !== null) return refused;

      if (change.kind === 'create' || change.kind === 'move') {
        const blocking = foldersOf(change.path).find((folder) => current.has(folder));
        if (blocking !== undefined) return exists(blocking, 'a file where a folder would go,');
        if (current.has(change.path)) return exists(change.path, 'a file');
        if (isFolder(change.path)) return exists(change.path, 'something');
        if (change.kind === 'create') continue;
      }

      const source = change.kind === 'move' ? change.from : change.path;
      const text = current.get(source);
      if (text === undefined) return notFound(source);
      if (change.base !== undefined && digest(text) !== change.base) return changed(source);
    }

    // A new file cannot sit inside another new file.
    const created = changes
      .filter((change) => change.kind === 'create' || change.kind === 'move')
      .map((change) => change.path);
    for (const path of created) {
      const inside = created.find((other) => other.startsWith(`${path}/`));
      if (inside)
        return exists(path, `a new file whose path is a folder of ${JSON.stringify(inside)},`);
    }
    return null;
  }

  async function put(
    changes: readonly PortChange[]
  ): Promise<Result<{ versions: Record<string, string> }>> {
    // Checked and written with nothing awaited between, so calls run one at a time.
    const refused = check(changes);
    if (refused) return refused;
    const versions: Record<string, string> = {};
    for (const change of changes) {
      if (change.kind === 'delete') {
        current.delete(change.path);
        origin.delete(change.path);
        continue;
      }
      if (change.kind === 'move') {
        const text = change.content ?? (current.get(change.from) as string);
        const was = origin.get(change.from) ?? null;
        current.delete(change.from);
        origin.delete(change.from);
        current.set(change.path, text);
        origin.set(change.path, was);
      } else {
        current.set(change.path, change.content);
        if (change.kind === 'create') origin.set(change.path, null);
      }
      versions[change.path] = digest(current.get(change.path) as string);
    }
    return ok({ versions });
  }

  function changes(): HostChange[] {
    const found: HostChange[] = [];
    const movedAway = new Set<string>();
    for (const [path, text] of current) {
      const was = origin.get(path) ?? null;
      if (was !== null && was !== path && !committed.has(path)) {
        movedAway.add(was);
        found.push({ path, status: 'moved', from: was, base: committed.get(was) as string });
        continue;
      }
      // By path: the file at the last commit, if there was one there.
      const base = committed.get(path);
      if (base === undefined) found.push({ path, status: 'new' });
      else if (base !== text) found.push({ path, status: 'changed', base });
    }
    for (const [path, base] of committed) {
      if (!current.has(path) && !movedAway.has(path)) {
        found.push({ path, status: 'deleted', base });
      }
    }
    return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  async function status(): Promise<Record<string, FileStatus>> {
    return Object.fromEntries(changes().map((change) => [change.path, change.status]));
  }

  function commit(paths?: readonly string[]): void {
    if (paths === undefined) {
      committed = new Map(current);
      origin = new Map([...current.keys()].map((path) => [path, path]));
      return;
    }
    const named = new Set(paths);
    for (const change of changes()) {
      if (!named.has(change.path) && !(change.from !== undefined && named.has(change.from))) {
        continue;
      }
      if (change.status === 'deleted') {
        committed.delete(change.path);
        continue;
      }
      if (change.status === 'moved' && change.from !== undefined) committed.delete(change.from);
      committed.set(change.path, current.get(change.path) as string);
      origin.set(change.path, change.path);
    }
    // A file whose old path the commit let go of has nothing left to come from.
    for (const path of current.keys()) {
      const was = origin.get(path) ?? null;
      if (was !== null && !committed.has(was)) origin.set(path, null);
    }
  }

  return {
    list,
    get,
    put,
    status,
    changes,
    commit,
    files: () => Object.fromEntries(current),
  };
}
