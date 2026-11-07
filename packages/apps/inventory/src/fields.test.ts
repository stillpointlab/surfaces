import { describe, expect, it } from 'vitest';

import {
  rejectConfiguredLegacyInput,
  validateConfiguredField,
  validateExtraKey,
  validateLegacyDeclaredField,
} from './fields.js';

import type {
  SharedInventoryFieldDef,
  SharedInventoryFieldV2,
  SharedInventoryManifestV1,
} from './types.js';

const field = (id: string, type: 'text' | 'number', required = false): SharedInventoryFieldV2 => ({
  id,
  label: id,
  type,
  required,
  visibility: { table: true, add: true, edit: true },
  export: true,
});

const fields = [field('room', 'text', true), field('price', 'number'), field('notes', 'text')];

const legacy: SharedInventoryManifestV1 = {
  version: 1,
  currency: 'USD',
  fields: [
    { id: 'colour', type: 'text' } as SharedInventoryFieldDef,
    { id: 'weight', type: 'number' } as SharedInventoryFieldDef,
  ],
  containers: [],
};

const refused = (code: string, message: string) => ({ ok: false, code, message });

describe('validateLegacyDeclaredField', () => {
  it('accepts a declared field of the right type', () => {
    expect(validateLegacyDeclaredField(legacy, 'colour', 'red')).toEqual({ ok: true });
    expect(validateLegacyDeclaredField(legacy, 'weight', 3)).toEqual({ ok: true });
  });

  it('refuses an undeclared field and a wrong type, with the codes the host maps', () => {
    expect(validateLegacyDeclaredField(legacy, 'size', 'L')).toEqual(
      refused('INVENTORY_UNKNOWN_FIELD', "'size' is not a field declared in inventory.yaml")
    );
    expect(validateLegacyDeclaredField(legacy, 'weight', 'heavy')).toEqual(
      refused('INVENTORY_FIELD_TYPE', "'weight' must be a number")
    );
    expect(validateLegacyDeclaredField(legacy, 'colour', 4)).toEqual(
      refused('INVENTORY_FIELD_TYPE', "'colour' must be text")
    );
  });
});

describe('validateConfiguredField', () => {
  it('answers with the declared field', () => {
    expect(validateConfiguredField(fields, 'price', 12.5)).toEqual({ ok: true, field: fields[1] });
  });

  it('refuses an unknown field, a wrong type and a blank required text', () => {
    expect(validateConfiguredField(fields, 'size', 'L')).toEqual(
      refused('INVENTORY_UNKNOWN_FIELD', "'size' is not a field declared in inventory.yaml")
    );
    expect(validateConfiguredField(fields, 'price', Number.POSITIVE_INFINITY)).toEqual(
      refused('INVENTORY_FIELD_TYPE', "'price' must be a finite number")
    );
    expect(validateConfiguredField(fields, 'notes', 3)).toEqual(
      refused('INVENTORY_FIELD_TYPE', "'notes' must be text")
    );
    expect(validateConfiguredField(fields, 'room', '  ')).toEqual(
      refused('INVENTORY_REQUIRED_FIELD', "'room' must not be blank")
    );
  });
});

describe('rejectConfiguredLegacyInput', () => {
  it('accepts input without the v1 core fields', () => {
    expect(rejectConfiguredLegacyInput({})).toEqual({ ok: true });
  });

  it('refuses the first v1 core field present', () => {
    expect(rejectConfiguredLegacyInput({ value: 3 })).toEqual(
      refused(
        'INVENTORY_LEGACY_FIELD',
        "'value' is a legacy field and is not accepted by inventory.yaml version 2"
      )
    );
  });
});

describe('validateExtraKey', () => {
  it('accepts a safe key no field claims', () => {
    expect(validateExtraKey(fields, 'warranty')).toEqual({ ok: true });
  });

  it('refuses an unsafe or reserved key, and one a configured field claims', () => {
    for (const key of ['Warranty', 'id', 'x'.repeat(101)]) {
      expect(validateExtraKey(fields, key)).toEqual(
        refused('INVENTORY_EXTRA_KEY', `'${key}' is not a safe Other data key`)
      );
    }
    expect(validateExtraKey(fields, 'price')).toEqual(
      refused('INVENTORY_EXTRA_COLLISION', "'price' is a configured field, not Other data")
    );
  });
});
