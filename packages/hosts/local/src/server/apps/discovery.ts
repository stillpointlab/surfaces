// Finding instances over the port's whole listing: every file named a module's
// `lifecycle.manifestName` is a candidate, and the module's lifecycle says whether
// it is valid, what it owns and what it is called.
//
// An instance's region (`inRegion` in `src/shared/apps.ts`) is the manifest's
// folder and everything under it; at the served root, where there is no folder
// to stand for it, it is the scope's paths and nothing else. Two instances whose
// regions share a path are both reported with an error naming the other, and
// neither mounts: one executor per path (Context Manager's ADR-0028).

import type { FoundInstance } from '../../shared/apps';
import type { AnyAppModule, FolderNode } from '@stillpointlab/common-format/app';
import type { StoragePort } from '@stillpointlab/common-format/host';

/** The folder a manifest sits in: `''` at the root. */
export function folderOf(manifestPath: string): string {
  const cut = manifestPath.lastIndexOf('/');
  return cut === -1 ? '' : manifestPath.slice(0, cut);
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

const isWithin = (path: string, folder: string): boolean =>
  path === folder || path.startsWith(`${folder}/`);

/** Whether two instances' regions share a path. */
function overlaps(a: FoundInstance, b: FoundInstance): boolean {
  if (a.folder !== '' && b.folder !== '') {
    return isWithin(a.folder, b.folder) || isWithin(b.folder, a.folder);
  }
  if (a.folder === '' && b.folder === '') {
    const paths = new Set(a.scope);
    return (b.scope ?? []).some((path) => paths.has(path));
  }
  const [root, inFolder] = a.folder === '' ? [a, b] : [b, a];
  return (root.scope ?? []).some((path) => isWithin(path, inFolder.folder));
}

/** The words for an overlap, naming the other instance. */
function overlapError(other: FoundInstance): string {
  return `Its files overlap the ${other.app} app at ${other.manifestPath}, so neither opens.`;
}

/**
 * Every instance in the listing, sorted by manifest path. `unlocked` is the set
 * of unlocked manifest paths; every other instance is locked.
 */
export async function discover(
  port: Pick<StoragePort, 'list' | 'get'>,
  modules: readonly AnyAppModule[],
  unlocked: ReadonlySet<string>,
  listed?: FolderNode[]
): Promise<FoundInstance[]> {
  const nodes = listed ?? (await port.list());
  const byName = new Map<string, AnyAppModule>();
  for (const module of modules) {
    if (!byName.has(module.lifecycle.manifestName))
      byName.set(module.lifecycle.manifestName, module);
  }
  const candidates = nodes
    .filter((node) => node.type === 'blob' && byName.has(nameOf(node.path)))
    .map((node) => node.path)
    .sort();

  const found = await Promise.all(
    candidates.map(async (manifestPath): Promise<FoundInstance> => {
      const module = byName.get(nameOf(manifestPath))!;
      const folder = folderOf(manifestPath);
      const read = await port.get(manifestPath);
      const content = read.ok ? read.text : null;
      const errors: string[] = [];
      let scope: string[] = [manifestPath];
      if (!read.ok) errors.push(read.message);
      else {
        const scoped = module.lifecycle.validateAndScope(read.text, nodes, manifestPath);
        if (scoped.ok) scope = [...new Set([manifestPath, ...scoped.scope])].sort();
        else errors.push(...(scoped.details.length > 0 ? scoped.details : [scoped.message]));
      }
      const { label } = module.lifecycle.describeInstance(content, nodes, manifestPath, []);
      return {
        app: module.id,
        manifestPath,
        folder,
        label,
        icon: module.meta.icon,
        valid: errors.length === 0,
        errors,
        unlocked: unlocked.has(manifestPath),
        ...(folder === '' ? { scope } : {}),
      };
    })
  );

  // Overlaps are read from the regions as found, before any is marked.
  const overlapping = found.map((instance) =>
    found.filter((other) => other !== instance && overlaps(instance, other))
  );
  return found.map((instance, i) => {
    const others = overlapping[i];
    if (others.length === 0) return instance;
    return {
      ...instance,
      valid: false,
      errors: [...instance.errors, ...others.map(overlapError)],
    };
  });
}
