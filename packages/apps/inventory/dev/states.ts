// Hand-built states for the harness: one per case the elements render, standing
// in for what a host's service assembles (drafts, check-ins, read-only files).
// Most start from the element tests' fixtures.
import { hostile } from '@stillpointlab/common-format/testing';

import {
  CONFIGURED_ZONE,
  JUST_CREATED,
  LEGACY_ZONE,
  SEEDED,
  SPACE,
} from '../src/element/inventory.fixtures.js';

import type { SharedInventoryZoneState, SharedInventorySpace } from '../src/types.js';

const clone = <T>(value: T): T => structuredClone(value);

/** A configured overview: a dirty zone, a broken zone, one that needs attention, and a total. */
export function configuredOverview(): SharedInventorySpace {
  return {
    manifestPath: 'inventory/inventory.yaml',
    spacePath: 'inventory',
    label: 'Workshop',
    schema: clone(CONFIGURED_ZONE.schema),
    zones: [
      {
        slug: 'workshop',
        label: 'Workshop floor',
        path: 'inventory/rooms/workshop.yaml',
        itemCount: 2,
        totals: clone(CONFIGURED_ZONE.zone.totals),
        needsAttentionCount: 1,
      },
      {
        slug: 'shed',
        label: 'Shed',
        path: 'inventory/rooms/shed.yaml',
        itemCount: 0,
        totals: { itemCount: 0 },
        needsAttentionCount: 0,
      },
      {
        slug: 'loft',
        label: 'Loft',
        path: 'inventory/rooms/loft.yaml',
        itemCount: 0,
        totals: { itemCount: 0 },
        needsAttentionCount: 0,
        parseError: 'YAML parse error: bad indentation of a mapping entry (3:5)',
      },
    ],
    totals: clone(CONFIGURED_ZONE.zone.totals),
    enabled: true,
    dirty: [{ goodId: 1, path: 'inventory/rooms/workshop.yaml', kind: 'zone' }],
    warnings: [],
  };
}

export const legacyOverview = (): SharedInventorySpace => clone(SEEDED);
export const justCreated = (): SharedInventorySpace => clone(JUST_CREATED);
export const disabledOverview = (): SharedInventorySpace => ({ ...clone(SPACE), enabled: false });

export function invalidOverview(): SharedInventorySpace {
  return {
    manifestPath: 'inventory/inventory.yaml',
    spacePath: 'inventory',
    schema: { mode: 'invalid', declaredVersion: 2, errors: ['total.field: invalid'] },
    zones: [],
    totals: { itemCount: 0 },
    enabled: true,
    dirty: [{ goodId: 9, path: 'inventory/inventory.yaml', kind: 'manifest' }],
    warnings: [],
  };
}

export const configuredZone = (): SharedInventoryZoneState => clone(CONFIGURED_ZONE);
export const legacyZone = (): SharedInventoryZoneState => clone(LEGACY_ZONE);

/** A configured zone with a dirty file and items that need attention. */
export function attentionZone(): SharedInventoryZoneState {
  const state = clone(CONFIGURED_ZONE);
  state.dirty = [{ goodId: 1, path: state.zone.path, kind: 'zone' }];
  state.zone.needsAttention = [
    { id: 'lathe', title: 'Lathe (copy)', reason: 'duplicate id `lathe` (also in shed.yaml)' },
    { reason: 'item 4 has no id' },
  ];
  return state;
}

/** The whole file is read-only for the app (flow-style items). */
export function readOnlyZone(): SharedInventoryZoneState {
  const state = clone(LEGACY_ZONE);
  state.zone.writable = false;
  state.zone.readOnlyReason = 'Flow-style items cannot be patched safely.';
  return state;
}

export function brokenZone(): SharedInventoryZoneState {
  const state = clone(LEGACY_ZONE);
  state.zone.items = [];
  state.zone.parseError = 'YAML parse error: bad indentation of a mapping entry (3:5)';
  return state;
}

export function emptyZone(): SharedInventoryZoneState {
  const state = clone(CONFIGURED_ZONE);
  state.zone.items = [];
  state.zone.totals = { itemCount: 0 };
  return state;
}

/** An invalid v2 manifest: the zone renders neutral and read-only. */
export function neutralZone(): SharedInventoryZoneState {
  const state = clone(CONFIGURED_ZONE);
  state.schema = { mode: 'invalid', declaredVersion: 2, errors: ['fields.0.type: Invalid option'] };
  state.zone.items = state.zone.items.map((item) => ({
    ...item,
    resolvedFieldValues: {},
    extraFields: [{ key: 'amount', value: 12.345 }],
  }));
  state.zone.totals = { itemCount: state.zone.items.length };
  return state;
}

/** Every string of the configured zone with a payload that would become markup unescaped. */
export const hostileZone = (): SharedInventoryZoneState =>
  hostile(CONFIGURED_ZONE, {
    except: ['mode', 'type', 'state', 'kind', 'id', 'fieldId', 'field', 'multiplyBy'],
  });
