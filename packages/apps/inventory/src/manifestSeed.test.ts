import { describe, expect, it } from 'vitest';

import { parseInventoryManifest } from './manifest.js';
import { manifestSeedContent } from './manifestSeed.js';

describe('manifestSeedContent', () => {
  it('writes exact minimal v2 bytes with no implicit fields or currency', () => {
    expect(manifestSeedContent({ label: 'Maple Street House' })).toBe(
      'version: 2\nlabel: Maple Street House\n'
    );
    expect(manifestSeedContent({ label: 'Maple Street House', fields: [] })).toBe(
      'version: 2\nlabel: Maple Street House\n'
    );
  });

  it('writes text/number/currency fields and one total in canonical order', () => {
    expect(
      manifestSeedContent({
        label: 'Workshop assets',
        fields: [
          { id: 'owner', label: 'Owner', type: 'text' },
          { id: 'quantity', label: 'Quantity', type: 'number' },
          {
            id: 'replacement-value',
            label: 'Replacement value',
            type: 'number',
            format: { kind: 'currency', currency: 'CAD', decimalPlaces: 2 },
          },
        ],
        total: { field: 'replacement-value', multiplyBy: 'quantity' },
      })
    ).toBe(
      [
        'version: 2',
        'label: Workshop assets',
        'fields:',
        '  - id: owner',
        '    label: Owner',
        '    type: text',
        '  - id: quantity',
        '    label: Quantity',
        '    type: number',
        '  - id: replacement-value',
        '    label: Replacement value',
        '    type: number',
        '    format:',
        '      kind: currency',
        '      currency: CAD',
        '      decimalPlaces: 2',
        'total:',
        '  field: replacement-value',
        '  multiplyBy: quantity',
        '',
      ].join('\n')
    );
  });

  it('quotes a label YAML would misread and round-trips with defaults normalized', () => {
    const content = manifestSeedContent({
      label: 'Attic: north side',
      fields: [{ id: 'true-value', label: 'true', type: 'number' }],
    });
    expect(content).toContain('label: "Attic: north side"\n');
    expect(content).toContain('    label: "true"\n');
    const parsed = parseInventoryManifest(content);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.manifest.version !== 2) return;
    expect(parsed.manifest.fields[0]).toEqual({
      id: 'true-value',
      label: 'true',
      type: 'number',
      required: false,
      visibility: { table: true, add: true, edit: true },
      export: true,
    });
  });
});
