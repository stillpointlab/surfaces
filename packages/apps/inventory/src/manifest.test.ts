import { describe, expect, it } from 'vitest';

import { parseInventoryManifest } from './manifest.js';

describe('parseInventoryManifest', () => {
  it('keeps minimal v1 defaults unchanged', () => {
    expect(parseInventoryManifest('version: 1\n')).toEqual({
      ok: true,
      manifest: { version: 1, currency: 'USD', fields: [], containers: [] },
      warnings: [],
    });
  });

  it('keeps full v1 parsing and tolerant unknown-key warnings', () => {
    const result = parseInventoryManifest(
      [
        'version: 1',
        'label: Maple St House',
        'currency: CAD',
        'theme: dark',
        'fields:',
        '  - id: purchased',
        '    label: Purchased',
        '    type: date',
        '    width: 120',
        'containers: [closet, dresser]',
      ].join('\n')
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.manifest.version !== 1) return;
    expect(result.manifest).toMatchObject({
      version: 1,
      label: 'Maple St House',
      currency: 'CAD',
      fields: [{ id: 'purchased', label: 'Purchased', type: 'date' }],
      containers: ['closet', 'dresser'],
    });
    expect(result.warnings).toEqual([
      `unknown key 'theme' is ignored`,
      `unknown key 'fields.0.width' is ignored`,
    ]);
  });

  it('does not retroactively apply the v2 field-id length cap to v1', () => {
    const longId = `field-${'x'.repeat(120)}`;
    const result = parseInventoryManifest(
      `version: 1\nfields:\n  - id: ${longId}\n    label: Long\n`
    );
    expect(result.ok).toBe(true);
  });

  it('normalizes minimal and full v2 manifests', () => {
    expect(parseInventoryManifest('version: 2\n')).toEqual({
      ok: true,
      manifest: { version: 2, fields: [] },
      warnings: [],
    });
    const result = parseInventoryManifest(
      [
        'version: 2',
        'label: Workshop assets',
        'fields:',
        '  - id: owner',
        '    label: Owner',
        '    type: text',
        '    required: true',
        '  - id: replacement-value',
        '    label: Replacement value',
        '    type: number',
        '    visibility:',
        '      table: false',
        '    export: false',
        '    format:',
        '      kind: currency',
        '      currency: CAD',
        '      decimalPlaces: 3',
        '  - id: quantity',
        '    label: Quantity',
        '    type: number',
        'total:',
        '  field: replacement-value',
        '  multiplyBy: quantity',
      ].join('\n')
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.manifest.version !== 2) return;
    expect(result.manifest).toEqual({
      version: 2,
      label: 'Workshop assets',
      fields: [
        {
          id: 'owner',
          label: 'Owner',
          type: 'text',
          required: true,
          visibility: { table: true, add: true, edit: true },
          export: true,
        },
        {
          id: 'replacement-value',
          label: 'Replacement value',
          type: 'number',
          required: false,
          visibility: { table: false, add: true, edit: true },
          export: false,
          format: { kind: 'currency', currency: 'CAD', decimalPlaces: 3 },
        },
        {
          id: 'quantity',
          label: 'Quantity',
          type: 'number',
          required: false,
          visibility: { table: true, add: true, edit: true },
          export: true,
        },
      ],
      total: { field: 'replacement-value', multiplyBy: 'quantity' },
    });
  });

  it.each([
    ['top level', 'version: 2\nvisiblity: {}\n', 'visiblity'],
    [
      'field',
      'version: 2\nfields:\n  - id: owner\n    label: Owner\n    type: text\n    exports: false\n',
      'fields.0',
    ],
    [
      'visibility',
      'version: 2\nfields:\n  - id: owner\n    label: Owner\n    type: text\n    visibility:\n      tables: false\n',
      'fields.0.visibility',
    ],
    [
      'format',
      'version: 2\nfields:\n  - id: amount\n    label: Amount\n    type: number\n    format:\n      kind: currency\n      currency: USD\n      decimalPlaces: 2\n      locale: en\n',
      'fields.0.format',
    ],
    [
      'total',
      'version: 2\nfields:\n  - id: amount\n    label: Amount\n    type: number\ntotal:\n  field: amount\n  round: true\n',
      'total',
    ],
  ])('rejects unknown v2 keys at the %s mapping', (_level, yaml, path) => {
    const result = parseInventoryManifest(yaml);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.declaredVersion).toBe(2);
    expect(result.errors.join(' ')).toContain(path);
  });

  it.each([
    [
      'reserved id',
      'version: 2\nfields:\n  - id: title\n    label: Name\n    type: text\n',
      'reserved',
    ],
    [
      'duplicate id',
      'version: 2\nfields:\n  - id: owner\n    label: Owner\n    type: text\n  - id: owner\n    label: Keeper\n    type: text\n',
      'duplicate field id',
    ],
    [
      'duplicate label',
      'version: 2\nfields:\n  - id: owner\n    label: Owner\n    type: text\n  - id: keeper\n    label: OWNER\n    type: text\n',
      'duplicate field label',
    ],
    [
      'format on text',
      'version: 2\nfields:\n  - id: owner\n    label: Owner\n    type: text\n    format:\n      kind: currency\n      currency: USD\n      decimalPlaces: 2\n',
      'only valid for number',
    ],
    [
      'required hidden',
      'version: 2\nfields:\n  - id: owner\n    label: Owner\n    type: text\n    required: true\n    visibility:\n      edit: false\n',
      'required field must be visible',
    ],
    ['unknown total', 'version: 2\ntotal:\n  field: amount\n', 'not a declared field'],
    [
      'same multiplier',
      'version: 2\nfields:\n  - id: amount\n    label: Amount\n    type: number\ntotal:\n  field: amount\n  multiplyBy: amount\n',
      'different field',
    ],
  ])('rejects invalid v2 %s', (_case, yaml, message) => {
    const result = parseInventoryManifest(yaml);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain(message);
  });

  it.each([
    [
      'a non-contract type',
      'version: 2\nfields:\n  - id: active\n    label: Active\n    type: boolean\n',
      'type',
    ],
    [
      'a blank label',
      'version: 2\nfields:\n  - id: owner\n    label: "   "\n    type: text\n',
      'blank',
    ],
    [
      'an overlong id',
      `version: 2\nfields:\n  - id: ${'x'.repeat(101)}\n    label: Long\n    type: text\n`,
      '100',
    ],
    [
      'an overlong label',
      `version: 2\nfields:\n  - id: long\n    label: ${'x'.repeat(121)}\n    type: text\n`,
      '120',
    ],
    [
      'lowercase currency',
      'version: 2\nfields:\n  - id: amount\n    label: Amount\n    type: number\n    format: { kind: currency, currency: usd, decimalPlaces: 2 }\n',
      'uppercase',
    ],
    [
      'fractional decimalPlaces',
      'version: 2\nfields:\n  - id: amount\n    label: Amount\n    type: number\n    format: { kind: currency, currency: USD, decimalPlaces: 2.5 }\n',
      'expected int',
    ],
    [
      'too many decimal places',
      'version: 2\nfields:\n  - id: amount\n    label: Amount\n    type: number\n    format: { kind: currency, currency: USD, decimalPlaces: 11 }\n',
      '10',
    ],
    [
      'a text total field',
      'version: 2\nfields:\n  - id: owner\n    label: Owner\n    type: text\ntotal: { field: owner }\n',
      'not a number',
    ],
    [
      'an unknown multiplier',
      'version: 2\nfields:\n  - id: amount\n    label: Amount\n    type: number\ntotal: { field: amount, multiplyBy: quantity }\n',
      'not a declared',
    ],
  ])('rejects %s', (_case, yaml, message) => {
    const result = parseInventoryManifest(yaml);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.declaredVersion).toBe(2);
    expect(result.errors.join(' ')).toContain(message);
  });

  it('enforces the configured field cap before room parsing', () => {
    const fields = Array.from(
      { length: 101 },
      (_, index) => `  - id: field-${index}\n    label: Field ${index}\n    type: text`
    ).join('\n');
    const result = parseInventoryManifest(`version: 2\nfields:\n${fields}\n`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('100');
  });

  it('carries version evidence on validation and YAML failures', () => {
    const future = parseInventoryManifest('version: 99\n');
    expect(future).toEqual({
      ok: false,
      declaredVersion: 99,
      errors: ['version: 99 is not supported'],
    });
    const brokenV2 = parseInventoryManifest('version: 2\nfields: [unclosed');
    expect(brokenV2.ok).toBe(false);
    if (brokenV2.ok) return;
    expect(brokenV2.declaredVersion).toBe(2);
    expect(brokenV2.errors[0]).toMatch(/YAML parse error/);
  });

  it('rejects non-mapping and unrecognized-version documents neutrally', () => {
    expect(parseInventoryManifest('- a list')).toEqual({
      ok: false,
      errors: ['manifest must be a YAML mapping'],
    });
    expect(parseInventoryManifest('label: Missing version\n')).toEqual({
      ok: false,
      errors: ['version: expected 1 or 2'],
    });
  });
});
