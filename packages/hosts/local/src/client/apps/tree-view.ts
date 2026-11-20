// What the tree shows of the folder once the apps are in it, as data. No DOM.
//
// - A locked instance's region is left out of the nodes: under its folder, or a
//   root instance's scope. A folder the hiding empties goes with it; a folder
//   listed with nothing under it (a separate repository) stays.
// - An instance in a folder marks that folder as the app's row, unlocked or not.
//   Unlocked, its files stay under the row.
// - Every status stays among the marks, so a changed file in a hidden region
//   still rolls up to its folders and the app's row shows the dot.
// - An instance at the root has no folder to stand for it: it is one of `roots`,
//   which the page draws above the tree.
//
// The listing the explorer writes from stays whole; this is only what is drawn.

import { inRegion } from '../../shared/apps';

import type { FoundInstance } from '../../shared/apps';
import type { TreeMark } from '../tree/host-file-tree';
import type { FolderNode } from '@stillpointlab/common-format/app';
import type { FileStatus } from '@stillpointlab/common-format/host';

export interface AppTreeView {
  nodes: FolderNode[];
  marks: Record<string, TreeMark>;
  /** The instances at the served root, for the rows above the tree. */
  roots: FoundInstance[];
}

export function appTreeView(
  nodes: readonly FolderNode[],
  statuses: Readonly<Record<string, FileStatus>>,
  instances: readonly FoundInstance[]
): AppTreeView {
  const locked = instances.filter((instance) => !instance.unlocked);
  const hidden = (path: string): boolean =>
    locked.some((instance) =>
      instance.folder === '' ? inRegion(instance, path) : path.startsWith(`${instance.folder}/`)
    );

  // A folder whose every listed path is hidden goes too.
  const under = new Map<string, { all: number; hidden: number }>();
  for (const node of nodes) {
    const gone = hidden(node.path);
    for (let cut = node.path.lastIndexOf('/'); cut > 0; cut = node.path.lastIndexOf('/', cut - 1)) {
      const folder = node.path.slice(0, cut);
      const count = under.get(folder) ?? { all: 0, hidden: 0 };
      count.all += 1;
      if (gone) count.hidden += 1;
      under.set(folder, count);
    }
  }
  const rows = new Set(instances.filter((i) => i.folder !== '').map((i) => i.folder));
  const emptied = (path: string): boolean => {
    if (rows.has(path)) return false;
    const count = under.get(path);
    return count !== undefined && count.all > 0 && count.all === count.hidden;
  };
  const shown = nodes.filter((node) => !hidden(node.path) && !emptied(node.path));
  // An app's row is there whether or not the listing names its folder.
  const listed = new Set(shown.map((node) => node.path));
  for (const folder of rows) {
    if (!listed.has(folder) && !hidden(folder)) shown.push({ path: folder, type: 'tree' });
  }

  // Own properties only, so a path named `__proto__` is a path like any other.
  const marks: Record<string, TreeMark> = Object.fromEntries(
    Object.entries(statuses).map(([path, status]) => [path, { status }])
  );
  for (const instance of instances) {
    if (instance.folder === '') continue;
    const app = {
      label: instance.label,
      icon: instance.icon,
      ...(instance.unlocked ? { unlocked: true } : {}),
    };
    marks[instance.folder] = {
      ...(Object.hasOwn(marks, instance.folder) ? marks[instance.folder] : {}),
      app,
    };
  }

  return { nodes: shown, marks, roots: instances.filter((instance) => instance.folder === '') };
}

/** Whether any status falls in the instance's region: its row's dot. */
export function holdsChanges(
  instance: FoundInstance,
  statuses: Readonly<Record<string, FileStatus>>
): boolean {
  return Object.keys(statuses).some((path) => inRegion(instance, path));
}

/** The locked instance whose region holds `path`, or `null`. */
export function lockedBy(instances: readonly FoundInstance[], path: string): FoundInstance | null {
  return instances.find((instance) => !instance.unlocked && inRegion(instance, path)) ?? null;
}

/** Whether a folder holds a locked instance's files, so its writes would be refused. */
export function holdsLocked(instances: readonly FoundInstance[], folder: string): boolean {
  return instances.some((instance) => {
    if (instance.unlocked) return false;
    if (instance.folder !== '') return instance.folder.startsWith(`${folder}/`);
    return (instance.scope ?? []).some((path) => path.startsWith(`${folder}/`));
  });
}
