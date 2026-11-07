import { describe, expect, it } from 'vitest';

import {
  CSV_BOM,
  exportSlug,
  exportWarnings,
  serializeRoom,
  serializeSpace,
  toCsvCell,
  toCsvRow,
} from './csv.js';

import type { SharedInventoryItem, SharedInventoryRoom, SharedInventorySchema } from './types.js';
import type { Result } from '@stillpointlab/common-format/app';

/** An export's CSV text, failing the test when the export refuses. */
function csvOf(result: Result<{ content: string }>): string {
  if (!result.ok) throw new Error(`the export refused: ${result.code} ${result.message}`);
  return result.content;
}

const item = (
  overrides: Partial<SharedInventoryItem> & { id: string; title: string }
): SharedInventoryItem => ({
  quantity: 1,
  fieldValues: {},
  extraFields: [],
  ...overrides,
});

const room = (overrides: Partial<SharedInventoryRoom> & { slug: string }): SharedInventoryRoom => ({
  label: overrides.slug,
  path: `rooms/${overrides.slug}.yaml`,
  items: [],
  totals: { itemCount: 0, value: 0, unvaluedCount: 0 },
  subtotal: 0,
  unvaluedCount: 0,
  needsAttention: [],
  writable: true,
  ...overrides,
});

const FIELDS = [{ id: 'condition', label: 'Condition', type: 'text' as const }];

const CONFIGURED: SharedInventorySchema = {
  mode: 'configured',
  manifest: {
    version: 2,
    fields: [
      {
        id: 'amount',
        label: 'Amount',
        type: 'number',
        required: false,
        visibility: { table: true, add: true, edit: true },
        export: true,
        format: { kind: 'currency', currency: 'USD', decimalPlaces: 2 },
      },
      {
        id: 'secret',
        label: 'Secret',
        type: 'text',
        required: false,
        visibility: { table: false, add: false, edit: false },
        export: false,
      },
    ],
  },
};

describe('toCsvCell / toCsvRow', () => {
  it.each([
    ['plain', 'plain'],
    ['with, comma', '"with, comma"'],
    ['with "quote"', '"with ""quote"""'],
    ['line\nbreak', '"line\nbreak"'],
    ['línea única', 'línea única'],
    ['=SUM(A1)', `'=SUM(A1)`],
    ['+1', `'+1`],
    ['-1', `'-1`],
    ['@cmd', `'@cmd`],
    ['\tleading tab', `'\tleading tab`],
    ['=1,2', `"'=1,2"`],
  ])('serializes %j as %s', (raw, expected) => {
    expect(toCsvCell(raw)).toBe(expected);
  });

  it('joins cells with commas', () => {
    expect(toCsvRow(['a', 'b,c', '=x'])).toBe(`a,"b,c",'=x`);
  });
});

describe('serializeRoom', () => {
  it('emits BOM + CRLF rows with core, declared, and unknown columns in order', () => {
    const kitchen = room({
      slug: 'kitchen',
      label: 'Kitchen',
      items: [
        item({
          id: 'espresso-machine',
          title: 'Rancilio Silvia',
          description: 'Single boiler',
          value: 545,
          serial: '0042',
          acquired: '2019-06-01',
          container: 'counter',
          tags: ['kitchen', 'appliance'],
          fieldValues: { condition: 'good' },
          extraFields: [
            { key: 'provenance', value: 'estate sale' },
            { key: 'receipt', opaque: true },
          ],
        }),
        item({ id: 'mugs', title: 'Diner mugs', quantity: 6, value: 8 }),
      ],
    });

    const csv = csvOf(serializeRoom(kitchen, FIELDS));
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(CSV_BOM.length).split('\r\n');
    expect(lines[0]).toBe(
      'id,title,description,value,quantity,serial,acquired,container,tags,Condition,provenance,receipt'
    );
    expect(lines[1]).toBe(
      'espresso-machine,Rancilio Silvia,Single boiler,545,1,0042,2019-06-01,counter,"kitchen, appliance",good,estate sale,'
    );
    // Empty optional fields are empty strings; opaque values export empty;
    // quantity keeps its default rather than inventing zeros elsewhere.
    expect(lines[2]).toBe('mugs,Diner mugs,,8,6,,,,,,,');
    expect(lines[3]).toBe('');
    expect(lines).toHaveLength(4);
  });

  it('neutralizes a formula-injection title in context', () => {
    const csv = csvOf(
      serializeRoom(
        room({ slug: 'r', items: [item({ id: 'a', title: '=HYPERLINK("http://evil")' })] }),
        []
      )
    );
    expect(csv).toContain(`'=HYPERLINK`);
  });

  it('keeps v1 formula protection for negative numeric Other data', () => {
    const csv = csvOf(
      serializeRoom(
        room({
          slug: 'r',
          items: [
            item({ id: 'a', title: 'A', extraFields: [{ key: 'temperature', value: -12.5 }] }),
          ],
        }),
        []
      )
    );

    expect(csv).toContain(",'-12.5\r\n");
  });

  it('exports configured raw numeric values, export fields, and serializable extras only', () => {
    const configured = room({
      slug: 'lab',
      items: [
        item({
          id: 'meter',
          title: '=Meter',
          resolvedFieldValues: {
            amount: { state: 'valid', value: -12.345 },
            secret: { state: 'valid', value: 'hidden' },
          },
          extraFields: [
            { key: 'owner', value: '+Jamie' },
            { key: 'structured-only', opaque: true, summary: 'Mapping' },
          ],
        }),
      ],
    });
    const lines = csvOf(serializeRoom(configured, CONFIGURED)).slice(CSV_BOM.length).split('\r\n');
    expect(lines[0]).toBe('id,title,Amount,owner');
    expect(lines[1]).toBe("meter,'=Meter,-12.345,'+Jamie");
    expect(lines.join('\n')).not.toContain('Secret');
    expect(lines.join('\n')).not.toContain('structured-only');
  });
});

describe('invalid schema', () => {
  it('refuses to export an invalid schema with a failure, not a host error', () => {
    const invalid: SharedInventorySchema = {
      mode: 'invalid',
      declaredVersion: 2,
      errors: ['fields: invalid'],
    };
    for (const result of [
      serializeRoom(room({ slug: 'kitchen' }), invalid),
      serializeSpace([room({ slug: 'kitchen' })], invalid),
    ]) {
      expect(result).toEqual({
        ok: false,
        code: 'INVENTORY_SCHEMA_INVALID',
        message: 'Repair inventory.yaml before exporting',
      });
    }
  });
});

describe('serializeSpace', () => {
  it('prepends a room column and unions unknown keys across rooms', () => {
    const rooms = [
      room({
        slug: 'kitchen',
        label: 'Kitchen',
        items: [item({ id: 'a', title: 'A', extraFields: [{ key: 'x', value: '1' }] })],
      }),
      room({
        slug: 'office',
        label: 'Office',
        items: [item({ id: 'b', title: 'B', extraFields: [{ key: 'y', value: '2' }] })],
      }),
    ];
    const csv = csvOf(serializeSpace(rooms, []));
    const lines = csv.slice(CSV_BOM.length).split('\r\n');
    expect(lines[0]).toBe(
      'room,id,title,description,value,quantity,serial,acquired,container,tags,x,y'
    );
    expect(lines[1]).toBe('Kitchen,a,A,,,1,,,,,1,');
    expect(lines[2]).toBe('Office,b,B,,,1,,,,,,2');
  });

  it('uses zone and first-seen configured extras across the flat v2 export', () => {
    const rooms = [
      room({
        slug: 'one',
        label: 'One',
        items: [
          item({
            id: 'a',
            title: 'A',
            resolvedFieldValues: { amount: { state: 'valid', value: 1 } },
            extraFields: [{ key: 'first', value: true }],
          }),
        ],
      }),
      room({
        slug: 'two',
        label: 'Two',
        items: [
          item({
            id: 'b',
            title: 'B',
            resolvedFieldValues: { amount: { state: 'valid', value: 2 } },
            extraFields: [{ key: 'second', value: ['x', 'y'] }],
          }),
        ],
      }),
    ];
    const lines = csvOf(serializeSpace(rooms, CONFIGURED)).slice(CSV_BOM.length).split('\r\n');
    expect(lines[0]).toBe('zone,id,title,Amount,first,second');
    expect(lines[1]).toBe('One,a,A,1,true,');
    expect(lines[2]).toBe('Two,b,B,2,,"x, y"');
  });
});

describe('exportWarnings', () => {
  it('is empty when nothing was skipped', () => {
    expect(exportWarnings([room({ slug: 'kitchen' })])).toBe('');
  });

  it('names skipped rooms and items with their reasons', () => {
    const rooms = [
      room({ slug: 'attic', label: 'Attic', parseError: 'YAML parse error: bad' }),
      room({
        slug: 'kitchen',
        label: 'Kitchen',
        needsAttention: [{ id: 'dup', title: 'Duplicate', reason: `duplicate id 'dup'` }],
      }),
    ];
    const text = exportWarnings(rooms);
    expect(text.startsWith('Items and rooms excluded from this export:')).toBe(true);
    expect(text).toContain('Attic (rooms/attic.yaml): room skipped — YAML parse error: bad');
    expect(text).toContain(
      `Kitchen (rooms/kitchen.yaml): 'Duplicate' skipped — duplicate id 'dup'`
    );
  });

  it('names every configured structured cell even when its extra column is wholly omitted', () => {
    const text = exportWarnings(
      [
        room({
          slug: 'lab',
          label: 'Lab',
          items: [
            item({
              id: 'meter',
              title: 'Meter',
              resolvedFieldValues: {
                amount: {
                  state: 'structured',
                  issue: {
                    kind: 'structured',
                    expected: 'number',
                    actual: 'mapping',
                    message: 'expected number, found mapping',
                  },
                },
              },
              extraFields: [{ key: 'receipt', opaque: true, summary: 'Mapping' }],
            }),
          ],
        }),
      ],
      CONFIGURED
    );

    expect(text).toContain("'Meter' field 'amount' omitted — structured value");
    expect(text).toContain("'Meter' key 'receipt' omitted — Mapping");
  });
});

describe('exportSlug', () => {
  it.each([
    ['Maple St House', 'maple-st-house'],
    ['  ', 'inventory'],
    ['ÜbérHaus!', 'b-rhaus'],
  ])('slugs %j to %j', (label, expected) => {
    expect(exportSlug(label)).toBe(expected);
  });
});
