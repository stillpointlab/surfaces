import { describe, expect, it } from 'vitest';

import { inventoryBounds } from './bounds.js';

// The bounds as Context Manager has them at 8fa439ba. The first cases in each
// block are carried over from its tests there ("refuses an op outside the
// host's bounds before the core sees it" and "400s a create input outside the
// host's bounds" in `services/apps/appHost.test.ts`); the rest pin each limit,
// enum and pattern at its edge.

const x = (length: number): string => 'x'.repeat(length);

/** Whether the bounds accept an op. */
const opOk = (op: unknown): boolean => inventoryBounds.op(op).ok;
const viewOk = (view: unknown): boolean => inventoryBounds.view(view).ok;
const createOk = (input: unknown): boolean => inventoryBounds.create(input).ok;

const addItem = (item: Record<string, unknown>) => ({
  type: 'add-item',
  path: 'rooms/office.yaml',
  item: { title: 'X', ...item },
});
const updateItem = (changes: Record<string, unknown>) => ({
  type: 'update-item',
  path: 'rooms/kitchen.yaml',
  id: 'mugs',
  changes,
});

describe('inventoryBounds.op', () => {
  it('refuses what Context Manager refused before the core saw it', () => {
    expect(opOk(addItem({ title: '  ' }))).toBe(false);
    expect(opOk(addItem({ id: 'chosen' }))).toBe(false);
    expect(opOk(updateItem({ quantity: 1.5 }))).toBe(false);
    expect(opOk({ type: 'add-zone', title: x(121) })).toBe(false);
    expect(opOk({ type: 'add-zone', title: 'Attic', slug: 'loft' })).toBe(false);
  });

  it('answers APP_OP_INVALID with the schema’s issues', () => {
    const refused = inventoryBounds.op({ type: 'add-zone', title: x(121) });
    expect(refused).toMatchObject({ ok: false, code: 'APP_OP_INVALID' });
    expect(refused.ok ? [] : refused.details).toEqual([
      expect.objectContaining({ code: 'too_big', path: ['title'] }),
    ]);
    expect(refused.ok ? '' : refused.message).toMatch(/^The op is not valid: title: /);
  });

  it('answers the op as parsed: trimmed', () => {
    expect(inventoryBounds.op({ type: 'add-zone', title: '  Attic  ' })).toEqual({
      ok: true,
      op: { type: 'add-zone', title: 'Attic' },
    });
    expect(inventoryBounds.op(addItem({ title: ' Lamp ', container: ' shelf ' }))).toMatchObject({
      op: { item: { title: 'Lamp', container: 'shelf' } },
    });
  });

  it('refuses an unknown type, a host op and a non-object', () => {
    expect(opOk({ type: 'rename-zone', title: 'A' })).toBe(false);
    expect(opOk({ type: 'link-editor', path: 'inventory.yaml', kind: 'manifest' })).toBe(false);
    expect(opOk(null)).toBe(false);
    expect(opOk('add-zone')).toBe(false);
  });

  it('add-zone: a title of 1 to 120 characters after trimming', () => {
    expect(opOk({ type: 'add-zone', title: x(120) })).toBe(true);
    expect(opOk({ type: 'add-zone', title: ` ${x(120)} ` })).toBe(true);
    expect(opOk({ type: 'add-zone', title: '' })).toBe(false);
  });

  it('a zone path of 1 to 1000 characters', () => {
    expect(opOk({ ...addItem({}), path: x(1000) })).toBe(true);
    expect(opOk({ ...addItem({}), path: x(1001) })).toBe(false);
    expect(opOk({ ...addItem({}), path: '' })).toBe(false);
  });

  it('an item id of 1 to 200 characters, one path segment', () => {
    const del = (id: string) => ({ type: 'delete-item', path: 'rooms/kitchen.yaml', id });
    expect(opOk(del(x(200)))).toBe(true);
    expect(opOk(del(x(201)))).toBe(false);
    expect(opOk(del(''))).toBe(false);
    expect(opOk(del('a/b'))).toBe(false);
    expect(opOk(del('a\\b'))).toBe(false);
    expect(opOk({ ...updateItem({}), id: 'a/b' })).toBe(false);
    expect(opOk({ type: 'delete-item', path: 'rooms/kitchen.yaml', id: 'mugs', extra: 1 })).toBe(
      false
    );
  });

  it('add-item: each field at its limit, and past it', () => {
    const atAndPast: [string, unknown, unknown][] = [
      ['title', x(500), x(501)],
      ['description', x(4000), x(4001)],
      ['serial', x(500), x(501)],
      ['acquired', x(200), x(201)],
      ['container', x(200), x(201)],
      ['value', 12.5, Infinity],
      ['quantity', 1, 0],
      ['tags', Array.from({ length: 50 }, () => x(100)), Array.from({ length: 51 }, () => 't')],
      ['fieldValues', { [x(100)]: x(2000) }, { [x(101)]: 'v' }],
    ];
    for (const [field, at, past] of atAndPast) {
      expect(opOk(addItem({ [field]: at })), `${field} at its limit`).toBe(true);
      expect(opOk(addItem({ [field]: past })), `${field} past its limit`).toBe(false);
    }
    expect(opOk(addItem({ quantity: 2.5 }))).toBe(false);
    expect(opOk(addItem({ quantity: -1 }))).toBe(false);
    expect(opOk(addItem({ value: Number.NaN }))).toBe(false);
    expect(opOk(addItem({ tags: [x(101)] }))).toBe(false);
    expect(opOk(addItem({ tags: [' '] }))).toBe(false);
    expect(opOk(addItem({ fieldValues: { a: x(2001) } }))).toBe(false);
    expect(opOk(addItem({ fieldValues: { a: true, b: 3, c: 's' } }))).toBe(true);
    expect(opOk(addItem({ fieldValues: { a: null } }))).toBe(false);
    expect(opOk(addItem({ fieldValues: { a: ['s'] } }))).toBe(false);
    expect(opOk(addItem({ description: null }))).toBe(false);
  });

  it('update-item: any subset, null clearing an optional field, never the id', () => {
    expect(opOk(updateItem({}))).toBe(true);
    expect(
      opOk(
        updateItem({
          description: null,
          value: null,
          quantity: null,
          serial: null,
          acquired: null,
          container: null,
          tags: null,
          fieldValues: { a: null },
          extraValues: { b: null, c: 'x' },
        })
      )
    ).toBe(true);
    expect(opOk(updateItem({ title: null }))).toBe(false);
    expect(opOk(updateItem({ title: ' ' }))).toBe(false);
    expect(opOk(updateItem({ title: x(500) }))).toBe(true);
    expect(opOk(updateItem({ title: x(501) }))).toBe(false);
    expect(opOk(updateItem({ id: 'other' }))).toBe(false);
    expect(opOk(updateItem({ extraValues: { [x(101)]: 'v' } }))).toBe(false);
    expect(opOk(updateItem({ quantity: 0 }))).toBe(false);
  });
});

describe('inventoryBounds.view', () => {
  it('takes the overview and a zone by a slug of 1 to 200 characters', () => {
    expect(inventoryBounds.view({ type: 'space' })).toEqual({ ok: true, view: { type: 'space' } });
    expect(viewOk({ type: 'zone', slug: x(200) })).toBe(true);
    expect(viewOk({ type: 'zone', slug: x(201) })).toBe(false);
    expect(viewOk({ type: 'zone', slug: '' })).toBe(false);
  });

  it('refuses an unknown view or key with APP_VIEW_INVALID', () => {
    expect(inventoryBounds.view({ type: 'room', slug: 'kitchen' })).toMatchObject({
      ok: false,
      code: 'APP_VIEW_INVALID',
    });
    expect(viewOk({ type: 'space', slug: 'kitchen' })).toBe(false);
  });
});

describe('inventoryBounds.create', () => {
  const field = (changes: Record<string, unknown> = {}) => ({
    id: 'amount',
    label: 'Amount',
    type: 'number',
    ...changes,
  });

  it('refuses what Context Manager refused before the plan', () => {
    expect(inventoryBounds.create({ label: x(121) })).toMatchObject({
      ok: false,
      code: 'APP_CREATE_INVALID',
    });
  });

  it('answers the input as parsed: trimmed', () => {
    expect(inventoryBounds.create({ label: ' Home ', zones: [' Attic '] })).toEqual({
      ok: true,
      input: { label: 'Home', zones: ['Attic'] },
    });
  });

  it('a label of 1 to 120 characters, and no folder or other key', () => {
    expect(createOk({ label: x(120) })).toBe(true);
    expect(createOk({ label: ' ' })).toBe(false);
    expect(createOk({ label: 'Home', folder: 'inventory' })).toBe(false);
    expect(createOk({})).toBe(false);
  });

  it('at most 50 zones, each 1 to 120 characters', () => {
    expect(createOk({ label: 'H', zones: Array.from({ length: 50 }, (_, i) => `z${i}`) })).toBe(
      true
    );
    expect(createOk({ label: 'H', zones: Array.from({ length: 51 }, (_, i) => `z${i}`) })).toBe(
      false
    );
    expect(createOk({ label: 'H', zones: [x(120)] })).toBe(true);
    expect(createOk({ label: 'H', zones: [x(121)] })).toBe(false);
    expect(createOk({ label: 'H', zones: [' '] })).toBe(false);
  });

  it('at most 100 fields, each with an id, a label and a type', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => field({ id: `f${i}` }));
    expect(createOk({ label: 'H', fields: many(100) })).toBe(true);
    expect(createOk({ label: 'H', fields: many(101) })).toBe(false);
    expect(createOk({ label: 'H', fields: [field({ id: x(100) })] })).toBe(true);
    expect(createOk({ label: 'H', fields: [field({ id: x(101) })] })).toBe(false);
    expect(createOk({ label: 'H', fields: [field({ id: 'Amount' })] })).toBe(false);
    expect(createOk({ label: 'H', fields: [field({ id: '-amount' })] })).toBe(false);
    expect(createOk({ label: 'H', fields: [field({ label: x(120) })] })).toBe(true);
    expect(createOk({ label: 'H', fields: [field({ label: x(121) })] })).toBe(false);
    expect(createOk({ label: 'H', fields: [field({ label: ' ' })] })).toBe(false);
    expect(createOk({ label: 'H', fields: [field({ type: 'text' })] })).toBe(true);
    expect(createOk({ label: 'H', fields: [field({ type: 'date' })] })).toBe(false);
    expect(createOk({ label: 'H', fields: [field({ required: true })] })).toBe(false);
  });

  it('a currency format: a three-letter code and 0 to 10 decimal places', () => {
    const format = (changes: Record<string, unknown>) => ({
      label: 'H',
      fields: [
        field({ format: { kind: 'currency', currency: 'CAD', decimalPlaces: 2, ...changes } }),
      ],
    });
    expect(createOk(format({}))).toBe(true);
    expect(createOk(format({ decimalPlaces: 0 }))).toBe(true);
    expect(createOk(format({ decimalPlaces: 10 }))).toBe(true);
    expect(createOk(format({ decimalPlaces: 11 }))).toBe(false);
    expect(createOk(format({ decimalPlaces: 1.5 }))).toBe(false);
    expect(createOk(format({ currency: 'cad' }))).toBe(false);
    expect(createOk(format({ currency: 'CADX' }))).toBe(false);
    expect(createOk(format({ kind: 'percent' }))).toBe(false);
    expect(createOk(format({ symbol: '$' }))).toBe(false);
  });

  it('a total names field ids, and nothing else', () => {
    expect(createOk({ label: 'H', total: { field: 'amount', multiplyBy: 'quantity' } })).toBe(true);
    expect(createOk({ label: 'H', total: { field: 'Amount' } })).toBe(false);
    expect(createOk({ label: 'H', total: { field: 'amount', round: true } })).toBe(false);
  });
});
