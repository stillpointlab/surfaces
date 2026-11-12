/// <reference lib="dom" />
/**
 * `<spl-inventory-create>`: the inventory's own fields for a create (spec
 * create-from-the-app): its name, its first zones and its initial columns,
 * with a total. The host lays it out in its create dialog beside the folder,
 * which every app has, and answers its one op, `create`, by creating the
 * inventory in that folder.
 *
 * The checks are `checkInventoryCreate` (`./create`), which the core's plan
 * runs too. The form shows the first problem on submit, and any refusal its
 * host hands back, in its error line.
 */
import { createReadyGate, fail, ok, requestOp } from '@stillpointlab/common-format/app';
import { defineElement } from '@stillpointlab/common-format/elements';
import { html, render } from '@stillpointlab/common-format/html';

import {
  checkInventoryCreate,
  INVENTORY_DEFAULT_CURRENCY,
  INVENTORY_FIELD_LABEL_MAX_LENGTH,
  INVENTORY_LABEL_MAX_LENGTH,
  INVENTORY_ZONE_TITLE_MAX_LENGTH,
  slugifyInventoryName,
} from '../createRules.js';

import { createStyles } from './create.styles';

import type { InventoryCreateField, InventoryCreateFields } from '../createRules.js';
import type { AppElement, Failure, Result } from '@stillpointlab/common-format/app';
import type { SafeHtml } from '@stillpointlab/common-format/html';

/** What the form starts with. `{}` is an empty form: no name, one blank zone and column. */
export interface InventoryCreateState {
  label?: string;
  zones?: string[];
}

/** The form's op: create an inventory with these fields, in the host's folder. */
export type InventoryCreateOps = {
  create: { op: { input: InventoryCreateFields }; reply: object };
};

/** Raised (bubbling) when the form's fields go from valid to invalid or back. */
export const CREATE_VALIDITY_EVENT = 'create-validity';

type ColumnType = 'text' | 'number' | 'currency';

const zoneRow = (placeholder: string, title = ''): SafeHtml =>
  html`<div class="create-inventory-row"><input type="text" class="form-input" data-zone-title placeholder="${placeholder}" maxlength="${INVENTORY_ZONE_TITLE_MAX_LENGTH}" autocomplete="off" value="${title}" /><button type="button" class="create-inventory-remove" data-action="remove-row" aria-label="Remove zone">×</button></div>`;

const columnRow = (): SafeHtml =>
  html`<div class="create-inventory-row create-inventory-column-row"><label><span class="sr-only">Column title</span><input type="text" class="form-input" data-column-title placeholder="Column title" maxlength="${INVENTORY_FIELD_LABEL_MAX_LENGTH}" autocomplete="off" /></label><label><span class="sr-only">Type</span><select class="form-input" data-column-type><option value="text">Text</option><option value="number">Number</option><option value="currency">Currency</option></select></label><code class="create-inventory-column-id" data-column-id aria-live="polite"></code><button type="button" class="create-inventory-remove" data-action="remove-row" aria-label="Remove column">×</button></div>`;

/** Append one row built by `html` to a list. */
function appendRow(list: HTMLElement, row: SafeHtml): HTMLElement {
  const holder = document.createElement('div');
  render(holder, row);
  const element = holder.firstElementChild as HTMLElement;
  list.appendChild(element);
  return element;
}

const option = (id: string, label: string): SafeHtml =>
  html`<option value="${id}">${label}</option>`;

export class InventoryCreate extends HTMLElement implements AppElement<InventoryCreateState> {
  private state: InventoryCreateState | undefined = undefined;
  private readonly ready = createReadyGate(this);
  private valid: boolean | null = null;
  private pending: Promise<Result> | null = null;

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  /** Start the form over with these values. */
  setState(state: InventoryCreateState): void {
    this.state = state;
    this.paint();
  }

  connectedCallback(): void {
    this.addEventListener('click', this.handleClick);
    this.addEventListener('input', this.handleEdit);
    this.addEventListener('change', this.handleEdit);
    this.addEventListener('keydown', this.handleKeydown);
    this.paint();
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.handleClick);
    this.removeEventListener('input', this.handleEdit);
    this.removeEventListener('change', this.handleEdit);
    this.removeEventListener('keydown', this.handleKeydown);
    this.ready.begin();
  }

  /** Focus the first field. */
  override focus(): void {
    this.find('#create-inventory-label')?.focus();
  }

  /** The fields as a create's input, or the first problem with them. */
  value(): Result<{ input: InventoryCreateFields }> {
    const label = this.find<HTMLInputElement>('#create-inventory-label');
    if (!label) return fail('INVENTORY_CREATE_NOT_READY', 'The form has not rendered yet.');
    const columns = this.columns();
    const fields = columns.map(({ uiType: _uiType, ...field }) => field);
    const totalField = this.find<HTMLSelectElement>('#create-inventory-total')?.value ?? '';
    const multiplyBy = this.find<HTMLSelectElement>('#create-inventory-multiply')?.value ?? '';
    const zones = [...this.querySelectorAll<HTMLInputElement>('[data-zone-title]')]
      .map((input) => input.value.trim())
      .filter(Boolean);
    const input: InventoryCreateFields = {
      label: label.value.trim(),
      ...(fields.length > 0 ? { fields } : {}),
      ...(totalField !== ''
        ? { total: { field: totalField, ...(multiplyBy !== '' ? { multiplyBy } : {}) } }
        : {}),
      ...(zones.length > 0 ? { zones } : {}),
    };
    const checked = checkInventoryCreate(input);
    return checked.ok ? ok({ input }) : checked;
  }

  /**
   * Show a refusal in the form's error line, marking the field it names
   * (`details[0]`, as `checkInventoryCreate` gives it), if any.
   */
  showError(failure: Failure): void {
    this.clearError();
    const error = this.find('#create-inventory-error');
    if (error) {
      error.textContent = failure.message;
      error.hidden = false;
    }
    const field = this.fieldOf(failure.details?.[0]);
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
  }

  /** Hide the error line and unmark the fields. */
  clearError(): void {
    const error = this.find('#create-inventory-error');
    if (error) {
      error.hidden = true;
      error.textContent = '';
    }
    for (const marked of this.querySelectorAll('[aria-invalid]')) {
      marked.removeAttribute('aria-invalid');
    }
  }

  /**
   * Ask the host to create: the first problem shows instead when the fields
   * are not valid, and a refusal shows when the host answers one. A second
   * submit while one is out answers the first's result.
   */
  submit(): Promise<Result> {
    if (this.pending) return this.pending;
    const value = this.value();
    if (!value.ok) {
      this.showError(value);
      return Promise.resolve(value);
    }
    this.clearError();
    this.pending = requestOp<InventoryCreateOps, 'create'>(this, {
      type: 'create',
      input: value.input,
    }).then((reply) => {
      this.pending = null;
      if (!reply.ok) this.showError(reply);
      return reply;
    });
    return this.pending;
  }

  private find<T extends HTMLElement = HTMLElement>(selector: string): T | null {
    return this.querySelector<T>(selector);
  }

  private paint(): void {
    if (!this.isConnected || this.state === undefined) return;
    const { label = '', zones = [] } = this.state;
    render(
      this,
      html`<div class="form-field"><label class="form-label" for="create-inventory-label">Inventory name</label><input type="text" id="create-inventory-label" class="form-input" maxlength="${INVENTORY_LABEL_MAX_LENGTH}" placeholder="Maple Street House" autocomplete="off" value="${label}" /></div>
<div class="form-field"><span class="form-label">Zones</span><div class="create-inventory-list" id="create-inventory-zones">${zones.length > 0 ? zones.map((zone) => zoneRow('Kitchen', zone)) : zoneRow('Kitchen')}</div><button type="button" class="button button-secondary" id="create-inventory-add-zone">Add another zone</button></div>
<div class="form-field"><span class="form-label">Initial columns</span><div class="create-inventory-list" id="create-inventory-columns">${columnRow()}</div><button type="button" class="button button-secondary" id="create-inventory-add-column">Add another column</button><p class="form-help">Blank rows are ignored. Id and Title are always included.</p></div>
<div class="form-field" id="create-inventory-currency-field" hidden><label class="form-label" for="create-inventory-currency">Currency code</label><input type="text" id="create-inventory-currency" class="form-input create-inventory-currency-input" maxlength="3" required placeholder="USD" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${INVENTORY_DEFAULT_CURRENCY}" /><p class="form-help">Applied to every Currency column. Values remain raw numbers.</p></div>
<div class="form-field"><label class="form-label" for="create-inventory-total">Total</label><select class="form-input" id="create-inventory-total"><option value="">None</option></select></div>
<div class="form-field" id="create-inventory-multiply-field" hidden><label class="form-label" for="create-inventory-multiply">Multiply by</label><select class="form-input" id="create-inventory-multiply"><option value="">None</option></select></div>
<p class="form-message error" id="create-inventory-error" role="alert" hidden></p>`
    );
    const style = document.createElement('style');
    style.textContent = createStyles;
    this.prepend(style);
    this.pending = null;
    this.valid = null;
    this.refreshControls();
    this.ready.settle();
  }

  /** The column rows with a title, as fields; blank rows are ignored. */
  private columns(): (NonNullable<InventoryCreateFields['fields']>[number] & {
    uiType: ColumnType;
  })[] {
    const currency = (this.find<HTMLInputElement>('#create-inventory-currency')?.value ?? '')
      .trim()
      .toUpperCase();
    return [...this.querySelectorAll<HTMLElement>('.create-inventory-column-row')].flatMap(
      (row) => {
        const label =
          row.querySelector<HTMLInputElement>('[data-column-title]')?.value.trim() ?? '';
        if (label === '') return [];
        const uiType = (row.querySelector<HTMLSelectElement>('[data-column-type]')?.value ??
          'text') as ColumnType;
        return [
          {
            id: slugifyInventoryName(label),
            label,
            type: uiType === 'text' ? ('text' as const) : ('number' as const),
            uiType,
            ...(uiType === 'currency'
              ? { format: { kind: 'currency' as const, currency, decimalPlaces: 2 } }
              : {}),
          },
        ];
      }
    );
  }

  /** The id hints, the currency field, and the total and multiplier choices. */
  private refreshControls(): void {
    for (const row of this.querySelectorAll<HTMLElement>('.create-inventory-column-row')) {
      const title = row.querySelector<HTMLInputElement>('[data-column-title]')?.value.trim() ?? '';
      const hint = row.querySelector<HTMLElement>('[data-column-id]');
      if (hint) hint.textContent = title === '' ? '' : slugifyInventoryName(title);
    }
    const columns = this.columns();
    const currencyField = this.find('#create-inventory-currency-field');
    if (currencyField) currencyField.hidden = !columns.some((c) => c.uiType === 'currency');

    const total = this.find<HTMLSelectElement>('#create-inventory-total');
    const multiplyField = this.find('#create-inventory-multiply-field');
    const multiply = this.find<HTMLSelectElement>('#create-inventory-multiply');
    if (!total || !multiplyField || !multiply) return;
    const numeric = columns.filter((column) => column.type === 'number');
    const oldTotal = total.value;
    render(total, html`<option value="">None</option>${numeric.map((c) => option(c.id, c.label))}`);
    total.value = numeric.some((column) => column.id === oldTotal) ? oldTotal : '';
    multiplyField.hidden = total.value === '';
    const oldMultiplier = multiply.value;
    const multipliers = numeric.filter((column) => column.id !== total.value);
    render(
      multiply,
      html`<option value="">None</option>${multipliers.map((c) => option(c.id, c.label))}`
    );
    multiply.value = multipliers.some((column) => column.id === oldMultiplier) ? oldMultiplier : '';
  }

  /** Tell the host when the fields' validity changes. */
  private announceValidity(): void {
    const valid = this.value().ok;
    if (valid === this.valid) return;
    this.valid = valid;
    this.dispatchEvent(
      new CustomEvent(CREATE_VALIDITY_EVENT, { detail: { valid }, bubbles: true, composed: true })
    );
  }

  private fieldOf(where: unknown): HTMLElement | null {
    if (typeof where !== 'object' || where === null || !('field' in where)) return null;
    const { field, index } = where as InventoryCreateField & { index?: number };
    switch (field) {
      case 'label':
        return this.find('#create-inventory-label');
      case 'currency':
        return this.find('#create-inventory-currency');
      case 'total':
        return this.find('#create-inventory-total');
      case 'multiplyBy':
        return this.find('#create-inventory-multiply');
      case 'zones': {
        const zones = [...this.querySelectorAll<HTMLInputElement>('[data-zone-title]')].filter(
          (input) => input.value.trim() !== ''
        );
        return zones[index ?? 0] ?? null;
      }
      case 'fields': {
        const titles = [...this.querySelectorAll<HTMLInputElement>('[data-column-title]')].filter(
          (input) => input.value.trim() !== ''
        );
        return titles[index ?? 0] ?? null;
      }
      default:
        return null;
    }
  }

  private readonly handleClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.closest('#create-inventory-add-zone')) {
      const zones = this.find('#create-inventory-zones');
      if (zones) appendRow(zones, zoneRow('Garage')).querySelector('input')?.focus();
      return;
    }
    if (target.closest('#create-inventory-add-column')) {
      const columns = this.find('#create-inventory-columns');
      if (columns) appendRow(columns, columnRow()).querySelector('input')?.focus();
      return;
    }
    const remove = target.closest('[data-action="remove-row"]');
    if (!remove) return;
    const list = remove.closest<HTMLElement>('.create-inventory-list');
    remove.closest('.create-inventory-row')?.remove();
    // Never leave a list with no way back: keep one empty row.
    if (list && !list.querySelector('.create-inventory-row')) {
      appendRow(list, list.id === 'create-inventory-zones' ? zoneRow('Kitchen') : columnRow());
    }
    this.refreshControls();
    this.announceValidity();
  };

  private readonly handleEdit = (): void => {
    this.refreshControls();
    this.announceValidity();
  };

  /** Enter in a text field submits, as the host's other dialogs do. */
  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    void this.submit();
  };
}

defineElement('spl-inventory-create', InventoryCreate);
