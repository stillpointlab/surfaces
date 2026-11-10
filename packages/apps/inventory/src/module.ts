/**
 * The inventory app as a host runs it (the app contract's `AppModule`): the
 * lifecycle and the core, which of the elements' ops are the core's, the
 * elements' replies, and how a host treats each refusal.
 */
import { fail, ok } from '@stillpointlab/common-format/app';

import { inventoryCore } from './core.js';
import { inventoryLifecycle } from './lifecycle.js';

import type { InventoryCoreOps, InventoryViews } from './core.js';
import type { CreateInventoryInput } from './create.js';
import type { InventoryOps } from './elementOps.js';
import type { InventoryHostFacts, InventorySnapshot } from './space.js';
import type { AppCoreOp, AppModule, RefusalClass } from '@stillpointlab/common-format/app';

/**
 * How a host treats each refusal. The classes are the statuses Context
 * Manager's endpoints have always sent: a missing zone is not found, while an
 * item gone since the state was read is a conflict (the element reloads).
 * Anything unlisted is `invalid`.
 */
const REFUSAL_CLASS: Readonly<Record<string, RefusalClass>> = {
  INVENTORY_MANIFEST_NOT_FOUND: 'not-found',
  INVENTORY_ZONE_NOT_FOUND: 'not-found',
  INVENTORY_SCHEMA_INVALID: 'conflict',
  INVENTORY_ROOM_EXISTS: 'conflict',
  INVENTORY_PATH_EXISTS: 'conflict',
  INVENTORY_ROOM_READ_ONLY: 'conflict',
  INVENTORY_CONTENT_UNAVAILABLE: 'conflict',
  INVENTORY_ITEM_NOT_FOUND: 'conflict',
  INVENTORY_ITEM_READ_ONLY: 'conflict',
};

/** A zone file's slug: its name, as detection reads it. */
const slugOf = (path: string): string =>
  path.slice(path.lastIndexOf('/') + 1).replace(/\.yaml$/, '');

export const inventoryModule: AppModule<
  InventoryViews,
  InventoryCoreOps,
  InventoryHostFacts,
  CreateInventoryInput,
  InventorySnapshot,
  InventoryOps
> = {
  id: 'inventory',
  lifecycle: inventoryLifecycle,
  core: inventoryCore,
  coreOps: ['add-zone', 'add-item', 'update-item', 'delete-item'],
  hostOps: ['link-editor'],
  // The elements ask with the core's own fields.
  toCoreOp: (op) => op as AppCoreOp<InventoryCoreOps>,
  reply: (op, _applied, { snapshot, facts }) => {
    if (op.type === 'add-zone') {
      const space = inventoryCore.project(snapshot, { type: 'space' }, facts);
      return space ? ok({ space }) : fail('INVENTORY_MANIFEST_NOT_FOUND', 'The inventory is gone');
    }
    const path = (op as { path: string }).path;
    const state = inventoryCore.project(snapshot, { type: 'zone', slug: slugOf(path) }, facts);
    return state ? ok({ state }) : fail('INVENTORY_ZONE_NOT_FOUND', `No zone at ${path}`);
  },
  refusalClass: (code) => REFUSAL_CLASS[code] ?? 'invalid',
};
