import { describe, expect, it } from 'vitest';

import {
  CONFIGURED_KITCHEN,
  CONFIGURED_MANIFEST,
  HOUSE,
  NO_FACTS,
  snapshotOf,
} from './snapshot.fixtures.js';
import { projectInventorySpace, projectInventoryZone, resolveInventory } from './space.js';

// The projections' rules, moved from Context Manager's `inventory.service.test.ts`
// (`getSpaceState` and `getZoneState`), where they ran behind loading. The
// host's half (draft-first reads, the blob cache, enabled rows, sibling labels)
// stays there.

const house = (files: Record<string, string | null> = {}) => snapshotOf({ ...HOUSE, ...files });

describe('projectInventorySpace', () => {
  it('is null when the manifest is not among the host’s paths (a dangling space)', () => {
    expect(projectInventorySpace(snapshotOf({ 'a.md': 'x' }), NO_FACTS)).toBeNull();
    expect(projectInventorySpace(house(), NO_FACTS)).not.toBeNull();
  });

  it('aggregates zones, subtotals, unvalued counts, and the space total', () => {
    const space = projectInventorySpace(house(), NO_FACTS);
    expect(space).toMatchObject({
      manifestPath: 'inventory.yaml',
      spacePath: '',
      label: 'Maple St House',
      currency: 'USD',
      enabled: false,
      warnings: [],
    });
    expect(space?.fields).toEqual([{ id: 'condition', label: 'Condition', type: 'text' }]);
    expect(space?.zones).toEqual([
      {
        slug: 'kitchen',
        label: 'Kitchen',
        path: 'rooms/kitchen.yaml',
        itemCount: 3,
        totals: { itemCount: 3, value: 545 + 8 * 6, unvaluedCount: 1 },
        subtotal: 545 + 8 * 6,
        unvaluedCount: 1,
        needsAttentionCount: 0,
      },
      {
        slug: 'office',
        label: 'Office',
        path: 'rooms/office.yaml',
        itemCount: 1,
        totals: { itemCount: 1, value: 100, unvaluedCount: 0 },
        subtotal: 100,
        unvaluedCount: 0,
        needsAttentionCount: 0,
      },
    ]);
    expect(space?.totals).toEqual({ itemCount: 4, value: 693, unvaluedCount: 1 });
  });

  it('lays the host’s facts on as given', () => {
    const dirty = [{ path: 'rooms/kitchen.yaml', kind: 'zone' as const }];
    const space = projectInventorySpace(house(), { enabled: true, dirty });
    expect(space).toMatchObject({ enabled: true, dirty });
    expect(projectInventoryZone(house(), 'kitchen', { enabled: true, dirty })).toMatchObject({
      enabled: true,
      dirty,
    });
  });

  it('derives configured totals after resolution with missing-as-zero and multiplier-as-one', () => {
    const snapshot = house({
      'inventory.yaml': CONFIGURED_MANIFEST,
      'rooms/kitchen.yaml': CONFIGURED_KITCHEN,
      'rooms/office.yaml': [
        'label: Office',
        'items:',
        '  - id: negative',
        '    title: Negative pair',
        '    owner: Pat',
        '    amount: -3',
        '    quantity: -2',
        '  - id: default-multiplier',
        '    title: Default multiplier',
        '    owner: Sam',
        '    amount: 5',
        '  - id: missing-amount',
        '    title: Missing amount',
        '    owner: Alex',
        '    quantity: 4',
        '  - id: fractional',
        '    title: Fractional',
        '    owner: Lee',
        '    amount: 0.5',
        '    quantity: 0.25',
      ].join('\n'),
    });

    const space = projectInventorySpace(snapshot, NO_FACTS);

    expect(space?.schema).toMatchObject({ mode: 'configured', manifest: { version: 2 } });
    expect(space?.currency).toBeUndefined();
    expect(space?.zones[0]!.totals).toMatchObject({
      itemCount: 2,
      total: {
        fieldId: 'amount',
        label: 'Replacement value',
        value: 24.69,
        format: { kind: 'currency', currency: 'CAD', decimalPlaces: 2 },
      },
    });
    expect(space?.zones[1]!.totals).toMatchObject({ itemCount: 4, total: { value: 11.125 } });
    expect(space?.totals.itemCount).toBe(6);
    expect('total' in space!.totals ? space!.totals.total?.value : undefined).toBeCloseTo(35.815);

    const zone = projectInventoryZone(snapshot, 'kitchen', NO_FACTS);
    expect(
      zone?.zone.items.find((item) => item.id === 'spare')?.resolvedFieldValues?.amount
    ).toMatchObject({ state: 'invalid', value: 'wrong' });
  });

  it('returns count-only configured aggregates when no total is declared', () => {
    const space = projectInventorySpace(
      house({
        'inventory.yaml': CONFIGURED_MANIFEST.slice(0, CONFIGURED_MANIFEST.indexOf('total:')),
        'rooms/kitchen.yaml': CONFIGURED_KITCHEN,
      }),
      NO_FACTS
    );
    expect(space?.totals).toEqual({ itemCount: 3 });
    expect(space?.zones.map((zone) => zone.totals)).toEqual([{ itemCount: 2 }, { itemCount: 1 }]);
  });

  it('degrades on a broken manifest without blanking the zones', () => {
    const space = projectInventorySpace(house({ 'inventory.yaml': 'version: 99\n' }), NO_FACTS);
    expect(space?.schema).toEqual({
      mode: 'invalid',
      declaredVersion: 99,
      errors: ['version: 99 is not supported'],
    });
    expect(space?.currency).toBeUndefined();
    expect(space?.zones).toHaveLength(2);
  });

  it('recovers a broken version 1 manifest as legacy, keeping its errors', () => {
    const space = projectInventorySpace(
      house({ 'inventory.yaml': 'version: 1\nfields: nope\n' }),
      NO_FACTS
    );
    expect(space?.schema).toEqual({
      mode: 'legacy',
      manifest: { version: 1, currency: 'USD', fields: [], containers: [] },
    });
    expect(space?.manifestErrors?.length).toBeGreaterThan(0);
    expect(space?.currency).toBe('USD');
    expect(space?.zones[0]).toMatchObject({ slug: 'kitchen', itemCount: 3 });
  });

  it('uses neutral id/title/Other data recovery for a malformed v2 manifest', () => {
    const snapshot = house({
      'inventory.yaml': 'version: 2\nfields: []\ncurrency: USD\n',
      'rooms/kitchen.yaml': CONFIGURED_KITCHEN,
    });
    const space = projectInventorySpace(snapshot, NO_FACTS);
    const state = projectInventoryZone(snapshot, 'kitchen', NO_FACTS);

    expect(space?.schema).toMatchObject({ mode: 'invalid', declaredVersion: 2 });
    expect(space?.totals).toEqual({ itemCount: 3 });
    expect(state?.zone.items[0]).toMatchObject({
      id: 'lathe',
      title: 'Lathe',
      fieldValues: {},
      extraFields: expect.arrayContaining([
        { key: 'owner', value: 'Jamie' },
        { key: 'amount', value: 12.345 },
        { key: 'quantity', value: 2 },
      ]),
    });
  });

  it('marks files the host could not read, the manifest and a zone alike', () => {
    const space = projectInventorySpace(
      house({ 'inventory.yaml': null, 'rooms/office.yaml': null }),
      NO_FACTS
    );
    expect(space?.schema).toEqual({
      mode: 'invalid',
      errors: ['inventory.yaml content is unavailable'],
    });
    expect(space?.zones.find((zone) => zone.slug === 'office')).toMatchObject({
      itemCount: 0,
      parseError: 'room file content is unavailable',
    });
    const office = projectInventoryZone(house({ 'rooms/office.yaml': null }), 'office', NO_FACTS);
    expect(office?.zone).toMatchObject({ writable: false, items: [] });
  });

  it('ignores a second manifest entirely: it is another space (ADR-0025)', () => {
    const snapshot = snapshotOf(
      { ...HOUSE, 'deep/inventory.yaml': 'version: 1\n' },
      { paths: [...Object.keys(HOUSE), 'deep/inventory.yaml'] }
    );
    const space = projectInventorySpace(snapshot, NO_FACTS);
    expect(space?.manifestPath).toBe('inventory.yaml');
    expect(space?.warnings).toEqual([]);
  });

  it('projects the space the snapshot names, not the shallowest manifest', () => {
    const snapshot = snapshotOf(
      {
        ...HOUSE,
        'annex/inventory.yaml': 'version: 1\nlabel: Annex\n',
        'annex/rooms/attic.yaml': 'label: Attic\nitems: []\n',
      },
      { manifestPath: 'annex/inventory.yaml' }
    );
    const space = projectInventorySpace(snapshot, NO_FACTS);
    expect(space).toMatchObject({ manifestPath: 'annex/inventory.yaml', spacePath: 'annex' });
    expect(space?.zones.map((zone) => zone.slug)).toEqual(['attic']);
  });

  it('demotes duplicate ids across zones in both zones, keeping totals honest', () => {
    const space = projectInventorySpace(
      house({
        'rooms/office.yaml': [
          'label: Office',
          'items:',
          '  - id: espresso-machine',
          '    title: Backup machine',
          '    value: 100',
        ].join('\n'),
      }),
      NO_FACTS
    );
    const kitchen = space?.zones.find((zone) => zone.slug === 'kitchen');
    const office = space?.zones.find((zone) => zone.slug === 'office');
    expect(kitchen).toMatchObject({ itemCount: 2, subtotal: 48, needsAttentionCount: 1 });
    expect(office).toMatchObject({ itemCount: 0, subtotal: 0, needsAttentionCount: 1 });
    expect(space?.totals).toEqual({ itemCount: 2, value: 48, unvaluedCount: 1 });
  });

  it('demotes a zone whose file cannot be parsed', () => {
    const space = projectInventorySpace(
      house({ 'rooms/office.yaml': 'items: [unclosed' }),
      NO_FACTS
    );
    const office = space?.zones.find((zone) => zone.slug === 'office');
    expect(office?.parseError).toMatch(/YAML parse error/);
    expect(office).toMatchObject({ itemCount: 0, subtotal: 0 });
  });
});

describe('projectInventoryZone', () => {
  it('returns the zone with the manifest context', () => {
    const state = projectInventoryZone(house(), 'kitchen', NO_FACTS);
    expect(state).toMatchObject({ spaceLabel: 'Maple St House', currency: 'USD', enabled: false });
    expect(state?.zone.slug).toBe('kitchen');
    expect(state?.zone.items.map((item) => item.id)).toEqual([
      'espresso-machine',
      'mugs',
      'mystery',
    ]);
    expect(state?.zone.items[0]!.fieldValues).toEqual({ condition: 'good' });
    // Writability is the shape scan alone: no host link is needed to edit.
    expect(state?.zone.writable).toBe(true);
    expect(state?.zone.readOnlyReason).toBeUndefined();
  });

  it('is null for an unknown slug, or when there is no manifest at all', () => {
    expect(projectInventoryZone(house(), 'garage', NO_FACTS)).toBeNull();
    expect(projectInventoryZone(snapshotOf({}), 'kitchen', NO_FACTS)).toBeNull();
  });

  it('surfaces a per-item read-only reason, leaving the file and its siblings writable', () => {
    const state = projectInventoryZone(
      house({
        'rooms/kitchen.yaml': [
          'items:',
          '  - id: fancy',
          '    title: Fancy',
          '    receipt: { store: IKEA }',
          '  - id: plain',
          '    title: Plain',
        ].join('\n'),
      }),
      'kitchen',
      NO_FACTS
    );
    expect(state?.zone.items.find((item) => item.id === 'fancy')?.readOnly).toMatch(/flow maps/);
    expect(state?.zone.items.find((item) => item.id === 'plain')?.readOnly).toBeUndefined();
    expect(state?.zone.writable).toBe(true);
  });

  it('marks a file the writer cannot place edits in read-only, with the scan’s reason', () => {
    const state = projectInventoryZone(
      house({ 'rooms/kitchen.yaml': 'items: [flow]\n' }),
      'kitchen',
      NO_FACTS
    );
    expect(state?.zone.writable).toBe(false);
    expect(state?.zone.readOnlyReason).toEqual(expect.any(String));
  });

  it('leaves a label-only zone (as seeded) writable and empty', () => {
    const state = projectInventoryZone(
      house({ 'rooms/attic.yaml': 'label: Attic\n' }),
      'attic',
      NO_FACTS
    );
    expect(state?.zone).toMatchObject({ label: 'Attic', writable: true, items: [] });
    expect(state?.zone.readOnlyReason).toBeUndefined();
  });
});

describe('resolveInventory', () => {
  it('detects zones among the host’s paths, created files included', () => {
    const resolved = resolveInventory(
      snapshotOf({ ...HOUSE, 'rooms/attic.yaml': 'label: Attic\n' })
    );
    expect(resolved?.zones.map((zone) => zone.slug)).toEqual(['attic', 'kitchen', 'office']);
    expect(resolved?.detection.roomsDir).toBe('rooms');
  });

  it('keeps the zones it was handed whole, for a host’s export', () => {
    const resolved = resolveInventory(snapshotOf(HOUSE));
    expect(resolved?.zones[0]!.items.map((item) => item.id)).toEqual([
      'espresso-machine',
      'mugs',
      'mystery',
    ]);
  });
});
