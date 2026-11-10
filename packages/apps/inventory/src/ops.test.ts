import { describe, expect, it } from 'vitest';

import {
  addInventoryItem,
  addInventoryZone,
  deleteInventoryItem,
  updateInventoryItem,
} from './ops.js';
import {
  applyChanges,
  CONFIGURED_KITCHEN,
  CONFIGURED_MANIFEST,
  HOUSE,
  KITCHEN,
  NO_FACTS,
  snapshotOf,
} from './snapshot.fixtures.js';
import { projectInventorySpace, projectInventoryZone } from './space.js';

import type { InventorySnapshot } from './space.js';
import type { FileChange, Result } from '@stillpointlab/common-format/app';

// The ops' rules, moved from Context Manager's `inventory.service.test.ts`
// (`addItem`, `updateItem`, `deleteItem` and `addZone`), where they ran
// between loading and saving a draft. There, a refusal's code became the
// status these tests asserted; here they assert the code and, where the old
// test did, the message. Linking, draft bases and seeding stay with the host.

const KITCHEN_PATH = 'rooms/kitchen.yaml';
const MANIFEST_V2 = 'version: 2\nlabel: Home\n';

const house = (files: Record<string, string | null> = {}, taken?: string[]): InventorySnapshot =>
  snapshotOf({ ...HOUSE, ...files }, taken !== undefined ? { taken } : {});

const configured = (kitchen = CONFIGURED_KITCHEN): InventorySnapshot =>
  house({ 'inventory.yaml': CONFIGURED_MANIFEST, 'rooms/kitchen.yaml': kitchen });

/** The one changed file's content, failing the test on a refusal. */
function changed(result: { ok: boolean; changes?: { content: string }[] }): string {
  expect(result.ok).toBe(true);
  expect(result.changes).toHaveLength(1);
  return result.changes![0]!.content;
}

/** The zone after a host writes an op's changes. */
function after(snapshot: InventorySnapshot, result: Result<{ changes: FileChange[] }>) {
  if (!result.ok) throw new Error('refused');
  return projectInventoryZone(applyChanges(snapshot, result.changes), 'kitchen', NO_FACTS)!;
}

describe('addInventoryItem', () => {
  it('appends via the writer and answers the new id', () => {
    const snapshot = house();
    const result = addInventoryItem(snapshot, {
      path: KITCHEN_PATH,
      item: {
        title: 'Kettle',
        value: 40,
        container: 'counter',
        fieldValues: { condition: 'good' },
      },
    });
    expect(result).toMatchObject({ ok: true, id: 'kettle' });
    expect(result.ok && result.changes).toEqual([
      {
        kind: 'write',
        path: KITCHEN_PATH,
        content: `${KITCHEN}\n  - id: kettle\n    title: Kettle\n    value: 40\n    container: counter\n    condition: good\n`,
      },
    ]);
    const state = after(snapshot, result);
    expect(state.zone.items.map((item) => item.id)).toContain('kettle');
    expect(state.zone.writable).toBe(true);
  });

  it('disambiguates the id against every id in the space', () => {
    const result = addInventoryItem(house(), { path: KITCHEN_PATH, item: { title: 'Mugs' } });
    expect(result).toMatchObject({ ok: true, id: 'mugs-2' });
  });

  it('refuses an unsupported-shape zone with the scan’s reason', () => {
    expect(
      addInventoryItem(house({ 'rooms/kitchen.yaml': 'items: [flow]\n' }), {
        path: KITCHEN_PATH,
        item: { title: 'X' },
      })
    ).toMatchObject({ ok: false, code: 'INVENTORY_ROOM_READ_ONLY' });
  });

  it('refuses an unparseable zone', () => {
    expect(
      addInventoryItem(house({ 'rooms/kitchen.yaml': 'items: [unclosed' }), {
        path: KITCHEN_PATH,
        item: { title: 'X' },
      })
    ).toMatchObject({ ok: false, code: 'INVENTORY_ROOM_READ_ONLY' });
  });

  it('refuses a zone the host could not read', () => {
    expect(
      addInventoryItem(house({ 'rooms/kitchen.yaml': null }), {
        path: KITCHEN_PATH,
        item: { title: 'X' },
      })
    ).toMatchObject({
      ok: false,
      code: 'INVENTORY_ROOM_READ_ONLY',
      message: 'zone file content is unavailable',
    });
  });

  it('refuses an empty title', () => {
    expect(addInventoryItem(house(), { path: KITCHEN_PATH, item: { title: '  ' } })).toMatchObject({
      ok: false,
      code: 'INVENTORY_TITLE_REQUIRED',
      message: `'title' must be non-empty`,
    });
  });

  it('rejects undeclared and mistyped field values', () => {
    expect(
      addInventoryItem(house(), {
        path: KITCHEN_PATH,
        item: { title: 'X', fieldValues: { nope: 'x' } },
      })
    ).toMatchObject({ ok: false, code: 'INVENTORY_UNKNOWN_FIELD' });
    // 'condition' is declared as text: a number is a type mismatch.
    expect(
      addInventoryItem(house(), {
        path: KITCHEN_PATH,
        item: { title: 'X', fieldValues: { condition: 4 } },
      })
    ).toMatchObject({ ok: false, code: 'INVENTORY_FIELD_TYPE' });
  });

  it('writes configured fields in manifest order without legacy properties', () => {
    const snapshot = configured();
    const result = addInventoryItem(snapshot, {
      path: KITCHEN_PATH,
      item: { title: 'Drill', fieldValues: { quantity: -2, owner: 'Jamie', amount: 19.5 } },
    });
    expect(changed(result)).toBe(
      `${CONFIGURED_KITCHEN}\n  - id: drill\n    title: Drill\n    owner: Jamie\n    amount: 19.5\n    quantity: -2\n`
    );
    expect(
      after(snapshot, result).zone.items.find((item) => item.id === 'drill')?.resolvedFieldValues
    ).toMatchObject({
      owner: { state: 'valid', value: 'Jamie' },
      amount: { state: 'valid', value: 19.5 },
      quantity: { state: 'valid', value: -2 },
    });
  });

  it('enforces configured requiredness, add visibility, types, and the legacy-key boundary', () => {
    const snapshot = configured();
    const add = (item: Parameters<typeof addInventoryItem>[1]['item']) =>
      addInventoryItem(snapshot, { path: KITCHEN_PATH, item });
    expect(add({ title: 'Missing owner' })).toMatchObject({ code: 'INVENTORY_REQUIRED_FIELD' });
    expect(add({ title: 'Hidden', fieldValues: { owner: 'Jamie', locked: 'nope' } })).toMatchObject(
      { code: 'INVENTORY_FIELD_NOT_ADDABLE' }
    );
    expect(add({ title: 'Wrong type', fieldValues: { owner: 42 } })).toMatchObject({
      code: 'INVENTORY_FIELD_TYPE',
    });
    expect(
      add({ title: 'Legacy payload', value: 10, fieldValues: { owner: 'Jamie' } })
    ).toMatchObject({ code: 'INVENTORY_LEGACY_FIELD' });
  });

  it('refuses an unknown zone', () => {
    expect(
      addInventoryItem(house(), { path: 'rooms/garage.yaml', item: { title: 'X' } })
    ).toMatchObject({ ok: false, code: 'INVENTORY_ZONE_NOT_FOUND' });
  });

  it('refuses when the manifest is not among the host’s paths', () => {
    expect(
      addInventoryItem(snapshotOf({}), { path: KITCHEN_PATH, item: { title: 'X' } })
    ).toMatchObject({ ok: false, code: 'INVENTORY_MANIFEST_NOT_FOUND' });
  });
});

describe('every item op', () => {
  it('is refused while v2 configuration is invalid', () => {
    const snapshot = house({
      'inventory.yaml': 'version: 2\nfields: []\ncurrency: USD\n',
      'rooms/kitchen.yaml': CONFIGURED_KITCHEN,
    });
    const refusal = {
      ok: false,
      code: 'INVENTORY_SCHEMA_INVALID',
      message: 'Repair inventory.yaml before changing items',
    };
    expect(addInventoryItem(snapshot, { path: KITCHEN_PATH, item: { title: 'X' } })).toMatchObject(
      refusal
    );
    expect(
      updateInventoryItem(snapshot, { path: KITCHEN_PATH, id: 'lathe', changes: { title: 'X' } })
    ).toMatchObject(refusal);
    expect(deleteInventoryItem(snapshot, { path: KITCHEN_PATH, id: 'lathe' })).toMatchObject(
      refusal
    );
  });
});

describe('updateInventoryItem', () => {
  it('patches only the touched field lines', () => {
    const snapshot = house();
    const result = updateInventoryItem(snapshot, {
      path: KITCHEN_PATH,
      id: 'espresso-machine',
      changes: { value: 495 },
    });
    expect(changed(result)).toBe(KITCHEN.replace('    value: 545', '    value: 495'));
    const state = after(snapshot, result);
    expect(state.zone.items.find((item) => item.id === 'espresso-machine')?.value).toBe(495);
    expect(state.zone.subtotal).toBe(495 + 8 * 6);
  });

  it('clears a field with null and rejects an emptied title', () => {
    expect(
      changed(
        updateInventoryItem(house(), {
          path: KITCHEN_PATH,
          id: 'espresso-machine',
          changes: { value: null },
        })
      )
    ).toBe(KITCHEN.replace('    value: 545\n', ''));
    expect(
      updateInventoryItem(house(), {
        path: KITCHEN_PATH,
        id: 'espresso-machine',
        changes: { title: '  ' },
      })
    ).toMatchObject({ ok: false, code: 'INVENTORY_TITLE_REQUIRED' });
  });

  it('answers no changes for an edit that changes nothing', () => {
    expect(updateInventoryItem(house(), { path: KITCHEN_PATH, id: 'mugs', changes: {} })).toEqual({
      ok: true,
      changes: [],
    });
  });

  it('refuses an id that no longer exists (hand-deleted since the read)', () => {
    expect(
      updateInventoryItem(house(), { path: KITCHEN_PATH, id: 'ghost', changes: { value: 1 } })
    ).toMatchObject({
      ok: false,
      code: 'INVENTORY_ITEM_NOT_FOUND',
      message: "No item with id 'ghost' exists in this zone",
    });
  });

  it('refuses a per-item read-only entry and leaves its sibling editable', () => {
    const snapshot = house({
      'rooms/kitchen.yaml': [
        'items:',
        '  - id: fancy',
        '    title: Fancy',
        '    receipt: { store: IKEA }',
        '  - id: plain',
        '    title: Plain',
      ].join('\n'),
    });
    expect(
      updateInventoryItem(snapshot, { path: KITCHEN_PATH, id: 'fancy', changes: { value: 1 } })
    ).toMatchObject({ ok: false, code: 'INVENTORY_ITEM_READ_ONLY' });
    expect(
      updateInventoryItem(snapshot, { path: KITCHEN_PATH, id: 'plain', changes: { value: 2 } })
    ).toMatchObject({ ok: true });
  });

  it('repairs configured values and adds, edits, and removes scalar Other data byte-stably', () => {
    const snapshot = configured(
      [
        'label: Kitchen',
        'items:',
        '  - id: lathe',
        '    title: Lathe',
        '    owner: Jamie',
        '    amount: [bad]',
        '    location: bench # keep this comment',
        '    retired: false',
        '    notes:',
        '      nested: untouched',
      ].join('\n')
    );
    const result = updateInventoryItem(snapshot, {
      path: KITCHEN_PATH,
      id: 'lathe',
      changes: {
        fieldValues: { amount: 12.345 },
        extraValues: { location: 'shelf', retired: null, insured: true },
      },
    });

    const content = changed(result);
    expect(content).toContain('    amount: 12.345\n');
    expect(content).toContain('    location: shelf\n');
    expect(content).not.toContain('retired:');
    expect(content).toContain('    notes:\n      nested: untouched\n');
    expect(content).toContain('    insured: true\n');
    const state = after(snapshot, result);
    expect(state.zone.items[0]!.resolvedFieldValues?.amount).toEqual({
      state: 'valid',
      value: 12.345,
    });
    expect(state.zone.items[0]!.extraFields).toEqual([
      { key: 'location', value: 'shelf' },
      {
        key: 'notes',
        opaque: true,
        summary: 'Mapping',
        readOnlyReason: 'Mapping can only be edited in YAML',
      },
      { key: 'insured', value: true },
    ]);
  });

  it('requires configured repair on save and rejects edit-hidden or structured extra changes', () => {
    const snapshot = configured(
      [
        'items:',
        '  - id: lathe',
        '    title: Lathe',
        '    amount: 10',
        '    locked: source-only',
        '    notes:',
        '      nested: true',
      ].join('\n')
    );
    const update = (changes: Parameters<typeof updateInventoryItem>[1]['changes']) =>
      updateInventoryItem(snapshot, { path: KITCHEN_PATH, id: 'lathe', changes });
    expect(update({ title: 'New title' })).toMatchObject({
      code: 'INVENTORY_REQUIRED_FIELD',
      message: "'owner' must be repaired before saving",
    });
    expect(update({ fieldValues: { owner: 'Jamie', locked: 'changed' } })).toMatchObject({
      code: 'INVENTORY_FIELD_NOT_EDITABLE',
    });
    expect(update({ fieldValues: { owner: 'Jamie' }, extraValues: { notes: null } })).toMatchObject(
      { code: 'INVENTORY_EXTRA_READ_ONLY' }
    );
    expect(update({ fieldValues: { owner: 'Jamie' }, extraValues: { amount: 2 } })).toMatchObject({
      code: 'INVENTORY_EXTRA_COLLISION',
    });
  });

  it('answers the field rules’ refusals with their codes and messages', () => {
    const snapshot = configured(
      ['items:', '  - id: lathe', '    title: Lathe', '    owner: Jamie'].join('\n')
    );
    expect(
      updateInventoryItem(snapshot, {
        path: KITCHEN_PATH,
        id: 'lathe',
        changes: { fieldValues: { owner: 'Jamie' }, extraValues: { 'Bad Key!': 'x' } },
      })
    ).toEqual({
      ok: false,
      code: 'INVENTORY_EXTRA_KEY',
      message: "'Bad Key!' is not a safe Other data key",
    });
    expect(
      addInventoryItem(snapshot, {
        path: KITCHEN_PATH,
        item: { title: 'Drill', fieldValues: { owner: 'Jamie', nope: 'x' } },
      })
    ).toEqual({
      ok: false,
      code: 'INVENTORY_UNKNOWN_FIELD',
      message: "'nope' is not a field declared in inventory.yaml",
    });
  });

  it('refuses Other data on a version 1 inventory', () => {
    expect(
      updateInventoryItem(house(), {
        path: KITCHEN_PATH,
        id: 'mugs',
        changes: { extraValues: { colour: 'blue' } },
      })
    ).toMatchObject({ ok: false, code: 'INVENTORY_EXTRA_UNSUPPORTED' });
  });
});

describe('deleteInventoryItem', () => {
  it('removes the item span', () => {
    const snapshot = house();
    const result = deleteInventoryItem(snapshot, { path: KITCHEN_PATH, id: 'espresso-machine' });
    expect(changed(result)).toBe(
      KITCHEN.replace(
        '  - id: espresso-machine\n    title: Rancilio Silvia\n    value: 545\n    condition: good\n',
        ''
      )
    );
    const state = after(snapshot, result);
    expect(state.zone.items.map((item) => item.id)).toEqual(['mugs', 'mystery']);
    expect(state.zone.subtotal).toBe(48);
  });

  it('refuses an unknown id', () => {
    expect(deleteInventoryItem(house(), { path: KITCHEN_PATH, id: 'ghost' })).toMatchObject({
      ok: false,
      code: 'INVENTORY_ITEM_NOT_FOUND',
    });
  });
});

describe('addInventoryZone', () => {
  it('creates rooms/<slug>.yaml beside the manifest, holding its label', () => {
    const snapshot = house();
    const result = addInventoryZone(snapshot, { title: 'Attic' });
    expect(result).toEqual({
      ok: true,
      slug: 'attic',
      path: 'rooms/attic.yaml',
      changes: [{ kind: 'create', path: 'rooms/attic.yaml', content: 'label: Attic\n' }],
    });
    // In the overview straight away, empty; and writable, so items can follow.
    const next = applyChanges(snapshot, result.ok ? result.changes : []);
    const space = projectInventorySpace(next, NO_FACTS);
    expect(space?.zones.map((zone) => zone.slug)).toEqual(['attic', 'kitchen', 'office']);
    expect(space?.zones.find((zone) => zone.slug === 'attic')).toMatchObject({
      label: 'Attic',
      path: 'rooms/attic.yaml',
      itemCount: 0,
      subtotal: 0,
    });
    expect(
      addInventoryItem(next, { path: 'rooms/attic.yaml', item: { title: 'Lamp' } })
    ).toMatchObject({ ok: true, id: 'lamp' });
  });

  it('seeds beside a nested manifest', () => {
    const result = addInventoryZone(
      snapshotOf({ 'home/inventory.yaml': MANIFEST_V2 }, { manifestPath: 'home/inventory.yaml' }),
      { title: 'Shed' }
    );
    expect(result).toMatchObject({ ok: true, path: 'home/rooms/shed.yaml' });
  });

  it("quotes a title YAML would misread and slugs it for the file's name", () => {
    const result = addInventoryZone(house(), { title: 'Attic: north side' });
    expect(result).toMatchObject({
      ok: true,
      slug: 'attic-north-side',
      changes: [{ path: 'rooms/attic-north-side.yaml', content: 'label: "Attic: north side"\n' }],
    });
  });

  it('refuses a title with no letters or numbers', () => {
    expect(addInventoryZone(house(), { title: '!!!' })).toMatchObject({
      ok: false,
      code: 'INVENTORY_ROOM_NAME_INVALID',
    });
  });

  it('refuses a name already taken by a visible file', () => {
    expect(addInventoryZone(house(), { title: 'Kitchen' })).toEqual({
      ok: false,
      code: 'INVENTORY_ROOM_EXISTS',
      message: '“kitchen.yaml” already exists here',
    });
  });

  it('refuses a name the host has taken beyond what it shows', () => {
    expect(addInventoryZone(house({}, ['rooms/attic.yaml']), { title: 'attic' })).toMatchObject({
      ok: false,
      code: 'INVENTORY_ROOM_EXISTS',
    });
  });

  it('refuses when the manifest is not among the host’s paths', () => {
    expect(addInventoryZone(snapshotOf({ 'README.md': '' }), { title: 'Attic' })).toEqual({
      ok: false,
      code: 'INVENTORY_MANIFEST_NOT_FOUND',
      message: 'This repository has no inventory.yaml',
    });
  });

  it('does not add a zone while v2 configuration is invalid', () => {
    expect(
      addInventoryZone(house({ 'inventory.yaml': 'version: 2\nfields: []\nexports: false\n' }), {
        title: 'Attic',
      })
    ).toEqual({
      ok: false,
      code: 'INVENTORY_SCHEMA_INVALID',
      message: 'Repair inventory.yaml before adding a zone',
    });
  });
});
