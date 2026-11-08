import type { TreeNode } from './types.js';

/** Inventory detection over a synced repo tree (ADR-0022). */

/** Filename that marks a repo Inventory-View-ready (ADR-0022). */
export const INVENTORY_MANIFEST_FILENAME = 'inventory.yaml';

/**
 * The folder a manifest's zones live in, beside it — convention, not
 * configuration. It keeps the storage name `rooms` (ADR-0022's file format, in
 * repositories that already exist); the app calls the groups zones.
 */
export const INVENTORY_ROOMS_DIR = 'rooms';

function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

function joinPath(parent: string, child: string): string {
  return parent === '' ? child : `${parent}/${child}`;
}

/** One detected zone file. */
export interface InventoryZoneFile {
  /** Repo-relative path of the zone's YAML file. */
  path: string;
  /** Filename without extension — the URL segment and default label. */
  slug: string;
}

/** The one inventory space detected in a synced tree. */
export interface InventoryDetection {
  manifestPath: string;
  /** The manifest's directory ('' at repo root) — the space's identity. */
  spacePath: string;
  /** Repo-relative path of the `rooms/` folder (may not exist yet): the storage name. */
  roomsDir: string;
  /** Zone files directly under the `rooms/` folder, sorted by slug. */
  zones: InventoryZoneFile[];
}

/**
 * The paths detection sees: the synced tree's blobs UNIONED with the paths of
 * app-only goods (files created in the app that have no upstream blob yet —
 * `appOnlyEligiblePaths` in `git/gitMetadata.ts`). A zone seeded by "Add
 * zone" therefore takes part in manifest candidacy and zone enumeration
 * exactly as a tree blob does, from the moment it is created until its first
 * PR merges and the refreshed tree carries it (deduped, so the merge does not
 * double it). Callers that render or check in pass the union; the
 * import/reconcile side stays tree-only (an app-only good has no blob to
 * adopt).
 */
function unionBlobPaths(nodes: TreeNode[], appOnlyPaths: string[]): string[] {
  const paths = new Set<string>();
  for (const node of nodes) {
    if (node.type === 'blob') paths.add(node.path);
  }
  for (const path of appOnlyPaths) paths.add(path);
  return [...paths];
}

/**
 * The space anchored at ONE manifest path (ADR-0025: detection is a predicate,
 * not a search): the space is the manifest a view instance points at — never
 * a search for the shallowest one, which is the rule this ADR retired. Zones
 * are the convention: `rooms/*.yaml` directly beside the given manifest.
 */
export function detectInventoryAt(
  manifestPath: string,
  nodes: TreeNode[],
  appOnlyPaths: string[] = []
): InventoryDetection {
  const spacePath = dirname(manifestPath);
  const roomsDir = joinPath(spacePath, INVENTORY_ROOMS_DIR);

  const zones: InventoryZoneFile[] = unionBlobPaths(nodes, appOnlyPaths)
    .filter(
      (path) =>
        path.startsWith(`${roomsDir}/`) &&
        !path.slice(roomsDir.length + 1).includes('/') &&
        path.endsWith('.yaml')
    )
    .map((path) => ({
      path,
      slug: path.slice(roomsDir.length + 1, -'.yaml'.length),
    }))
    .filter((zone) => zone.slug !== '')
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return { manifestPath, spacePath, roomsDir, zones };
}
