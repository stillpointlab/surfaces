import { describe, expect, it } from 'vitest';

import { placeInventoryCreate, planInventoryCreate } from './create.js';

import type { CreateInventoryInput, InventoryCreatePlan } from './create.js';

// The create rules, moved from Context Manager's `inventory.service.test.ts`
// (`createInventory`), where they ran between the host's checks and its
// seeding. The host's half (a synced tree, scope overlap with enabled views,
// recognising a resumed create, the instance row) stays there.

function plan(input: CreateInventoryInput): InventoryCreatePlan {
  const result = planInventoryCreate(input);
  if (!result.ok) throw new Error(result.message);
  return result;
}

describe('planInventoryCreate', () => {
  it('plans the manifest, then the zones in the order given', () => {
    const result = plan({
      label: 'Maple Street House',
      zones: ['Kitchen', 'Garage'],
      fields: [
        { id: 'owner', label: 'Owner', type: 'text' },
        {
          id: 'replacement-value',
          label: 'Replacement value',
          type: 'number',
          format: { kind: 'currency', currency: 'CAD', decimalPlaces: 2 },
        },
        { id: 'quantity', label: 'Quantity', type: 'number' },
      ],
      total: { field: 'replacement-value', multiplyBy: 'quantity' },
    });

    expect(result).toMatchObject({
      manifestPath: 'inventory/inventory.yaml',
      spacePath: 'inventory',
    });
    expect(result.files.map((file) => file.path)).toEqual([
      'inventory/inventory.yaml',
      'inventory/rooms/kitchen.yaml',
      'inventory/rooms/garage.yaml',
    ]);
    expect(result.files.every((file) => file.kind === 'create')).toBe(true);
    expect(result.files[0]!.content).toBe(
      [
        'version: 2',
        'label: Maple Street House',
        'fields:',
        '  - id: owner',
        '    label: Owner',
        '    type: text',
        '  - id: replacement-value',
        '    label: Replacement value',
        '    type: number',
        '    format:',
        '      kind: currency',
        '      currency: CAD',
        '      decimalPlaces: 2',
        '  - id: quantity',
        '    label: Quantity',
        '    type: number',
        'total:',
        '  field: replacement-value',
        '  multiplyBy: quantity',
        '',
      ].join('\n')
    );
    expect(result.files[1]!.content).toBe('label: Kitchen\n');
    expect(result.files[2]!.content).toBe('label: Garage\n');
  });

  it('writes a minimal v2 manifest and quotes a label YAML would misread', () => {
    const result = plan({ label: 'Attic: north side' });
    expect(result.files).toEqual([
      {
        kind: 'create',
        path: 'inventory/inventory.yaml',
        content: 'version: 2\nlabel: "Attic: north side"\n',
      },
    ]);
  });

  it('plans into a nested folder', () => {
    expect(plan({ label: 'Home', folder: 'home/stuff' })).toMatchObject({
      manifestPath: 'home/stuff/inventory.yaml',
      spacePath: 'home/stuff',
    });
  });

  it('refuses a manifest that would not parse as version 2', () => {
    expect(planInventoryCreate({ label: 'Home', total: { field: 'nowhere' } })).toMatchObject({
      ok: false,
      code: 'INVENTORY_MANIFEST_INVALID',
    });
  });

  it('refuses the repository root: a root space would monopolize the repository', () => {
    expect(planInventoryCreate({ label: 'Home', folder: '', zones: ['Kitchen'] })).toMatchObject({
      ok: false,
      code: 'INVENTORY_FOLDER_REQUIRED',
    });
  });

  it('refuses a zone title that cannot name a file, and two titles that would name one', () => {
    expect(planInventoryCreate({ label: 'Home', zones: ['!!!'] })).toMatchObject({
      ok: false,
      code: 'INVENTORY_ROOM_NAME_INVALID',
    });
    expect(planInventoryCreate({ label: 'Home', zones: ['Front Room', 'front-room'] })).toEqual({
      ok: false,
      code: 'INVENTORY_ROOM_NAME_DUPLICATE',
      message: 'Two zones would both be named “front-room.yaml”',
    });
  });
});

describe('placeInventoryCreate', () => {
  const kitchen = (): InventoryCreatePlan => plan({ label: 'Home', zones: ['Kitchen'] });

  it('answers every file when nothing is in the way', () => {
    expect(placeInventoryCreate(kitchen(), { taken: ['README.md'] })).toEqual({
      ok: true,
      files: kitchen().files,
    });
  });

  it('refuses a seed path already taken, naming it', () => {
    expect(
      placeInventoryCreate(kitchen(), { taken: ['README.md', 'inventory/rooms/kitchen.yaml'] })
    ).toEqual({
      ok: false,
      code: 'INVENTORY_PATH_EXISTS',
      message: '“inventory/rooms/kitchen.yaml” already exists',
    });
  });

  it('refuses when the target folder is itself a file', () => {
    expect(placeInventoryCreate(plan({ label: 'Home' }), { taken: ['inventory'] })).toMatchObject({
      ok: false,
      code: 'INVENTORY_PATH_EXISTS',
      message: expect.stringContaining('“inventory”'),
    });
  });

  it('refuses when a folder above a seed path is a file', () => {
    // `home` is a file: `home/inventory/inventory.yaml` could never reach a commit.
    expect(
      placeInventoryCreate(plan({ label: 'Home', folder: 'home/inventory' }), { taken: ['home'] })
    ).toMatchObject({ code: 'INVENTORY_PATH_EXISTS', message: expect.stringContaining('“home”') });
    // The same for `<folder>/rooms` when zones are asked for.
    expect(placeInventoryCreate(kitchen(), { taken: ['inventory/rooms'] })).toMatchObject({
      code: 'INVENTORY_PATH_EXISTS',
      message: expect.stringContaining('“inventory/rooms”'),
    });
  });

  it('skips a resumed create’s own files and answers only what is missing', () => {
    const resumed = plan({ label: 'Maple Street House', zones: ['Kitchen', 'Garage'] });
    const leftovers = ['inventory/inventory.yaml', 'inventory/rooms/kitchen.yaml'];
    const result = placeInventoryCreate(resumed, { taken: leftovers, reusable: leftovers });
    expect(result.ok && result.files.map((file) => file.path)).toEqual([
      'inventory/rooms/garage.yaml',
    ]);
  });

  it('still refuses an ancestor that is a file, even one it may reuse', () => {
    expect(
      placeInventoryCreate(kitchen(), { taken: ['inventory'], reusable: ['inventory'] })
    ).toMatchObject({ ok: false, code: 'INVENTORY_PATH_EXISTS' });
  });
});
