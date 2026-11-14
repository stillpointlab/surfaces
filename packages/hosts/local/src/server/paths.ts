// Confinement: which paths the port answers, and where on disk they lead.
//
// Two checks, in order. The first reads the path alone: it must be relative, with
// `/` separators, and name no `..`, `.`, empty or NUL segment, no backslash, and
// nothing git would take for its own folder. The second asks the disk: the real
// path of the nearest thing that exists along the path (the file, or the folder
// that would hold it) must be inside the real path of the root. A symbolic link
// that leaves the root fails the second check wherever it stands on the path, so
// it is listed and cannot be opened, written through, moved or deleted.

import { lstat, readlink, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

import { fail } from '@stillpointlab/common-format/app';

import type { Failure } from '@stillpointlab/common-format/app';

// Code points HFS+ ignores in a name, so `.g` U+200C `it` is `.git` there (git's own list).
const IGNORABLE = /[\u200c-\u200f\u202a-\u202e\u206a-\u206f\ufeff]/g;

/**
 * Whether a name is, or on some file system would be, git's folder: `.git` in any
 * case, with the code points HFS+ ignores, and with the trailing dots and spaces
 * Windows drops, plus its short name `git~1`. A look-alike made of other letters
 * (a Cyrillic `і`) is a different name everywhere, and is allowed.
 */
export function isGitName(name: string): boolean {
  const folded = name
    .normalize('NFC')
    .replace(IGNORABLE, '')
    .replace(/[. ]+$/, '')
    .toLowerCase();
  return folded === '.git' || folded === 'git~1';
}

/** The first check: what is wrong with the path as written, or `null` for nothing. */
export function pathProblem(path: unknown): string | null {
  if (typeof path !== 'string') return 'A path must be a string.';
  if (path === '') return 'The path is empty.';
  if (path.includes('\0')) return 'The path has a NUL character.';
  if (path.includes('\\')) return 'The path has a backslash; separate folders with "/".';
  if (path.startsWith('/') || isAbsolute(path)) return 'The path is absolute.';
  for (const segment of path.split('/')) {
    if (segment === '') return 'The path has an empty segment.';
    if (segment === '..' || segment === '.') return `The path has a "${segment}" segment.`;
    if (isGitName(segment)) return "The path names git's own folder.";
  }
  return null;
}

/** A refusal for a path outside the root. */
export function outsideRoot(path: string, why: string): Failure {
  return fail(
    'HOST_PATH_OUTSIDE_ROOT',
    `${JSON.stringify(path)} is outside the served folder: ${why}`
  );
}

/** Whether `path` (a real path) is the root or under it. */
export function isInside(root: string, path: string): boolean {
  return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
}

/**
 * Where a path leads, on disk. Every path in it is real (no link left to follow)
 * except `entry`, the name itself, which a move or a delete acts on.
 */
export type Location =
  /** A link along the path, or the name itself, leads outside the root. */
  | { kind: 'outside' }
  /** A file: `real` is where its bytes are, `entry` the name in its real folder (maybe a link). */
  | { kind: 'file'; real: string; entry: string }
  /** Something that is not a file: a folder, a link that leads nowhere, a socket. */
  | { kind: 'other'; entry: string }
  /** Nothing there yet: `base` is the real folder that exists, `rest` the names to make under it. */
  | { kind: 'missing'; base: string; rest: string[] }
  /** Something that is not a folder stands where a folder would have to be. */
  | { kind: 'blocked'; at: string };

const MAX_LINKS = 40;

function code(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}

function isMissing(error: unknown): boolean {
  const c = code(error);
  return c === 'ENOENT' || c === 'ENOTDIR';
}

/**
 * The real path of the nearest thing along `path` (absolute) that exists, after
 * every link, including links that lead nowhere: where those would lead decides.
 * `null` when the links loop or run past `MAX_LINKS`.
 */
async function nearestReal(path: string, hops = 0): Promise<string | null> {
  if (hops > MAX_LINKS) return null;
  let at = path;
  for (;;) {
    try {
      return await realpath(at);
    } catch (error) {
      if (!isMissing(error) && code(error) !== 'ELOOP') throw error;
    }
    // `at` does not resolve: either it is not there, or it is a link that leads
    // nowhere (or loops). Follow such a link by hand; otherwise go up.
    let isLink = false;
    try {
      isLink = (await lstat(at)).isSymbolicLink();
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    if (isLink) {
      const folder = await nearestReal(dirname(at), hops + 1);
      if (folder === null) return null;
      return nearestReal(resolve(folder, await readlink(at)), hops + 1);
    }
    const up = dirname(at);
    if (up === at) return null;
    at = up;
  }
}

/**
 * The second check, and where the path leads. `root` must be a real path, and
 * `path` must have passed `pathProblem`.
 */
export async function locate(root: string, path: string): Promise<Location> {
  const segments = path.split('/');
  const lexical = join(root, ...segments);

  // The folder that holds the name, as a real path. Every link on the way is
  // followed, so a link to a folder outside fails here wherever it stands.
  const folder = await nearestReal(dirname(lexical));
  if (folder === null || !isInside(root, folder)) return { kind: 'outside' };

  let exists = true;
  try {
    await lstat(lexical);
  } catch (error) {
    if (!isMissing(error)) throw error;
    exists = false;
  }

  if (exists) {
    const entry = join(folder, segments[segments.length - 1]);
    const real = await nearestReal(lexical);
    if (real === null || !isInside(root, real)) return { kind: 'outside' };
    try {
      if ((await stat(real)).isFile() && real === (await realpath(lexical))) {
        return { kind: 'file', real, entry };
      }
    } catch (error) {
      if (!isMissing(error) && code(error) !== 'ELOOP') throw error;
    }
    return { kind: 'other', entry };
  }

  // Nothing at the path: find the deepest folder along it that exists.
  for (let depth = segments.length - 1; depth >= 0; depth -= 1) {
    const at = join(root, ...segments.slice(0, depth));
    let found: Awaited<ReturnType<typeof lstat>>;
    try {
      found = await lstat(at);
    } catch (error) {
      if (!isMissing(error)) throw error;
      continue;
    }
    const real = await nearestReal(at);
    if (real === null || !isInside(root, real)) return { kind: 'outside' };
    // It must itself resolve to a folder: a link that leads nowhere is in the way,
    // even when where it would lead is inside the root.
    let folderReal: string | null = null;
    try {
      const resolved = await realpath(at);
      if (found.isDirectory() || (await stat(resolved)).isDirectory()) folderReal = resolved;
    } catch (error) {
      if (!isMissing(error) && code(error) !== 'ELOOP') throw error;
    }
    if (folderReal === null) return { kind: 'blocked', at: segments.slice(0, depth).join('/') };
    return { kind: 'missing', base: folderReal, rest: segments.slice(depth) };
  }
  return { kind: 'missing', base: root, rest: segments };
}
