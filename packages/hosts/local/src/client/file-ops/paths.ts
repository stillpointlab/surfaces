// What the explorer's writes need from the listing, as data: which paths are
// files and folders, the files under a folder, the checks a path must pass before
// it is sent, and the changes a rename or a delete sends. No DOM.
//
// The files under a folder come from the listing the page gave the tree, so a
// folder rename or delete is as complete as that listing. Two kinds of folder are
// not: a cut listing (`truncated`) may stop part way through one, and a separate
// repository (a submodule, or a repository nested without being one) is listed as
// one folder with nothing under it. The page offers neither write on them.

import { words } from '../words';

import type { FolderNode } from '@stillpointlab/common-format/app';
import type { PortChange } from '@stillpointlab/common-format/host';

export interface ListingIndex {
  files: ReadonlySet<string>;
  /** Folders, listed or implied by the paths under them. */
  folders: ReadonlySet<string>;
  /** Folders listed with nothing under them: separate repositories. */
  separate: ReadonlySet<string>;
  /** The listing was cut, so a folder's files may not all be known. */
  truncated: boolean;
}

export function indexListing(nodes: readonly FolderNode[], truncated = false): ListingIndex {
  const files = new Set<string>();
  const folders = new Set<string>();
  const holding = new Set<string>();
  for (const node of nodes) {
    if (node.type === 'blob') files.add(node.path);
    else folders.add(node.path);
    for (let cut = node.path.lastIndexOf('/'); cut > 0; cut = node.path.lastIndexOf('/', cut - 1)) {
      const folder = node.path.slice(0, cut);
      if (holding.has(folder)) break;
      holding.add(folder);
      folders.add(folder);
    }
  }
  // A path listed as a file with paths under it is a folder, as the tree shows it.
  for (const folder of holding) files.delete(folder);
  const separate = new Set([...folders].filter((folder) => !holding.has(folder)));
  return { files, folders, separate, truncated };
}

/** `path` is `folder` or inside it. */
export function isWithin(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

/** The files under a folder, at any depth, in path order. */
export function filesUnder(index: ListingIndex, folder: string): string[] {
  return [...index.files].filter((path) => path.startsWith(`${folder}/`)).sort();
}

/** Why a folder's files cannot all be moved or deleted from here, or null. */
export function folderProblem(index: ListingIndex, folder: string): string | null {
  if (index.separate.has(folder)) return words.menu.separate;
  for (const path of index.separate) {
    if (path.startsWith(`${folder}/`)) return words.menu.holdsSeparate;
  }
  if (index.truncated) return words.menu.truncated;
  return null;
}

/** What a path is renamed from, when the check is for a rename. */
export interface Renaming {
  from: string;
  kind: 'file' | 'folder';
}

/**
 * Why `path` cannot be created, or renamed to: the page's own check before
 * anything is sent. The server checks again, and refuses what this lets by (a
 * `.` segment, a backslash, git's folder, a file the listing did not show).
 */
export function pathProblem(index: ListingIndex, path: string, renaming?: Renaming): string | null {
  const check = words.fileOps.check;
  if (path === '') return check.empty;
  if (path.startsWith('/')) return check.leadingSlash;
  if (path.split('/').includes('..')) return check.dotDot;
  if (path.endsWith('/')) return check.noName;
  if (renaming?.kind === 'folder' && path.startsWith(`${renaming.from}/`)) {
    return check.insideItself;
  }
  if (index.files.has(path)) return check.fileExists(path);
  if (index.folders.has(path)) return check.folderExists(path);
  for (let cut = path.indexOf('/'); cut > 0; cut = path.indexOf('/', cut + 1)) {
    const above = path.slice(0, cut);
    if (index.files.has(above)) return check.fileInTheWay(above);
  }
  return null;
}

/** The version to send as a path's `base`, when the page holds one. */
export type BaseOf = (path: string) => string | null;

function withBase<T extends PortChange>(change: T, base: string | null): T {
  return base === null ? change : { ...change, base };
}

/** A rename: one `move` for a file, one per file under a folder; all in one `put`. */
export function renameChanges(
  index: ListingIndex,
  renaming: Renaming,
  to: string,
  baseOf: BaseOf
): PortChange[] {
  const { from } = renaming;
  const paths = renaming.kind === 'file' ? [from] : filesUnder(index, from);
  return paths.map((path) =>
    withBase(
      { kind: 'move' as const, from: path, path: to + path.slice(from.length) },
      baseOf(path)
    )
  );
}

/** A delete: one `delete` for a file, one per file under a folder; all in one `put`. */
export function deleteChanges(
  index: ListingIndex,
  path: string,
  kind: 'file' | 'folder',
  baseOf: BaseOf
): PortChange[] {
  const paths = kind === 'file' ? [path] : filesUnder(index, path);
  return paths.map((file) => withBase({ kind: 'delete' as const, path: file }, baseOf(file)));
}

/** Where a path went in a rename of `from` to `to`, or undefined when it was not moved. */
export function movedTo(path: string, from: string, to: string): string | undefined {
  return isWithin(path, from) ? to + path.slice(from.length) : undefined;
}

/** The name selected in a rename's field: the last segment. */
export function nameRange(path: string): [start: number, end: number] {
  return [path.lastIndexOf('/') + 1, path.length];
}
