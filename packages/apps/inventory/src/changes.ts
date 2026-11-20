/**
 * The inventory's facts from file changes alone (the app contract's
 * `fromChanges`), for a host that knows only which files differ from the last
 * check-in: the space is enabled, and its dirty files are the changed and new
 * ones that are its manifest or one of its zones, in the order the space lists
 * them (the manifest, then the zones by slug), a new one marked so. A deleted
 * file has no row to mark; a moved one is not counted either (the spec names
 * changed and new files only).
 */
import { detectInventoryAt } from './detection.js';

import type { InventoryHostFacts, InventorySnapshot } from './space.js';
import type { SharedInventoryDirtyFile } from './types.js';
import type { AppFileChange, AppKnown } from '@stillpointlab/common-format/app';

export function inventoryFromChanges(
  changes: readonly AppFileChange[],
  snapshot: InventorySnapshot
): AppKnown<InventoryHostFacts, InventorySnapshot> {
  const status = new Map<string, AppFileChange['status']>();
  for (const change of changes) {
    if (change.status === 'changed' || change.status === 'new')
      status.set(change.path, change.status);
  }
  const detection = detectInventoryAt(snapshot.manifestPath, [], [...snapshot.paths]);
  const files: { path: string; kind: SharedInventoryDirtyFile['kind'] }[] = [
    { path: detection.manifestPath, kind: 'manifest' },
    ...detection.zones.map((zone) => ({ path: zone.path, kind: 'zone' as const })),
  ];
  const dirty: SharedInventoryDirtyFile[] = [];
  for (const { path, kind } of files) {
    const changed = status.get(path);
    if (changed === undefined) continue;
    dirty.push({ path, kind, ...(changed === 'new' ? { newFile: true as const } : {}) });
  }
  return { facts: { enabled: true, dirty } };
}
