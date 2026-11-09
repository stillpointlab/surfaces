// @vitest-environment jsdom
/// <reference lib="dom" />
import { fail, ok } from '@stillpointlab/common-format/app';
import {
  describeAppElementContract,
  expectNoHostileMarkup,
  hostile,
} from '@stillpointlab/common-format/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './inventory-zone.js';
import { ATTRIBUTE_PAYLOADS, CONFIGURED_ZONE, LEGACY_ZONE } from './inventory.fixtures.js';
import { INVENTORY_BASE, linkedEditors, mountInventory } from './inventory.testing.js';

import type { InventoryZone } from './inventory-zone.js';
import type { Answer } from './inventory.testing.js';
import type { SharedInventoryZoneState } from '../types.js';

/** The discriminants the zone switches on, kept intact in hostile states. */
const HOSTILE_EXCEPT = ['mode', 'type', 'state', 'kind', 'id', 'fieldId', 'field', 'multiplyBy'];

const mountZone = (state: SharedInventoryZoneState, answer?: Answer, links?: null) =>
  mountInventory<InventoryZone, SharedInventoryZoneState>(
    'spl-inventory-zone',
    state,
    answer,
    links === null ? { links: null } : {}
  );

const zoneAnswer: Answer = () => ok({ state: CONFIGURED_ZONE });

const rowsOf = (el: HTMLElement): HTMLTableRowElement[] => [
  ...el.querySelectorAll<HTMLTableRowElement>('tr[data-item-id]'),
];
const dialog = (el: HTMLElement): HTMLElement & { isOpen: boolean } =>
  el.querySelector('#inventory-item-dialog') as HTMLElement & { isOpen: boolean };
const form = (el: HTMLElement): HTMLElement => el.querySelector('#inventory-item-form')!;
const footerButton = (el: HTMLElement, id: string): HTMLButtonElement =>
  el.querySelector<HTMLButtonElement>(`#${id}`)!;

afterEach(() => {
  document.body.replaceChildren();
  linkedEditors.clear();
  delete (globalThis as { __hostile?: unknown }).__hostile;
});

describe('<spl-inventory-zone> rendering a legacy zone', () => {
  it('keeps repository text intact and inert in every attribute context', () => {
    const { el } = mountZone(LEGACY_ZONE);

    const rows = rowsOf(el);
    expect(rows).toHaveLength(2);
    const row = rows[0];
    expect(row.dataset.itemId).toBe(ATTRIBUTE_PAYLOADS.itemId);
    expect(row.dataset.filterText).toBe(
      [ATTRIBUTE_PAYLOADS.title, ATTRIBUTE_PAYLOADS.description, ATTRIBUTE_PAYLOADS.serial]
        .join(' ')
        .toLowerCase()
    );
    expect(row.querySelector('.inventory-cell-title')?.childNodes[0]?.textContent?.trim()).toBe(
      ATTRIBUTE_PAYLOADS.title
    );
    expect(row.querySelector('.inventory-row-menu')?.getAttribute('aria-label')).toBe(
      `Edit ${ATTRIBUTE_PAYLOADS.title}`
    );
    expect(row.querySelector('.inventory-item-warning')?.getAttribute('title')).toBe(
      ATTRIBUTE_PAYLOADS.warning
    );
    expect(rows[1].querySelector('.inventory-item-warning')?.getAttribute('title')).toBe(
      ATTRIBUTE_PAYLOADS.readOnly
    );

    const option = el.querySelector<HTMLOptionElement>('#inventory-container-options option');
    expect(option?.value).toBe(ATTRIBUTE_PAYLOADS.container);
    const declaredInput = el.querySelector<HTMLInputElement>('input[data-field-id]');
    expect(declaredInput?.dataset.fieldId).toBe(ATTRIBUTE_PAYLOADS.fieldId);
    expect([...el.querySelectorAll('thead th')].map((cell) => cell.textContent)).toContain(
      ATTRIBUTE_PAYLOADS.fieldLabel
    );

    expect(document.querySelector('[onmouseover], [onerror], [onfocus], [data-extra]')).toBeNull();

    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(form(el).querySelector<HTMLInputElement>('input[name="title"]')?.value).toBe(
      ATTRIBUTE_PAYLOADS.title
    );
    expect(form(el).querySelector<HTMLInputElement>('input[name="serial"]')?.value).toBe(
      ATTRIBUTE_PAYLOADS.serial
    );
    expect(document.querySelector('[onmouseover], [onerror], [onfocus], [data-extra]')).toBeNull();
  });

  it('escapes a manifest currency that is not a three-letter code', () => {
    const state = structuredClone(LEGACY_ZONE);
    if (state.schema.mode === 'legacy') state.schema.manifest.currency = '<b data-currency>x</b>';

    const { el } = mountZone(state);

    expect(el.querySelector('[data-currency]')).toBeNull();
    expect(el.querySelector('.inventory-cell-value')?.textContent).toContain('<b data-currency>');
  });

  it.each([
    ['title', 'living "room"'],
    ['description', 'rare description'],
    ['serial', "sn'42"],
  ])('filters by an attribute-safe %s containing neighbouring quotes', (_field, query) => {
    const { el } = mountZone(LEGACY_ZONE);
    const filter = el.querySelector<HTMLInputElement>('#inventory-filter-input')!;
    filter.value = query;
    filter.dispatchEvent(new Event('input', { bubbles: true }));

    const rows = rowsOf(el);
    expect(rows[0].hidden).toBe(false);
    expect(rows[1].hidden).toBe(true);
  });

  it('links its CSV export through the page', () => {
    const { el } = mountZone(LEGACY_ZONE);

    expect(el.querySelector('a.inventory-download')?.getAttribute('href')).toBe(
      `${INVENTORY_BASE}/export/${encodeURIComponent(LEGACY_ZONE.zone.path)}.csv`
    );
  });

  it('shows the export as disabled without links', () => {
    const { el } = mountZone(LEGACY_ZONE, undefined, null);

    expect(el.querySelector('a.inventory-download')).toBeNull();
    expect(el.querySelector('.inventory-download.is-disabled')).not.toBeNull();
  });

  it('asks the page to check in from its check-in bar', () => {
    const mounted = mountZone({
      ...LEGACY_ZONE,
      dirty: [{ path: LEGACY_ZONE.zone.path, kind: 'zone' }],
    });

    mounted.el.querySelector<HTMLButtonElement>('#inventory-checkin')!.click();

    expect(mounted.requests).toEqual(['checkin-request']);
    expect(mounted.ops).toHaveLength(0);
  });
});

describe('<spl-inventory-zone> quick add and the item dialog', () => {
  it('rejects a blank quick-add title inline without clearing the form or asking', () => {
    const { el, ops } = mountZone(LEGACY_ZONE);
    const quickAdd = el.querySelector<HTMLFormElement>('#inventory-quick-add')!;
    const title = quickAdd.querySelector<HTMLInputElement>('input[name="title"]')!;
    const error = quickAdd.querySelector<HTMLElement>('#inventory-add-error')!;
    title.value = '   ';

    quickAdd.requestSubmit();

    expect(ops).toHaveLength(0);
    expect(title.value).toBe('   ');
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe('Title is required.');
    expect(title.getAttribute('aria-describedby')).toBe('inventory-add-error');
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(title);

    title.value = 'Valid title';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    expect(error.hidden).toBe(true);
    expect(title.hasAttribute('aria-invalid')).toBe(false);
  });

  it('shows a refused add inline', async () => {
    const { el } = mountZone(LEGACY_ZONE, () => fail('VALIDATION_ERROR', 'Title is too long'));
    const quickAdd = el.querySelector<HTMLFormElement>('#inventory-quick-add')!;
    quickAdd.querySelector<HTMLInputElement>('input[name="title"]')!.value = 'Lamp';

    quickAdd.requestSubmit();

    const error = el.querySelector<HTMLElement>('#inventory-add-error')!;
    await vi.waitFor(() => expect(error.hidden).toBe(false));
    expect(error.textContent).toBe('Title is too long');
  });

  it('keeps the edit dialog open when its title is cleared and asks nothing', () => {
    const { el, ops } = mountZone(LEGACY_ZONE);
    rowsOf(el)[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const title = form(el).querySelector<HTMLInputElement>('input[name="title"]')!;
    const error = form(el).querySelector<HTMLElement>('#inventory-item-error')!;
    title.value = '';

    footerButton(el, 'save-inventory-item').click();

    expect(ops).toHaveLength(0);
    expect(dialog(el).isOpen).toBe(true);
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe('Title is required.');
    expect(title.getAttribute('aria-describedby')).toBe('inventory-item-error');
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(title);
    expect(el.querySelector('.inventory-cell-title')?.textContent).toContain(
      ATTRIBUTE_PAYLOADS.title
    );
  });

  it('asks to delete an item only on the second press, then renders the answer', async () => {
    const after = structuredClone(LEGACY_ZONE);
    after.zone.items = after.zone.items.slice(1);
    const mounted = mountZone(LEGACY_ZONE, () => ok({ state: after }));
    rowsOf(mounted.el)[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const del = footerButton(mounted.el, 'delete-inventory-item');

    del.click();
    expect(mounted.ops).toHaveLength(0);
    expect(del.textContent).toBe('Really delete?');
    del.click();

    await vi.waitFor(() => expect(rowsOf(mounted.el)).toHaveLength(1));
    expect(mounted.ops).toEqual([
      { type: 'delete-item', path: LEGACY_ZONE.zone.path, id: ATTRIBUTE_PAYLOADS.itemId },
    ]);
    expect(dialog(mounted.el).isOpen).toBe(false);
    expect(mounted.notifications).toContainEqual({
      message: 'Deleted — local until check-in.',
      type: 'success',
    });
  });

  it('warns and asks the page to reload when the item is gone from the file', async () => {
    const mounted = mountZone(LEGACY_ZONE, () => fail('INVENTORY_ITEM_NOT_FOUND', 'No such item'));
    rowsOf(mounted.el)[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    form(mounted.el).querySelector<HTMLInputElement>('input[name="serial"]')!.value = 'SN-1';

    footerButton(mounted.el, 'save-inventory-item').click();

    await vi.waitFor(() => expect(mounted.requests).toEqual(['reload-request']));
    expect(mounted.notifications).toEqual([
      { message: 'The item no longer exists in the file — reloading.', type: 'warning' },
    ]);
  });

  it('keeps the dialog open and shows the message when a save is refused', async () => {
    const mounted = mountZone(LEGACY_ZONE, () => fail('CONFLICT', 'The file changed upstream'));
    rowsOf(mounted.el)[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    form(mounted.el).querySelector<HTMLInputElement>('input[name="serial"]')!.value = 'SN-1';

    footerButton(mounted.el, 'save-inventory-item').click();

    await vi.waitFor(() =>
      expect(mounted.notifications).toEqual([
        { message: 'The file changed upstream', type: 'error' },
      ])
    );
    expect(dialog(mounted.el).isOpen).toBe(true);
    expect(mounted.requests).toEqual([]);
  });
});

describe('<spl-inventory-zone> opening a file in the editor', () => {
  const readOnly: SharedInventoryZoneState = {
    ...LEGACY_ZONE,
    zone: {
      ...LEGACY_ZONE.zone,
      writable: false,
      readOnlyReason: 'Flow-style items cannot be patched safely.',
    },
  };

  let anchorClick: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => anchorClick.mockRestore());

  it('links a file-level read-only zone through the page and follows the answer', async () => {
    const mounted = mountZone(readOnly, () => ok({ href: '/project/p/digital-goods/dg_zone' }));
    const action = mounted.el.querySelector<HTMLButtonElement>(
      'button[data-action="open-inventory-editor"]'
    )!;
    expect(action.textContent).toBe('Open in editor');

    action.click();

    await vi.waitFor(() => expect(anchorClick).toHaveBeenCalledOnce());
    expect(mounted.ops).toEqual([
      { type: 'link-editor', path: LEGACY_ZONE.zone.path, kind: 'zone' },
    ]);
    const link = mounted.el.querySelector<HTMLAnchorElement>('a.inventory-editor-link')!;
    expect(link.pathname).toBe('/project/p/digital-goods/dg_zone');
  });

  it('renders a plain link when the page already knows the editor', () => {
    linkedEditors.set(LEGACY_ZONE.zone.path, '/project/p/digital-goods/dg_known');

    const { el } = mountZone(readOnly);

    expect(el.querySelector('button[data-action="open-inventory-editor"]')).toBeNull();
    expect(el.querySelector('a.inventory-editor-link')?.getAttribute('href')).toBe(
      '/project/p/digital-goods/dg_known'
    );
  });

  it('offers the same recovery inside a read-only item dialog', async () => {
    const mounted = mountZone(LEGACY_ZONE, () => ok({ href: '/project/p/digital-goods/dg_item' }));
    rowsOf(mounted.el)
      .find((row) => row.dataset.itemId === 'locked-item')!
      .click();

    form(mounted.el)
      .querySelector<HTMLButtonElement>('button[data-action="open-inventory-editor"]')!
      .click();

    await vi.waitFor(() => expect(anchorClick).toHaveBeenCalledOnce());
    expect(mounted.ops).toEqual([
      { type: 'link-editor', path: LEGACY_ZONE.zone.path, kind: 'zone' },
    ]);
    expect(
      form(mounted.el).querySelector<HTMLAnchorElement>('a.inventory-editor-link')!.pathname
    ).toBe('/project/p/digital-goods/dg_item');
  });

  it('keeps a failed recovery available and shows the failure', async () => {
    const mounted = mountZone(readOnly, () => fail('API_ERROR', 'Linking failed'));
    const action = mounted.el.querySelector<HTMLButtonElement>(
      'button[data-action="open-inventory-editor"]'
    )!;

    action.click();

    await vi.waitFor(() => expect(action.disabled).toBe(false));
    expect(action.textContent).toBe('Open in editor');
    expect(action.hasAttribute('aria-busy')).toBe(false);
    expect(mounted.notifications).toEqual([{ message: 'Linking failed', type: 'error' }]);
    expect(anchorClick).not.toHaveBeenCalled();
  });
});

describe('<spl-inventory-zone> rendering and editing a configured zone', () => {
  it('derives table order, formatting, raw search, total, and Other data from the schema', () => {
    const { el } = mountZone(CONFIGURED_ZONE);

    expect([...el.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual([
      'Title',
      'Owner',
      'Replacement value',
      'Other data',
      '',
    ]);
    const rows = rowsOf(el);
    expect(rows[0].textContent).toContain('$12.35');
    expect(rows[0].textContent).not.toContain('classified');
    expect(el.querySelector('.inventory-totals')?.textContent).toContain(
      'Total Replacement value $24.69'
    );
    expect(el.querySelector('.inventory-table-wrap')).not.toBeNull();

    const other = rows[0].querySelector<HTMLButtonElement>('[data-action="show-other-data"]')!;
    expect(other.textContent).toBe('4');
    expect(other.getAttribute('aria-label')).toBe('Show 4 other values for Lathe');
    expect(rows[1].querySelector('[data-action="show-other-data"]')).toBeNull();

    const filter = el.querySelector<HTMLInputElement>('#inventory-filter-input')!;
    const search = (value: string): void => {
      filter.value = value;
      filter.dispatchEvent(new Event('input', { bubbles: true }));
    };
    search('12.345');
    expect(rows[0].hidden).toBe(false);
    expect(rows[1].hidden).toBe(true);
    search('$12.35');
    expect(rows.every((row) => row.hidden)).toBe(true);
    search('classified');
    expect(rows.every((row) => row.hidden)).toBe(true);
  });

  it('renders only add-visible fields and asks to add raw configured values', async () => {
    const mounted = mountZone(CONFIGURED_ZONE, zoneAnswer);
    const quickAdd = mounted.el.querySelector<HTMLFormElement>('#inventory-quick-add')!;
    const fields = [...quickAdd.querySelectorAll<HTMLInputElement>('input[data-field-id]')];

    expect(fields.map((input) => input.dataset.fieldId)).toEqual(['owner', 'amount', 'quantity']);
    expect(fields[0].required).toBe(true);
    expect(fields[1].type).toBe('number');
    expect(fields[1].step).toBe('any');
    expect(fields[1].closest('label')?.textContent).toContain('(USD)');

    quickAdd.querySelector<HTMLInputElement>('input[name="title"]')!.value = 'Planer';
    fields[0].value = 'Jamie';
    fields[1].value = '12.345';
    fields[2].value = '-2';
    quickAdd.requestSubmit();

    await vi.waitFor(() => expect(mounted.ops).toHaveLength(1));
    expect(mounted.ops[0]).toEqual({
      type: 'add-item',
      path: CONFIGURED_ZONE.zone.path,
      item: { title: 'Planer', fieldValues: { owner: 'Jamie', amount: 12.345, quantity: -2 } },
    });
    await vi.waitFor(() =>
      expect(mounted.notifications).toContainEqual({
        message: 'Added “Planer” — local until check-in.',
        type: 'success',
      })
    );
  });

  it('focuses Other data and adds, edits, and removes supported scalars', async () => {
    const mounted = mountZone(CONFIGURED_ZONE, zoneAnswer);
    const { el } = mounted;

    el.querySelector<HTMLButtonElement>(
      '[data-action="show-other-data"][data-item-id="lathe"]'
    )!.click();
    await Promise.resolve();
    const host = form(el);
    expect(document.activeElement).toBe(host.querySelector('#inventory-other-data-heading'));
    expect(host.querySelector('[data-extra-key="location"]')).not.toBeNull();
    expect(host.querySelector('[data-extra-key="labels"]')).toBeNull();
    expect(host.textContent).toContain('heavy, powered');
    expect(host.textContent).toContain('Mapping');

    host.querySelector<HTMLInputElement>(
      '[data-extra-key="location"] .inventory-extra-value'
    )!.value = 'shelf';
    host
      .querySelector<HTMLButtonElement>('[data-extra-key="warranty"] [data-action="remove-extra"]')!
      .click();

    host.querySelector<HTMLButtonElement>('#inventory-add-extra')!.click();
    const newRow = host.querySelector<HTMLElement>('[data-new-extra="true"]')!;
    newRow.querySelector<HTMLInputElement>('[data-extra-key-input]')!.value = 'count';
    const type = newRow.querySelector<HTMLSelectElement>('[data-extra-type-select]')!;
    type.value = 'number';
    type.dispatchEvent(new Event('change', { bubbles: true }));
    newRow.querySelector<HTMLInputElement>('.inventory-extra-value')!.value = '3';

    footerButton(el, 'save-inventory-item').click();

    await vi.waitFor(() => expect(mounted.ops).toHaveLength(1));
    expect(mounted.ops[0]).toEqual({
      type: 'update-item',
      path: CONFIGURED_ZONE.zone.path,
      id: 'lathe',
      changes: { extraValues: { location: 'shelf', warranty: null, count: 3 } },
    });
  });

  it('shows a raw mismatched scalar and sends only an explicit valid repair', async () => {
    const mounted = mountZone(CONFIGURED_ZONE, zoneAnswer);

    mounted.el
      .querySelector<HTMLButtonElement>('[data-action="edit-item"][data-item-id="spare"]')!
      .click();
    const host = form(mounted.el);
    expect(host.textContent).toContain('Current raw value:');
    expect(host.textContent).toContain('wrong');
    expect(host.textContent).toContain('expected number, found text');
    const amount = host.querySelector<HTMLInputElement>('input[data-field-id="amount"]')!;
    expect(amount.value).toBe('');
    amount.value = '5';

    footerButton(mounted.el, 'save-inventory-item').click();

    await vi.waitFor(() => expect(mounted.ops).toHaveLength(1));
    expect(mounted.ops[0]).toMatchObject({ changes: { fieldValues: { amount: 5 } } });
  });

  it('requires an explicit action before replacing a structured configured value', async () => {
    const state = structuredClone(CONFIGURED_ZONE);
    state.zone.items[0].resolvedFieldValues!.amount = {
      state: 'structured',
      issue: {
        kind: 'structured',
        expected: 'number',
        actual: 'mapping',
        message: 'expected number, found mapping',
      },
    };
    delete state.zone.items[0].fieldValues.amount;
    const mounted = mountZone(state, () => ok({ state }));

    mounted.el
      .querySelector<HTMLButtonElement>('[data-action="edit-item"][data-item-id="lathe"]')!
      .click();
    const host = form(mounted.el);
    const input = host.querySelector<HTMLInputElement>('input[data-field-id="amount"]')!;
    expect(input.disabled).toBe(true);
    expect(input.hidden).toBe(true);
    host.querySelector<HTMLButtonElement>('[data-action="replace-structured"]')!.click();
    expect(input.disabled).toBe(false);
    expect(input.hidden).toBe(false);
    input.value = '9.5';

    footerButton(mounted.el, 'save-inventory-item').click();

    await vi.waitFor(() => expect(mounted.ops).toHaveLength(1));
    expect(mounted.ops[0]).toMatchObject({ changes: { fieldValues: { amount: 9.5 } } });
  });

  it('supports an id/title-only table and count-only summaries without invented defaults', () => {
    const state: SharedInventoryZoneState = {
      ...CONFIGURED_ZONE,
      schema: { mode: 'configured', manifest: { version: 2, label: 'Simple', fields: [] } },
      zone: {
        ...CONFIGURED_ZONE.zone,
        items: [
          {
            id: 'only',
            title: 'Only item',
            quantity: 1,
            fieldValues: {},
            resolvedFieldValues: {},
            extraFields: [],
          },
        ],
        totals: { itemCount: 1 },
      },
    };
    const { el } = mountZone(state);

    expect([...el.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual([
      'Title',
      '',
    ]);
    expect(el.querySelectorAll('#inventory-quick-add input')).toHaveLength(1);
    const shown = [...el.children]
      .filter((child) => child.localName !== 'style')
      .map((child) => child.textContent)
      .join(' ');
    expect(shown).not.toContain('Value');
    expect(shown).not.toContain('Quantity');
    expect(shown).not.toContain('unvalued');
    expect(el.querySelector('.inventory-totals')?.textContent?.trim()).toContain('1 item');
  });

  it('renders invalid-v2 neutral recovery read-only while keeping manifest check-in', () => {
    const state: SharedInventoryZoneState = {
      ...CONFIGURED_ZONE,
      schema: {
        mode: 'invalid',
        declaredVersion: 2,
        errors: ['fields.0.type: Invalid option'],
      },
      zone: {
        ...CONFIGURED_ZONE.zone,
        items: [
          {
            id: 'lathe',
            title: 'Lathe',
            quantity: 1,
            fieldValues: {},
            resolvedFieldValues: {},
            extraFields: [{ key: 'amount', value: 12.345 }],
          },
        ],
        totals: { itemCount: 1 },
      },
      dirty: [{ path: 'inventory/inventory.yaml', kind: 'manifest' }],
    };
    const { el } = mountZone(state);

    expect(el.textContent).toContain('inventory changes and exports are disabled');
    expect(el.textContent).toContain('fields.0.type');
    expect(el.querySelector('#inventory-quick-add')).toBeNull();
    expect(el.querySelector('#inventory-filter-input')).toBeNull();
    expect(el.querySelector('a.inventory-download')).toBeNull();
    expect(el.querySelector('table')?.textContent).not.toContain('Replacement value');
    expect(el.querySelector('#inventory-checkin')).not.toBeNull();

    el.querySelector<HTMLButtonElement>('[data-action="edit-item"]')!.click();
    expect(footerButton(el, 'save-inventory-item').disabled).toBe(true);
    expect(footerButton(el, 'delete-inventory-item').disabled).toBe(true);
    expect(form(el).textContent).toContain('Open inventory.yaml in editor');
  });
});

describe('<spl-inventory-zone> with hostile repository text', () => {
  it.each([
    ['legacy', LEGACY_ZONE],
    ['configured', CONFIGURED_ZONE],
  ])('renders a %s zone and its item dialog as text', (_mode, state) => {
    const { el } = mountZone(hostile(state, { except: HOSTILE_EXCEPT }));

    expectNoHostileMarkup(el);
    for (const row of rowsOf(el)) {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expectNoHostileMarkup(el);
    }
  });

  it('renders a read-only zone with a parse error as text', () => {
    const state = hostile(
      {
        ...LEGACY_ZONE,
        warnings: ['A warning'],
        zone: {
          ...LEGACY_ZONE.zone,
          writable: false,
          readOnlyReason: 'Read only',
          needsAttention: [{ id: 'x', title: 'Needs it', reason: 'Because' }],
        },
      },
      { except: HOSTILE_EXCEPT }
    );
    const broken = hostile(
      { ...LEGACY_ZONE, zone: { ...LEGACY_ZONE.zone, parseError: 'Bad YAML' } },
      { except: HOSTILE_EXCEPT }
    );

    expectNoHostileMarkup(mountZone(state).el);
    expectNoHostileMarkup(mountZone(broken).el);
  });
});

describeAppElementContract<SharedInventoryZoneState, InventoryZone>('spl-inventory-zone', {
  state: CONFIGURED_ZONE,
  trigger: (el) => {
    const quickAdd = el.querySelector<HTMLFormElement>('#inventory-quick-add')!;
    quickAdd.querySelector<HTMLInputElement>('input[name="title"]')!.value = 'Planer';
    quickAdd.querySelector<HTMLInputElement>('input[data-field-id="owner"]')!.value = 'Jamie';
    quickAdd.requestSubmit();
  },
});
