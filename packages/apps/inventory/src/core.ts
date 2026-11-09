/**
 * The inventory core as the app contract's `AppCore`: the projections, ops and
 * create plan of `space.ts`, `ops.ts` and `create.ts` behind `project`, `apply`
 * and `seed`. A host may call either: the contract when it is generic (the
 * harness), the named functions when it is not (Context Manager).
 */
import { fail } from '@stillpointlab/common-format/app';

import { planInventoryCreate } from './create.js';
import {
  addInventoryItem,
  addInventoryZone,
  deleteInventoryItem,
  updateInventoryItem,
} from './ops.js';
import { projectInventorySpace, projectInventoryZone } from './space.js';

import type { CreateInventoryInput } from './create.js';
import type { AddInventoryItemInput, UpdateInventoryItemInput } from './ops.js';
import type { InventoryHostFacts, InventorySnapshot } from './space.js';
import type { SharedInventorySpace, SharedInventoryZoneState } from './types.js';
import type { AppApplyResult, AppCore, AppCoreOp, Result } from '@stillpointlab/common-format/app';

/** The two states the inventory elements render. */
export type InventoryViews = {
  /** The overview, for `<spl-inventory-overview>`. */
  space: { params: object; state: SharedInventorySpace };
  /** One zone, by slug, for `<spl-inventory-zone>`. */
  zone: { params: { slug: string }; state: SharedInventoryZoneState };
};

/** The ops, named and shaped as the elements ask for them. */
export type InventoryCoreOps = {
  'add-zone': { op: { title: string }; result: { slug: string; path: string } };
  'add-item': { op: { path: string; item: AddInventoryItemInput }; result: { id: string } };
  'update-item': {
    op: { path: string; id: string; changes: UpdateInventoryItemInput };
    result: object;
  };
  'delete-item': { op: { path: string; id: string }; result: object };
};

/** One op, narrowed by its type, to the named function that answers it. */
function applyOp(snapshot: InventorySnapshot, op: AppCoreOp<InventoryCoreOps>): Result<object> {
  switch (op.type) {
    case 'add-zone':
      return addInventoryZone(snapshot, op);
    case 'add-item':
      return addInventoryItem(snapshot, op);
    case 'update-item':
      return updateInventoryItem(snapshot, op);
    case 'delete-item':
      return deleteInventoryItem(snapshot, op);
    default:
      return fail(
        'INVENTORY_UNKNOWN_OP',
        `The inventory has no "${(op as { type: string }).type}" op`
      );
  }
}

export const inventoryCore: AppCore<
  InventoryViews,
  InventoryCoreOps,
  InventoryHostFacts,
  CreateInventoryInput
> = {
  project: (snapshot, view, facts) =>
    view.type === 'space'
      ? projectInventorySpace(snapshot, facts)
      : projectInventoryZone(snapshot, (view as { slug: string }).slug, facts),
  // Each named function answers its op's result; the contract's per-type
  // signature is one TypeScript cannot follow through a switch.
  apply: <K extends keyof InventoryCoreOps & string>(
    snapshot: InventorySnapshot,
    op: { type: K } & InventoryCoreOps[K]['op']
  ) => applyOp(snapshot, op as AppCoreOp<InventoryCoreOps>) as AppApplyResult<InventoryCoreOps, K>,
  seed: planInventoryCreate,
};
