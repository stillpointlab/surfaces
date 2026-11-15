// The label of an explorer's write, worded from its changes: what the Undo and
// Redo buttons show ("Undo: Delete notes.md"). The explorer sends one `create`
// for a new file, one `move` per file for a rename and one `delete` per file for
// a delete, a folder's all in one call; so a label names one file, a renamed
// folder, or how many files and the folder that holds them all.

import type { PortChange } from '@stillpointlab/common-format/host';

const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

const folderOf = (path: string): string => {
  const cut = path.lastIndexOf('/');
  return cut === -1 ? '' : path.slice(0, cut);
};

/** The deepest folder that holds every path: `''` for the served root. */
function commonFolder(paths: readonly string[]): string {
  let common = folderOf(paths[0]);
  for (const path of paths.slice(1)) {
    while (common !== '' && !path.startsWith(`${common}/`)) common = folderOf(common);
  }
  return common;
}

const files = (count: number): string => `${count} ${count === 1 ? 'file' : 'files'}`;

/** A folder's rename: each file kept its path under the folder, which moved. */
function folderMove(moves: readonly { from: string; path: string }[]): [string, string] | null {
  const from = commonFolder(moves.map((move) => move.from));
  const to = commonFolder(moves.map((move) => move.path));
  if (from === '' || to === '') return null;
  const same = moves.every((move) => move.from.slice(from.length) === move.path.slice(to.length));
  return same ? [from, to] : null;
}

/** The label for a write of creates, moves and deletes, as the explorer sends them. */
export function labelFor(changes: readonly PortChange[]): string {
  const kinds = new Set(changes.map((change) => change.kind));
  if (changes.length === 0) return 'Change nothing';
  if (kinds.size > 1) return `Change ${files(changes.length)}`;
  const [first] = changes;
  if (changes.length === 1) {
    if (first.kind === 'create') return `Create ${nameOf(first.path)}`;
    if (first.kind === 'delete') return `Delete ${nameOf(first.path)}`;
    if (first.kind === 'move') {
      return folderOf(first.from) === folderOf(first.path)
        ? `Rename ${nameOf(first.from)} to ${nameOf(first.path)}`
        : `Move ${nameOf(first.from)} to ${folderOf(first.path) || 'the top folder'}`;
    }
    return `Change ${nameOf(first.path)}`;
  }
  const paths = changes.map((change) => change.path);
  const where = commonFolder(paths);
  const inWhere = where === '' ? '' : ` in ${nameOf(where)}`;
  switch (first.kind) {
    case 'create':
      return `Create ${files(changes.length)}${inWhere}`;
    case 'delete':
      return `Delete ${files(changes.length)}${inWhere}`;
    case 'move': {
      const moves = changes as readonly { from: string; path: string }[];
      const folder = folderMove(moves);
      if (folder) {
        const [from, to] = folder;
        return folderOf(from) === folderOf(to)
          ? `Rename ${nameOf(from)} to ${nameOf(to)}`
          : `Move ${nameOf(from)} to ${folderOf(to) || 'the top folder'}`;
      }
      return `Move ${files(changes.length)}`;
    }
    default:
      return `Change ${files(changes.length)}${inWhere}`;
  }
}
