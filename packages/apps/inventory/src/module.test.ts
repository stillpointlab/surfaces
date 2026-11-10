import { describe, expect, it } from 'vitest';

import { inventoryModule } from './module.js';
import { applyChanges, HOUSE, NO_FACTS, snapshotOf } from './snapshot.fixtures.js';

import type { InventoryOps } from './elementOps.js';
import type { AppOp } from '@stillpointlab/common-format/app';

// Every element op, so a new one fails to compile until the module places it.
const ELEMENT_OPS = {
  'add-zone': true,
  'add-item': true,
  'update-item': true,
  'delete-item': true,
  'link-editor': true,
} satisfies Record<keyof InventoryOps, true>;

/** An element op applied as a host does, and the module's reply to it. */
function run(op: AppOp<InventoryOps>) {
  const before = snapshotOf(HOUSE);
  const applied = inventoryModule.core.apply(
    before,
    inventoryModule.toCoreOp(op, { now: '2026-11-10T00:00:00.000Z' })
  );
  if (!applied.ok) return applied;
  const after = applyChanges(before, applied.changes);
  return inventoryModule.reply(op, applied, { snapshot: after, facts: NO_FACTS });
}

describe('inventoryModule', () => {
  it('names every element op once, as the core’s or the host’s', () => {
    const named = [...inventoryModule.coreOps, ...inventoryModule.hostOps];
    expect([...named].sort()).toEqual(Object.keys(ELEMENT_OPS).sort());
    expect(new Set(named).size).toBe(named.length);
  });

  it('answers an item op with the zone after it', () => {
    const reply = run({ type: 'add-item', path: 'rooms/kitchen.yaml', item: { title: 'Kettle' } });
    expect(reply.ok).toBe(true);
    const state = (reply as unknown as { state: { zone: { items: { title: string }[] } } }).state;
    expect(state.zone.items.map((item) => item.title)).toContain('Kettle');
  });

  it('answers a new zone with the space after it', () => {
    const reply = run({ type: 'add-zone', title: 'Garage' });
    expect(reply.ok).toBe(true);
    const space = (reply as unknown as { space: { zones: { label: string }[] } }).space;
    expect(space.zones.map((zone) => zone.label)).toContain('Garage');
  });

  // The statuses Context Manager's inventory endpoints send, pinned so the
  // generic route sends the same ones.
  it.each([
    ['INVENTORY_MANIFEST_NOT_FOUND', 'not-found'],
    ['INVENTORY_ZONE_NOT_FOUND', 'not-found'],
    ['INVENTORY_ITEM_NOT_FOUND', 'conflict'],
    ['INVENTORY_ROOM_EXISTS', 'conflict'],
    ['INVENTORY_PATH_EXISTS', 'conflict'],
    ['INVENTORY_ROOM_READ_ONLY', 'conflict'],
    ['INVENTORY_ITEM_READ_ONLY', 'conflict'],
    ['INVENTORY_CONTENT_UNAVAILABLE', 'conflict'],
    ['INVENTORY_SCHEMA_INVALID', 'conflict'],
    ['INVENTORY_TITLE_REQUIRED', 'invalid'],
    ['INVENTORY_ROOM_NAME_DUPLICATE', 'invalid'],
    ['INVENTORY_FIELD_TYPE', 'invalid'],
    ['SOMETHING_NEW', 'invalid'],
  ])('treats %s as %s', (code, refusal) => {
    expect(inventoryModule.refusalClass(code, 'add-item')).toBe(refusal);
  });
});
