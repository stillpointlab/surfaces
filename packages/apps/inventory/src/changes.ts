/**
 * The inventory's facts from file changes alone (the app contract's
 * `fromChanges`), for a host that knows only which files differ from the last
 * check-in: the space is enabled, and its dirty files are the changed, new and
 * moved ones that are its manifest or one of its zones, in the order the space
 * lists them (the manifest, then the zones by slug), a new one marked so and a
 * moved one with the path it had. A deleted file has no row to mark.
 *
 * A moved file counts: a zone renamed by hand differs from the last check-in,
 * and a host's own commit would list it. (The app's spec named changed and new
 * files only.)
 */
import { detectInventoryAt } from './detection.js';

import type { InventoryHostFacts, InventorySnapshot } from './space.js';
import type { SharedInventoryDirtyFile } from './types.js';
import type { AppFileChange, AppKnown } from '@stillpointlab/common-format/app';

export function inventoryFromChanges(
  changes: readonly AppFileChange[],
  snapshot: InventorySnapshot
): AppKnown<InventoryHostFacts, InventorySnapshot> {
  const status = new Map<string, AppFileChange>();
  for (const change of changes) {
    if (change.status !== 'deleted') status.set(change.path, change);
  }
  const detection = detectInventoryAt(snapshot.manifestPath, [], [...snapshot.paths]);
  const files: { path: string; kind: SharedInventoryDirtyFile['kind'] }[] = [
    { path: detection.manifestPath, kind: 'manifest' },
    ...detection.zones.map((zone) => ({ path: zone.path, kind: 'zone' as const })),
  ];
  const dirty: SharedInventoryDirtyFile[] = [];
  for (const { path, kind } of files) {
    const change = status.get(path);
    if (change === undefined) continue;
    dirty.push({
      path,
      kind,
      ...(change.status === 'new' ? { newFile: true as const } : {}),
      ...(change.status === 'moved' && change.from !== undefined && change.from !== path
        ? { movedFrom: change.from }
        : {}),
    });
  }
  return { facts: { enabled: true, dirty } };
}
