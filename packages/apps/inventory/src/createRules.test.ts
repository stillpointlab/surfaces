import { describe, expect, it } from 'vitest';

import { checkInventoryCreate } from './createRules.js';

import type { InventoryCreateFields } from './createRules.js';

const number = (id: string, label: string) => ({ id, label, type: 'number' as const });
const refusal = (input: InventoryCreateFields) => {
  const result = checkInventoryCreate(input);
  return result.ok ? null : { code: result.code, message: result.message, at: result.details?.[0] };
};

describe('checkInventoryCreate', () => {
  it('accepts a name alone, and a full create', () => {
    expect(checkInventoryCreate({ label: 'Home' })).toEqual({ ok: true });
    expect(
      checkInventoryCreate({
        label: 'Home',
        zones: ['Kitchen', 'Garage'],
        fields: [
          {
            ...number('value', 'Value'),
            format: { kind: 'currency', currency: 'USD', decimalPlaces: 2 },
          },
          number('quantity', 'Quantity'),
        ],
        total: { field: 'value', multiplyBy: 'quantity' },
      })
    ).toEqual({ ok: true });
  });

  it('refuses a missing or overlong name', () => {
    expect(refusal({ label: '' })).toEqual({
      code: 'INVENTORY_LABEL_REQUIRED',
      message: 'Give the inventory a name.',
      at: { field: 'label' },
    });
    expect(refusal({ label: 'x'.repeat(121) })?.code).toBe('INVENTORY_LABEL_TOO_LONG');
  });

  it('refuses zones that name no file, the same file, or too many', () => {
    expect(refusal({ label: 'Home', zones: ['Kitchen', '!!!'] })).toMatchObject({
      code: 'INVENTORY_ROOM_NAME_INVALID',
      at: { field: 'zones', index: 1 },
    });
    expect(refusal({ label: 'Home', zones: ['Front Room', 'front-room!'] })).toMatchObject({
      code: 'INVENTORY_ROOM_NAME_DUPLICATE',
      message: 'Two zones would both be saved as “front-room.yaml”.',
    });
    const many = Array.from({ length: 51 }, (_, i) => `Zone ${i}`);
    expect(refusal({ label: 'Home', zones: many })?.code).toBe('INVENTORY_TOO_MANY_ZONES');
  });

  it('refuses reserved, malformed and repeated columns', () => {
    expect(refusal({ label: 'Home', fields: [number('id', 'Id')] })).toMatchObject({
      code: 'INVENTORY_FIELD_ID_RESERVED',
      at: { field: 'fields', index: 0 },
    });
    expect(refusal({ label: 'Home', fields: [number('Bad Id', 'Bad')] })?.code).toBe(
      'INVENTORY_FIELD_ID_INVALID'
    );
    expect(
      refusal({ label: 'Home', fields: [number('a', 'Owner'), number('a', 'Other')] })?.code
    ).toBe('INVENTORY_FIELD_ID_DUPLICATE');
    expect(
      refusal({ label: 'Home', fields: [number('a', 'Owner'), number('b', 'owner')] })?.code
    ).toBe('INVENTORY_FIELD_LABEL_DUPLICATE');
  });

  it('refuses a bad currency code', () => {
    const fields = [
      {
        ...number('value', 'Value'),
        format: { kind: 'currency' as const, currency: 'US', decimalPlaces: 2 },
      },
    ];
    expect(refusal({ label: 'Home', fields })).toMatchObject({
      code: 'INVENTORY_CURRENCY_INVALID',
      at: { field: 'currency' },
    });
  });

  it('refuses a total or multiplier that is not another number column', () => {
    const fields = [number('value', 'Value'), { id: 'note', label: 'Note', type: 'text' as const }];
    expect(refusal({ label: 'Home', fields, total: { field: 'note' } })).toMatchObject({
      code: 'INVENTORY_TOTAL_INVALID',
      at: { field: 'total' },
    });
    expect(
      refusal({ label: 'Home', fields, total: { field: 'value', multiplyBy: 'value' } })
    ).toMatchObject({ code: 'INVENTORY_TOTAL_INVALID', at: { field: 'multiplyBy' } });
  });
});
