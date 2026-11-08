import { describe, expect, it } from 'vitest';

import { parseZoneFile } from './zone.js';

import type { SharedInventorySchema } from './types.js';

const configuredSchema: SharedInventorySchema = {
  mode: 'configured',
  manifest: {
    version: 2,
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
        id: 'value',
        label: 'Reading',
        type: 'number',
        required: false,
        visibility: { table: true, add: true, edit: true },
        export: true,
      },
    ],
  },
};

describe('parseZoneFile', () => {
  it('parses a zone with label and items, defaulting quantity', () => {
    const result = parseZoneFile(
      [
        'label: Kitchen',
        'items:',
        '  - id: espresso-machine',
        '    title: Rancilio Silvia',
        '    value: 545',
        '  - id: mugs',
        '    title: Diner mugs',
        '    quantity: 6',
        '    value: 8',
      ].join('\n')
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.label).toBe('Kitchen');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: 'espresso-machine',
      title: 'Rancilio Silvia',
      value: 545,
      quantity: 1,
      fieldValues: {},
      extraFields: [],
    });
    expect(result.items[1]).toMatchObject({ quantity: 6, value: 8 });
    expect(result.attention).toEqual([]);
  });

  it('treats an empty file and a label-only file as legitimate empty zones', () => {
    expect(parseZoneFile('')).toEqual({ ok: true, items: [], attention: [], warnings: [] });
    const labeled = parseZoneFile('label: Attic\n');
    expect(labeled).toMatchObject({ ok: true, label: 'Attic', items: [] });
  });

  it('demotes the zone on YAML errors and non-mapping documents', () => {
    expect(parseZoneFile('items: [unclosed').ok).toBe(false);
    expect(parseZoneFile('- just\n- a list\n')).toEqual({
      ok: false,
      error: 'room file must be a YAML mapping',
    });
    expect(parseZoneFile('items: not-a-sequence\n')).toEqual({
      ok: false,
      error: `'items' must be a sequence`,
    });
  });

  it('demotes items with missing/empty id or title, keeping the rest', () => {
    const result = parseZoneFile(
      [
        'items:',
        '  - title: No id',
        '  - id: ""',
        '    title: Blank id',
        '  - id: no-title',
        '  - id: ok',
        '    title: Fine',
      ].join('\n')
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map((i) => i.id)).toEqual(['ok']);
    expect(result.attention).toEqual([
      { title: 'No id', reason: `item 1 has no usable 'id'` },
      { title: 'Blank id', reason: `item 2 has no usable 'id'` },
      { id: 'no-title', reason: `item 'no-title' has no usable 'title'` },
    ]);
  });

  it('demotes non-mapping entries and bad core numerics with reasons', () => {
    const result = parseZoneFile(
      [
        'items:',
        '  - just-a-string',
        '  - id: priced-wrong',
        '    title: Couch',
        '    value: "450"',
        '  - id: counted-wrong',
        '    title: Chairs',
        '    quantity: 2.5',
        '  - id: negative',
        '    title: Ghost',
        '    quantity: 0',
      ].join('\n')
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([]);
    expect(result.attention.map((a) => a.reason)).toEqual([
      'item 1 is not a mapping',
      `item 'priced-wrong': 'value' must be a number`,
      `item 'counted-wrong': 'quantity' must be a positive integer`,
      `item 'negative': 'quantity' must be a positive integer`,
    ]);
  });

  it('demotes nested values under core keys', () => {
    const result = parseZoneFile(
      ['items:', '  - id: bad', '    title: Bad', '    serial:', '      inner: 1'].join('\n')
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attention[0].reason).toBe(`item 'bad': 'serial' must be a scalar`);
  });

  it('coerces scalar core text (numeric serial) and scalar lists to strings', () => {
    const result = parseZoneFile(
      [
        'items:',
        '  - id: tv',
        '    title: TV',
        '    serial: 12345',
        '    tags: [electronics, 4]',
      ].join('\n')
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0].serial).toBe('12345');
    expect(result.items[0].tags).toEqual(['electronics', '4']);
  });

  it('routes declared fields to fieldValues and unknown keys to extraFields', () => {
    const result = parseZoneFile(
      [
        'items:',
        '  - id: desk',
        '    title: Desk',
        '    condition: good',
        '    provenance: estate sale',
        '    dimensions: [120, 60]',
        '    receipt:',
        '      store: IKEA',
      ].join('\n'),
      new Set(['condition'])
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.items[0];
    expect(item.fieldValues).toEqual({ condition: 'good' });
    expect(item.extraFields).toEqual([
      { key: 'provenance', value: 'estate sale' },
      { key: 'dimensions', value: [120, 60] },
      { key: 'receipt', opaque: true },
    ]);
  });

  it('keeps a declared field with a nested value as an opaque extra with a warning', () => {
    const result = parseZoneFile(
      ['items:', '  - id: desk', '    title: Desk', '    condition:', '      note: worn'].join(
        '\n'
      ),
      new Set(['condition'])
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0].fieldValues).toEqual({});
    expect(result.items[0].extraFields).toEqual([{ key: 'condition', opaque: true }]);
    expect(result.items[0].warnings).toEqual([`declared field 'condition' has a non-scalar value`]);
  });

  it('warns on unknown top-level keys and unusable labels', () => {
    const result = parseZoneFile(['label: [nested]', 'color: blue', 'items: []'].join('\n'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.label).toBeUndefined();
    expect(result.warnings).toEqual([
      `unknown key 'color' is ignored`,
      `'label' is not a usable scalar and was ignored`,
    ]);
  });

  it('treats only id/title as core in configured mode and classifies values without coercion', () => {
    const result = parseZoneFile(
      [
        'items:',
        '  - id: meter',
        '    title: Meter',
        '    owner: 42',
        '    value: "12.5"',
        '    quantity: 3',
        '    container: shelf',
        '    notes:',
        '      nested: true',
      ].join('\n'),
      configuredSchema
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.items[0];
    expect(item.quantity).toBe(1);
    expect(item.value).toBeUndefined();
    expect(item.resolvedFieldValues).toMatchObject({
      owner: { state: 'invalid', value: 42, issue: { kind: 'type-mismatch' } },
      value: { state: 'invalid', value: '12.5', issue: { kind: 'type-mismatch' } },
    });
    expect(item.extraFields).toEqual([
      { key: 'quantity', value: 3 },
      { key: 'container', value: 'shelf' },
      {
        key: 'notes',
        opaque: true,
        summary: 'Mapping',
        readOnlyReason: 'Mapping can only be edited in YAML',
      },
    ]);
  });

  it('distinguishes optional absence, missing required, valid scalars, and structured fields', () => {
    const result = parseZoneFile(
      [
        'items:',
        '  - id: absent',
        '    title: Absent',
        '  - id: valid',
        '    title: Valid',
        '    owner: Jamie',
        '    value: 0',
        '  - id: structured',
        '    title: Structured',
        '    owner: [Jamie]',
      ].join('\n'),
      configuredSchema
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0].resolvedFieldValues).toMatchObject({
      owner: { state: 'missing', issue: { kind: 'missing-required' } },
      value: { state: 'missing' },
    });
    expect(result.items[1].resolvedFieldValues).toMatchObject({
      owner: { state: 'valid', value: 'Jamie' },
      value: { state: 'valid', value: 0 },
    });
    expect(result.items[2].resolvedFieldValues?.owner).toMatchObject({
      state: 'structured',
      issue: { kind: 'structured' },
    });
    expect(result.items[2].extraFields).toEqual([]);
  });

  it('uses neutral id/title/Other data recovery for invalid configuration', () => {
    const result = parseZoneFile(
      'items:\n  - id: old\n    title: Old\n    value: 12\n    quantity: 2\n',
      { mode: 'invalid', declaredVersion: 2, errors: ['fields.0: bad'] }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0]).toMatchObject({
      id: 'old',
      title: 'Old',
      fieldValues: {},
      extraFields: [
        { key: 'value', value: 12 },
        { key: 'quantity', value: 2 },
      ],
    });
  });

  it('keeps aliases read-only and structured even when they resolve to scalars or scalar lists', () => {
    const result = parseZoneFile(
      [
        'defaults:',
        '  owner: &owner Jamie',
        '  labels: &labels [one, two]',
        'items:',
        '  - id: aliased',
        '    title: Aliased',
        '    owner: *owner',
        '    labels: *labels',
      ].join('\n'),
      configuredSchema
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0].resolvedFieldValues?.owner).toMatchObject({
      state: 'structured',
      issue: { kind: 'structured', actual: 'alias' },
    });
    expect(result.items[0].extraFields).toEqual([
      {
        key: 'labels',
        opaque: true,
        summary: 'Alias',
        readOnlyReason: 'Alias can only be edited in YAML',
      },
    ]);
  });

  it('reclassifies the same bytes as fields are added, removed, or changed without coercion', () => {
    const source = 'items:\n  - id: meter\n    title: Meter\n    owner: Jamie\n';
    const withoutOwner = parseZoneFile(source, {
      mode: 'configured',
      manifest: { version: 2, fields: [] },
    });
    const withOwner = parseZoneFile(source, configuredSchema);
    const ownerAsNumber = parseZoneFile(source, {
      mode: 'configured',
      manifest: {
        version: 2,
        fields: [
          {
            id: 'owner',
            label: 'Owner',
            type: 'number',
            required: false,
            visibility: { table: true, add: true, edit: true },
            export: true,
          },
        ],
      },
    });

    expect(withoutOwner.ok && withoutOwner.items[0].extraFields).toEqual([
      { key: 'owner', value: 'Jamie' },
    ]);
    expect(withOwner.ok && withOwner.items[0].resolvedFieldValues?.owner).toEqual({
      state: 'valid',
      value: 'Jamie',
    });
    expect(ownerAsNumber.ok && ownerAsNumber.items[0].resolvedFieldValues?.owner).toMatchObject({
      state: 'invalid',
      value: 'Jamie',
      issue: { kind: 'type-mismatch' },
    });
  });
});
