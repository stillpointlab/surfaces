import { describe, expect, it } from 'vitest';

import { parseRoomFile } from './room.js';
import {
  appendItem,
  deleteItem,
  disambiguateItemId,
  patchItem,
  scanRoomShape,
  slugifyItemId,
} from './roomWriter.js';

const KITCHEN = [
  'label: Kitchen',
  'items:',
  '  - id: espresso-machine',
  '    title: Rancilio Silvia',
  '    value: 545',
  '  - id: mugs',
  '    title: Diner mugs',
  '    quantity: 6',
  '',
].join('\n');

describe('scanRoomShape', () => {
  it('classifies a plain block-style file writable with entry spans and ids', () => {
    const scan = scanRoomShape(KITCHEN);
    expect(scan.writable).toBe(true);
    if (!scan.writable) return;
    expect(scan.entryIndent).toBe('  ');
    expect(scan.entries.map((e) => e.id)).toEqual(['espresso-machine', 'mugs']);
  });

  it('handles quoted ids, comments, and nested list continuations', () => {
    const scan = scanRoomShape(
      [
        'items:',
        '  # the good stuff',
        '  - id: "espresso-machine"',
        '    tags:',
        '      - kitchen',
        '      - appliance',
        '    # bought 2019',
        '  - title: First line first',
        '    id: desk',
        '',
      ].join('\n')
    );
    expect(scan.writable).toBe(true);
    if (!scan.writable) return;
    expect(scan.entries.map((e) => e.id)).toEqual(['espresso-machine', 'desk']);
  });

  it('treats a missing items: key as writable (fresh block at EOF)', () => {
    const scan = scanRoomShape('label: Attic\n');
    expect(scan).toMatchObject({ writable: true, itemsLine: null, insertAfter: null });
  });

  it('treats an empty items: key as writable with insertion at the key line', () => {
    const scan = scanRoomShape('items:\n');
    expect(scan.writable).toBe(true);
    if (!scan.writable) return;
    expect(scan.entries).toEqual([]);
    expect(scan.insertAfter).toBe(scan.itemsLine);
  });

  it.each([
    ['flow sequence value', 'items: [a, b]\n', /flow/],
    ['inline scalar value', 'items: nothing\n', /flow/],
    ['inconsistent indent', 'items:\n    - id: a\n      title: A\n  - id: b\n', /indentation/],
    ['second document', 'items:\n  - id: a\n    title: A\n---\nitems: []\n', /documents/],
    ['duplicate items key', 'items:\nitems:\n', /duplicate/],
  ])('marks %s read-only for the whole FILE with a reason', (_name, content, reason) => {
    const scan = scanRoomShape(content);
    expect(scan.writable).toBe(false);
    if (scan.writable) return;
    expect(scan.reason).toMatch(reason);
  });

  it.each([
    ['anchored entry', 'items:\n  - &base\n    id: a\n', /anchors/],
    ['flow-map entry', 'items:\n  - { id: a, title: A }\n', /anchors|flow/],
    ['merge key', 'items:\n  - id: a\n    <<: *base\n', /merge/],
    ['alias value', 'items:\n  - id: a\n    title: *name\n', /anchors|aliases/],
    ['flow-map value', 'items:\n  - id: a\n    receipt: { store: IKEA }\n', /flow maps/],
    ['dash-line alias value', 'items:\n  - title: *name\n    id: a\n', /anchors|aliases/],
  ])('marks %s read-only for that ITEM only (file stays writable)', (_name, content, reason) => {
    const scan = scanRoomShape(content);
    expect(scan.writable).toBe(true);
    if (!scan.writable) return;
    expect(scan.entries[0]?.readOnlyReason).toMatch(reason);
  });

  it('allows flow lists as leaf values (the writer emits those itself)', () => {
    const scan = scanRoomShape('items:\n  - id: a\n    title: A\n    tags: [x, y]\n');
    expect(scan.writable).toBe(true);
    if (!scan.writable) return;
    expect(scan.entries[0].readOnlyReason).toBeUndefined();
  });
});

describe('appendItem', () => {
  it('inserts after the last item, not at EOF, leaving trailing keys untouched', () => {
    const content = [
      'items:',
      '  - id: couch',
      '    title: Couch',
      'label: Living room',
      '# trailing note',
      '',
    ].join('\n');
    const result = appendItem(content, { id: 'lamp', title: 'Arc lamp', value: 120 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(
      [
        'items:',
        '  - id: couch',
        '    title: Couch',
        '  - id: lamp',
        '    title: Arc lamp',
        '    value: 120',
        'label: Living room',
        '# trailing note',
        '',
      ].join('\n')
    );
  });

  it('appends items: plus the block at EOF when the key is absent', () => {
    const result = appendItem('label: Attic\n', { id: 'trunk', title: 'Steamer trunk' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(
      ['label: Attic', 'items:', '  - id: trunk', '    title: Steamer trunk', ''].join('\n')
    );
  });

  it('adds a newline first when the file does not end with one', () => {
    const result = appendItem('label: Attic', { id: 'trunk', title: 'Trunk' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(
      ['label: Attic', 'items:', '  - id: trunk', '    title: Trunk', ''].join('\n')
    );
  });

  it('inserts under an empty items: key', () => {
    const result = appendItem('label: Attic\nitems:\n', { id: 'trunk', title: 'Trunk' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(
      ['label: Attic', 'items:', '  - id: trunk', '    title: Trunk', ''].join('\n')
    );
  });

  it('matches the existing item indent (four spaces) and preserves CRLF', () => {
    const content = 'items:\r\n    - id: a\r\n      title: A\r\n';
    const result = appendItem(content, { id: 'b', title: 'B' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(
      'items:\r\n    - id: a\r\n      title: A\r\n    - id: b\r\n      title: B\r\n'
    );
  });

  it('preserves a BOM and every byte outside the inserted span', () => {
    const content = `\uFEFF${KITCHEN}`;
    const result = appendItem(content, { id: 'kettle', title: 'Kettle' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.startsWith('\uFEFF')).toBe(true);
    const inserted = '  - id: kettle\n    title: Kettle\n';
    expect(result.content).toBe(
      `\uFEFF${KITCHEN}`.replace(
        '  - id: mugs\n    title: Diner mugs\n    quantity: 6\n',
        `  - id: mugs\n    title: Diner mugs\n    quantity: 6\n${inserted}`
      )
    );
  });

  it('keeps comments inside and after the sequence in place', () => {
    const content = [
      'items:',
      '  - id: a',
      '    title: A',
      '    # inline note',
      '',
      '# closing note',
      '',
    ].join('\n');
    const result = appendItem(content, { id: 'b', title: 'B' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(
      [
        'items:',
        '  - id: a',
        '    title: A',
        '    # inline note',
        '  - id: b',
        '    title: B',
        '',
        '# closing note',
        '',
      ].join('\n')
    );
  });

  it('emits the full canonical block: core order, tags flow list, declared fields', () => {
    const result = appendItem('items:\n', {
      id: 'tv',
      title: 'Living room TV: 65"',
      description: 'Wall mounted',
      value: 899.99,
      quantity: 2,
      serial: '0042',
      acquired: '2024-05-01',
      container: 'media wall',
      tags: ['electronics', 'has space'],
      fieldValues: [
        ['condition', 'like new'],
        ['insured', true],
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(
      [
        'items:',
        '  - id: tv',
        '    title: "Living room TV: 65\\""',
        '    description: Wall mounted',
        '    value: 899.99',
        '    quantity: 2',
        '    serial: "0042"',
        '    acquired: 2024-05-01',
        '    container: media wall',
        '    tags: [electronics, has space]',
        '    condition: like new',
        '    insured: true',
        '',
      ].join('\n')
    );
  });

  it('round-trips: the parser sees the appended item, bytes elsewhere identical', () => {
    const result = appendItem(KITCHEN, { id: 'kettle', title: 'Kettle', value: 40 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = parseRoomFile(result.content);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.items.map((i) => i.id)).toEqual(['espresso-machine', 'mugs', 'kettle']);
    // Removing the inserted lines restores the original byte-for-byte.
    expect(result.content.replace('  - id: kettle\n    title: Kettle\n    value: 40\n', '')).toBe(
      KITCHEN
    );
  });

  it('refuses read-only shapes with the scan reason', () => {
    const result = appendItem('items: [a]\n', { id: 'x', title: 'X' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/flow/);
  });

  it('what the writer emits it can always re-scan', () => {
    const result = appendItem('items:\n', {
      id: 'a',
      title: 'Odd: title with "quotes"',
      tags: ['x'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rescan = scanRoomShape(result.content);
    expect(rescan.writable).toBe(true);
    if (!rescan.writable) return;
    expect(rescan.entries.map((e) => e.id)).toEqual(['a']);
  });
});

describe('patchItem', () => {
  it('replaces exactly the touched field line, keeping every other byte', () => {
    const result = patchItem(KITCHEN, 'espresso-machine', { value: 495 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(KITCHEN.replace('    value: 545', '    value: 495'));
  });

  it('patches a field that sits on the `- ` line itself', () => {
    const content = 'items:\n  - title: Old title\n    id: a\n';
    const result = patchItem(content, 'a', { title: 'New title' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe('items:\n  - title: New title\n    id: a\n');
  });

  it('appends an absent field at the end of the item block', () => {
    const result = patchItem(KITCHEN, 'espresso-machine', { serial: 'SN-42' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(
      KITCHEN.replace('    value: 545\n', '    value: 545\n    serial: SN-42\n')
    );
  });

  it('removes a cleared field, and clearing an absent field is a no-op', () => {
    const cleared = patchItem(KITCHEN, 'espresso-machine', { value: null });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.content).toBe(KITCHEN.replace('    value: 545\n', ''));

    const noop = patchItem(KITCHEN, 'espresso-machine', { serial: null });
    expect(noop.ok).toBe(true);
    if (!noop.ok) return;
    expect(noop.content).toBe(KITCHEN);
  });

  it('patches multiple fields in one call (middle item)', () => {
    const result = patchItem(KITCHEN, 'mugs', { quantity: 8, container: 'shelf' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(
      KITCHEN.replace('    quantity: 6\n', '    quantity: 8\n    container: shelf\n')
    );
  });

  it('replaces a multi-line block-scalar value as one span', () => {
    const content = [
      'items:',
      '  - id: a',
      '    description: >-',
      '      first line',
      '      second line',
      '    value: 10',
      '',
    ].join('\n');
    const result = patchItem(content, 'a', { description: 'short now' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(
      ['items:', '  - id: a', '    description: short now', '    value: 10', ''].join('\n')
    );
  });

  it('removes a hand-authored nested-list value with its span', () => {
    const content = [
      'items:',
      '  - id: a',
      '    tags:',
      '      - x',
      '      - y',
      '    value: 10',
      '',
    ].join('\n');
    const result = patchItem(content, 'a', { tags: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(['items:', '  - id: a', '    value: 10', ''].join('\n'));
  });

  it('leaves comments and unknown keys inside the item untouched', () => {
    const content = [
      'items:',
      '  - id: a',
      '    # hand note',
      '    provenance: estate sale',
      '    value: 10',
      '',
    ].join('\n');
    const result = patchItem(content, 'a', { value: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(content.replace('value: 10', 'value: 20'));
  });

  it('reports an unknown id as notFound', () => {
    const result = patchItem(KITCHEN, 'ghost', { value: 1 });
    expect(result).toEqual({ ok: false, notFound: true });
  });

  it('refuses a per-item read-only entry with its reason', () => {
    const content = 'items:\n  - id: a\n    title: *name\n';
    const result = patchItem(content, 'a', { value: 1 });
    expect(result.ok).toBe(false);
    if (result.ok || result.notFound) return;
    expect(result.reason).toMatch(/aliases/);
  });

  it('round-trips: parse(patch(file)) reflects exactly the edits', () => {
    const result = patchItem(KITCHEN, 'mugs', { value: 9, serial: 'M-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = parseRoomFile(result.content);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const mugs = parsed.items.find((i) => i.id === 'mugs');
    expect(mugs).toMatchObject({ value: 9, serial: 'M-1', quantity: 6 });
  });
});

describe('deleteItem', () => {
  it('removes a middle item whole, nothing else', () => {
    const result = deleteItem(KITCHEN, 'espresso-machine');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(
      [
        'label: Kitchen',
        'items:',
        '  - id: mugs',
        '    title: Diner mugs',
        '    quantity: 6',
        '',
      ].join('\n')
    );
  });

  it('removes the last item, leaving trailing content intact', () => {
    const content = [
      'items:',
      '  - id: a',
      '    title: A',
      '  - id: b',
      '    title: B',
      'label: Room',
      '',
    ].join('\n');
    const result = deleteItem(content, 'b');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(
      ['items:', '  - id: a', '    title: A', 'label: Room', ''].join('\n')
    );
  });

  it('leaves items: in place when the deletion empties the sequence', () => {
    const content = 'label: Attic\nitems:\n  - id: only\n    title: Only\n';
    const result = deleteItem(content, 'only');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe('label: Attic\nitems:\n');
    // Still writable and appendable afterwards.
    const rescan = scanRoomShape(result.content);
    expect(rescan.writable).toBe(true);
  });

  it('takes the item-indent comments inside the span along', () => {
    const content = [
      'items:',
      '  - id: a',
      '    title: A',
      '  # note about b',
      '  - id: b',
      '    title: B',
      '',
    ].join('\n');
    // The comment at entry indent belongs to the PRECEDING entry's span.
    const result = deleteItem(content, 'a');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(['items:', '  - id: b', '    title: B', ''].join('\n'));
  });

  it('handles a file ending without a trailing newline', () => {
    const content = 'items:\n  - id: a\n    title: A\n  - id: b\n    title: B';
    const result = deleteItem(content, 'b');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe('items:\n  - id: a\n    title: A');
  });

  it('reports an unknown id as notFound', () => {
    expect(deleteItem(KITCHEN, 'ghost')).toEqual({ ok: false, notFound: true });
  });
});

describe('slugifyItemId / disambiguateItemId', () => {
  it.each([
    ['Rancilio Silvia', 'rancilio-silvia'],
    ['  Éspresso!! Machine  ', 'spresso-machine'],
    ['---', 'item'],
    ['了了了', 'item'],
    ['A'.repeat(100), 'a'.repeat(60)],
  ])('slugs %j to %j', (title, expected) => {
    expect(slugifyItemId(title)).toBe(expected);
  });

  it('disambiguates against the whole taken set', () => {
    const taken = new Set(['couch', 'couch-2']);
    expect(disambiguateItemId('couch', taken)).toBe('couch-3');
    expect(disambiguateItemId('lamp', taken)).toBe('lamp');
  });
});
