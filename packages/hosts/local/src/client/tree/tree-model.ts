// The explorer's tree as data: an entry per path with its children in order, the
// marks by path, and the folders a status rolls up to. No DOM, so the element only
// renders it. Everything is keyed in a `Map`, never an object, so a path segment
// such as `__proto__` or `constructor` is a name like any other.

import type { FolderNode } from '@stillpointlab/common-format/app';

export interface TreeMark {
  /** Shown as a letter beside the name, and rolled up to every folder above as a dot. */
  status?: 'changed' | 'new' | 'moved' | 'deleted';
  /** An app mounted here: the row shows the app's icon and this label, not the folder's name. */
  app?: { label: string; icon: string; unlocked?: boolean };
}

export type RowKind = 'file' | 'folder' | 'app';

export interface TreeEntry {
  path: string;
  /** The last segment of the path. */
  name: string;
  /** 1 for a top-level row (`aria-level`), 0 for the served folder itself. */
  depth: number;
  /** A `tree` node, a folder only implied by the paths under it, or a path with children. */
  folder: boolean;
  /** The children's paths, folders first, then by name with numbers in order. */
  children: string[];
}

export interface TreeModel {
  /** Every entry by path; `''` is the served folder, which has no row. */
  entries: Map<string, TreeEntry>;
  marks: Map<string, TreeMark>;
  /** The folders with a status somewhere below them. */
  rolledUp: Set<string>;
  /** Equal for two models that render the same rows. */
  signature: string;
}

const collator = new Intl.Collator(undefined, { numeric: true });

/** A path the tree can place: not empty, no leading or trailing slash, no empty segment. */
function placeable(path: string): boolean {
  return path !== '' && !path.split('/').includes('');
}

/**
 * Build the model. The nodes may come in any order, and a folder may be missing
 * from them: every folder above a path gets an entry whether or not it has a node
 * of its own. A path that is a `blob` and has paths under it is a folder.
 */
export function buildModel(
  nodes: readonly FolderNode[],
  marks: Readonly<Record<string, TreeMark>> = {}
): TreeModel {
  const entries = new Map<string, TreeEntry>();
  entries.set('', { path: '', name: '', depth: 0, folder: true, children: [] });

  const ensure = (path: string, folder: boolean): TreeEntry => {
    const known = entries.get(path);
    if (known) {
      if (folder) known.folder = true;
      return known;
    }
    const cut = path.lastIndexOf('/');
    const parent = ensure(cut < 0 ? '' : path.slice(0, cut), true);
    const entry = {
      path,
      name: path.slice(cut + 1),
      depth: parent.depth + 1,
      folder,
      children: [],
    };
    parent.children.push(path);
    entries.set(path, entry);
    return entry;
  };
  for (const node of nodes) if (placeable(node.path)) ensure(node.path, node.type === 'tree');

  const order = (a: string, b: string): number => {
    const left = entries.get(a)!;
    const right = entries.get(b)!;
    if (left.folder !== right.folder) return left.folder ? -1 : 1;
    return collator.compare(left.name, right.name) || (a < b ? -1 : a > b ? 1 : 0);
  };
  for (const entry of entries.values()) if (entry.children.length > 1) entry.children.sort(order);

  const markMap = new Map(Object.entries(marks));
  const rolledUp = new Set<string>();
  for (const [path, mark] of markMap) {
    if (!mark.status) continue;
    for (let cut = path.lastIndexOf('/'); cut > 0; cut = path.lastIndexOf('/', cut - 1)) {
      rolledUp.add(path.slice(0, cut));
    }
  }

  // The rows in order, then the marks: two models with the same signature render alike.
  const lines: string[] = [];
  const walk = (entry: TreeEntry): void => {
    for (const child of entry.children) {
      const next = entries.get(child)!;
      lines.push(next.folder ? `${child}/` : child);
      walk(next);
    }
  };
  walk(entries.get('')!);
  const signature = `${lines.join('\n')}\n${JSON.stringify([...markMap].sort())}`;

  return { entries, marks: markMap, rolledUp, signature };
}

/** Whether the row opens and closes: a folder, or an app with children among the nodes. */
export function expandable(entry: TreeEntry, mark: TreeMark | undefined): boolean {
  return entry.children.length > 0 || (entry.folder && !mark?.app);
}

export function kindOf(entry: TreeEntry | undefined, mark: TreeMark | undefined): RowKind {
  if (mark?.app) return 'app';
  return entry && expandable(entry, mark) ? 'folder' : 'file';
}
