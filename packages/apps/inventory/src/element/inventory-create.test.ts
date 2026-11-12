// @vitest-environment jsdom
/// <reference lib="dom" />
import { answerOps, fail, ok } from '@stillpointlab/common-format/app';
import {
  describeAppElementContract,
  expectNoHostileMarkup,
  HOSTILE_PAYLOAD,
  mount,
} from '@stillpointlab/common-format/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CREATE_VALIDITY_EVENT } from './inventory-create.js';

import type { InventoryCreate, InventoryCreateOps } from './inventory-create.js';
import type { AppOp, Result } from '@stillpointlab/common-format/app';

const byId = <T extends HTMLElement = HTMLInputElement>(id: string): T =>
  document.getElementById(id) as T;
const setInput = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const setSelect = (select: HTMLSelectElement, value: string): void => {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
};
const zoneInputs = (): HTMLInputElement[] => [
  ...document.querySelectorAll<HTMLInputElement>('[data-zone-title]'),
];
const columnRows = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('.create-inventory-column-row'),
];
const columnTitle = (index: number): HTMLInputElement =>
  columnRows()[index].querySelector<HTMLInputElement>('[data-column-title]')!;
const columnType = (index: number): HTMLSelectElement =>
  columnRows()[index].querySelector<HTMLSelectElement>('[data-column-type]')!;
const errorLine = (): HTMLElement => byId('create-inventory-error');

async function mountForm(state = {}): Promise<InventoryCreate> {
  const el = mount<InventoryCreate>('spl-inventory-create');
  el.setState(state);
  await el.whenReady();
  return el;
}

/** Answer the form's op with `answer`, recording the ops it asked. */
function host(
  el: HTMLElement,
  answer: () => Result<object> | Promise<Result<object>> = () => ok()
) {
  const ops: AppOp<InventoryCreateOps>[] = [];
  const stop = answerOps<InventoryCreateOps>(el, (op) => {
    ops.push(op);
    return answer();
  });
  return { ops, stop };
}

describeAppElementContract<object, InventoryCreate>('spl-inventory-create', {
  state: {},
  trigger: async (el) => {
    setInput(el.querySelector<HTMLInputElement>('#create-inventory-label')!, 'Home');
    await el.submit();
  },
});

describe('<spl-inventory-create>', () => {
  afterEach(() => document.body.replaceChildren());

  it('starts with one zone row, one column row, and the conditional controls hidden', async () => {
    await mountForm();
    expect(byId('create-inventory-label').value).toBe('');
    expect(zoneInputs()).toHaveLength(1);
    expect(columnRows()).toHaveLength(1);
    expect(byId('create-inventory-currency').value).toBe('USD');
    expect(byId('create-inventory-currency-field').hidden).toBe(true);
    expect(byId<HTMLSelectElement>('create-inventory-total').value).toBe('');
    expect(byId('create-inventory-multiply-field').hidden).toBe(true);
    expect(errorLine().hidden).toBe(true);
  });

  it('starts from the state it is given, and starts over on the next', async () => {
    const el = await mountForm({ label: 'Home', zones: ['Kitchen', 'Garage'] });
    expect(byId('create-inventory-label').value).toBe('Home');
    expect(zoneInputs().map((input) => input.value)).toEqual(['Kitchen', 'Garage']);
    el.setState({});
    await el.whenReady();
    expect(byId('create-inventory-label').value).toBe('');
    expect(zoneInputs()).toHaveLength(1);
  });

  it('asks to create with configured columns, a total, and zones', async () => {
    const el = await mountForm();
    const { ops } = host(el);

    setInput(byId('create-inventory-label'), '  Maple Street House  ');
    setInput(zoneInputs()[0], 'Kitchen');
    byId('create-inventory-add-zone').click();
    setInput(zoneInputs()[1], 'Garage');
    setInput(columnTitle(0), 'Owner');
    byId('create-inventory-add-column').click();
    setInput(columnTitle(1), 'Replacement value');
    setSelect(columnType(1), 'currency');
    byId('create-inventory-add-column').click();
    setInput(columnTitle(2), 'Quantity');
    setSelect(columnType(2), 'number');

    expect(byId('create-inventory-currency-field').hidden).toBe(false);
    setInput(byId('create-inventory-currency'), 'cad');
    setSelect(byId<HTMLSelectElement>('create-inventory-total'), 'replacement-value');
    expect(byId('create-inventory-multiply-field').hidden).toBe(false);
    expect(
      [...byId<HTMLSelectElement>('create-inventory-multiply').options].map((o) => o.text)
    ).toEqual(['None', 'Quantity']);
    setSelect(byId<HTMLSelectElement>('create-inventory-multiply'), 'quantity');

    await expect(el.submit()).resolves.toEqual({ ok: true });
    expect(ops).toEqual([
      {
        type: 'create',
        input: {
          label: 'Maple Street House',
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
          zones: ['Kitchen', 'Garage'],
        },
      },
    ]);
  });

  it('leaves blank columns and zones out entirely', async () => {
    const el = await mountForm();
    setInput(byId('create-inventory-label'), 'Home');
    expect(el.value()).toEqual({ ok: true, input: { label: 'Home' } });
  });

  it('shows derived ids and the first problem on submit, asking nothing', async () => {
    const el = await mountForm();
    const { ops } = host(el);

    await el.submit();
    expect(errorLine().textContent).toBe('Give the inventory a name.');
    expect(byId('create-inventory-label').getAttribute('aria-invalid')).toBe('true');

    setInput(byId('create-inventory-label'), 'Home');
    setInput(columnTitle(0), 'Id');
    expect(columnRows()[0].querySelector('[data-column-id]')!.textContent).toBe('id');
    await el.submit();
    expect(errorLine().textContent).toContain('reserved id “id”');
    expect(byId('create-inventory-label').hasAttribute('aria-invalid')).toBe(false);
    expect(columnTitle(0).getAttribute('aria-invalid')).toBe('true');

    setInput(columnTitle(0), 'Purchase Price');
    byId('create-inventory-add-column').click();
    setInput(columnTitle(1), 'purchase-price!');
    await el.submit();
    expect(errorLine().textContent).toContain('field id “purchase-price”');

    setInput(columnTitle(1), 'Owner');
    setSelect(columnType(1), 'currency');
    setInput(byId('create-inventory-currency'), 'US');
    await el.submit();
    expect(errorLine().textContent).toContain('three-letter code');

    expect(ops).toHaveLength(0);
  });

  it('refuses two zones that would name one file', async () => {
    const el = await mountForm();
    setInput(byId('create-inventory-label'), 'Home');
    setInput(zoneInputs()[0], 'Front Room');
    byId('create-inventory-add-zone').click();
    setInput(zoneInputs()[1], 'front-room!');
    await el.submit();
    expect(errorLine().textContent).toBe('Two zones would both be saved as “front-room.yaml”.');
    expect(zoneInputs()[1].getAttribute('aria-invalid')).toBe('true');
  });

  it("shows its host's refusal and keeps its fields", async () => {
    const el = await mountForm();
    host(el, () => fail('INVENTORY_PATH_EXISTS', '“inventory/inventory.yaml” already exists'));
    setInput(byId('create-inventory-label'), 'Home');

    await expect(el.submit()).resolves.toMatchObject({ ok: false });
    expect(errorLine().hidden).toBe(false);
    expect(errorLine().textContent).toBe('“inventory/inventory.yaml” already exists');
    expect(byId('create-inventory-label').value).toBe('Home');

    el.clearError();
    expect(errorLine().hidden).toBe(true);
  });

  it('asks once while a create is out', async () => {
    const el = await mountForm();
    let release: () => void = () => {};
    const { ops } = host(el, () => {
      return new Promise<Result<object>>((resolve) => (release = () => resolve(ok())));
    });
    setInput(byId('create-inventory-label'), 'Home');
    const first = el.submit();
    const second = el.submit();
    release();
    await Promise.all([first, second]);
    expect(ops).toHaveLength(1);
  });

  it('submits on Enter in a text field', async () => {
    const el = await mountForm();
    const { ops } = host(el);
    const label = byId('create-inventory-label');
    setInput(label, 'Home');
    label.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(ops).toHaveLength(1));
  });

  it('removes rows, keeping one of each', async () => {
    await mountForm();
    byId('create-inventory-add-zone').click();
    expect(zoneInputs()).toHaveLength(2);
    for (const button of document.querySelectorAll<HTMLElement>(
      '#create-inventory-zones [data-action="remove-row"]'
    )) {
      button.click();
    }
    expect(zoneInputs()).toHaveLength(1);
    columnRows()[0].querySelector<HTMLElement>('[data-action="remove-row"]')!.click();
    expect(columnRows()).toHaveLength(1);
  });

  it('tells its host when its validity changes', async () => {
    const el = await mountForm();
    const seen: boolean[] = [];
    el.addEventListener(CREATE_VALIDITY_EVENT, (event) =>
      seen.push((event as CustomEvent<{ valid: boolean }>).detail.valid)
    );
    setInput(byId('create-inventory-label'), 'H');
    setInput(byId('create-inventory-label'), 'Ho');
    setInput(byId('create-inventory-label'), '');
    expect(seen).toEqual([true, false]);
  });

  it('renders hostile starting values as text', async () => {
    await mountForm({ label: HOSTILE_PAYLOAD, zones: [HOSTILE_PAYLOAD] });
    expectNoHostileMarkup(document.body);
    expect(byId('create-inventory-label').value).toBe(HOSTILE_PAYLOAD);
  });
});
