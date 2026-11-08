/// <reference lib="dom" />
/**
 * `<spl-inventory-zone>`: one zone's items, its filter, quick add and the item
 * dialog (Context Manager's ADR-0022 and ADR-0038). The page sets its state and
 * links; adding, saving and deleting items ask the page for ops by the zone's
 * path and render the zone state it answers.
 */
import '@stillpointlab/modal-dialog-component';

import { requestOp } from '@stillpointlab/common-format/app';
import { defineElement } from '@stillpointlab/common-format/elements';
import { html, render } from '@stillpointlab/common-format/html';

import { InventoryElement } from './base.js';
import {
  clearFieldError,
  collectConfiguredChanges,
  collectLegacyChanges,
  extraCell,
  handleConfiguredFormClick,
  handleExtraTypeChange,
  itemFormHtml,
  showRequiredTitleError,
} from './item-form.js';
import {
  aggregateTotalHtml,
  checkinBarHtml,
  editorRecoveryHtml,
  formatConfiguredNumber,
  formatLegacyMoney,
  plural,
  schemaNoticeHtml,
  warningsHtml,
} from './render.js';
import { CHECKIN_REQUEST_EVENT, RELOAD_REQUEST_EVENT } from './types.js';

import type { InventoryOps } from './types.js';
import type {
  SharedInventoryFieldV2,
  SharedInventoryItem,
  SharedInventoryResolvedValue,
  SharedInventoryZoneState,
  SharedInventoryScalar,
} from '../types.js';
import type { AppElement, Result } from '@stillpointlab/common-format/app';
import type { SafeHtml } from '@stillpointlab/common-format/html';
import type { ModalDialog } from '@stillpointlab/modal-dialog-component';

type ZoneState = SharedInventoryZoneState;

function configuredFieldInput(field: SharedInventoryFieldV2, surface: 'add' | 'edit'): SafeHtml {
  return html`
    <label class="inventory-add-field">
      <span>${field.label}${field.format ? html` <small>(${field.format.currency})</small>` : ''}</span>
      <input class="form-input" data-field-id="${field.id}" data-field-type="${field.type}" type="${field.type === 'number' ? 'number' : 'text'}"${field.type === 'number' ? html` step="any"` : ''}${field.required ? html` required` : ''} data-surface="${surface}" />
    </label>`;
}

function legacyQuickAddHtml(state: ZoneState): SafeHtml {
  if (state.schema.mode !== 'legacy') return html``;
  const manifest = state.schema.manifest;
  const containers = [
    ...new Set([
      ...manifest.containers,
      ...state.zone.items
        .map((item) => item.container)
        .filter((container): container is string => Boolean(container)),
    ]),
  ];
  return html`
    <form class="inventory-quick-add" id="inventory-quick-add" novalidate>
      <div class="inventory-add-main">
        <label class="inventory-add-field inventory-add-title"><span>Title</span><input class="form-input" name="title" required aria-describedby="inventory-add-error" maxlength="500" /></label>
        <label class="inventory-add-field"><span>Value</span><input class="form-input" name="value" type="number" step="any" min="0" /></label>
        <button type="submit" class="button button-primary">Add</button>
      </div>
      <details class="inventory-add-more"><summary>More fields</summary><div class="inventory-add-grid">
        <label class="inventory-add-field"><span>Quantity</span><input class="form-input" name="quantity" type="number" min="1" step="1" /></label>
        <label class="inventory-add-field"><span>Serial</span><input class="form-input" name="serial" maxlength="500" /></label>
        <label class="inventory-add-field"><span>Acquired</span><input class="form-input" name="acquired" maxlength="200" /></label>
        <label class="inventory-add-field"><span>Container</span><input class="form-input" name="container" maxlength="200" list="inventory-container-options" /></label>
        <label class="inventory-add-field"><span>Tags</span><input class="form-input" name="tags" placeholder="comma, separated" /></label>
        <label class="inventory-add-field inventory-add-description"><span>Description</span><input class="form-input" name="description" maxlength="4000" /></label>
        ${manifest.fields.map(
          (field) => html`
              <label class="inventory-add-field"><span>${field.label}</span><input class="form-input" data-field-id="${field.id}" data-field-type="${field.type}" type="${field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}"${field.type === 'number' ? html` step="any"` : ''} /></label>`
        )}
      </div></details>
      <datalist id="inventory-container-options">${containers.map((container) => html`<option value="${container}"></option>`)}</datalist>
      <p class="inventory-add-error" id="inventory-add-error" role="alert" hidden></p>
    </form>`;
}

function configuredCell(
  field: SharedInventoryFieldV2,
  resolved: SharedInventoryResolvedValue | undefined
): SafeHtml {
  if (!resolved || resolved.state === 'missing') {
    const issue = resolved?.issue;
    return issue
      ? html`<span class="inventory-invalid-value" title="${issue.message}"><span aria-hidden="true">— ⚠</span><span class="sr-only">${issue.message}</span></span>`
      : html``;
  }
  if (resolved.state === 'structured') {
    return html`<span class="inventory-invalid-value" title="${resolved.issue.message}">Structured value <span aria-hidden="true">⚠</span><span class="sr-only">${resolved.issue.message}</span></span>`;
  }
  const raw = resolved.value;
  const display =
    resolved.state === 'valid' && typeof raw === 'number'
      ? formatConfiguredNumber(raw, field)
      : String(raw);
  return html`${display}${
    resolved.state === 'invalid'
      ? html` <span class="inventory-item-warning" role="img" aria-label="${resolved.issue.message}" title="${resolved.issue.message}">⚠</span>`
      : ''
  }`;
}

function otherDataButton(item: SharedInventoryItem, count: number): SafeHtml {
  return html`<button type="button" class="inventory-other-button" data-action="show-other-data" data-item-id="${item.id}" aria-label="Show ${plural(count, 'other value')} for ${item.title}">${count}</button>`;
}

function configuredTableHtml(state: ZoneState): SafeHtml {
  if (state.schema.mode !== 'configured') return html``;
  const { zone } = state;
  const fields = state.schema.manifest.fields.filter((field) => field.visibility.table);
  const showOther = zone.items.some((item) => item.extraFields.length > 0);
  const headers = [
    'Title',
    ...fields.map((field) => field.label),
    ...(showOther ? ['Other data'] : []),
    '',
  ];
  const rows = zone.items.map((item) => {
    const searchable = [
      item.title,
      ...fields.flatMap((field) => {
        const value = item.resolvedFieldValues?.[field.id];
        return value?.state === 'valid' || value?.state === 'invalid' ? [String(value.value)] : [];
      }),
    ]
      .join(' ')
      .toLocaleLowerCase('en-US');
    const otherCount = item.extraFields.length;
    return html`
        <tr data-item-id="${item.id}" data-filter-text="${searchable}">
          <td class="inventory-cell-title">${item.title}${item.readOnly ? html`<span class="inventory-item-warning" title="${item.readOnly}">🔒</span>` : ''}</td>
          ${fields.map((field) => html`<td>${configuredCell(field, item.resolvedFieldValues?.[field.id])}</td>`)}
          ${showOther ? html`<td class="inventory-cell-other">${otherCount > 0 ? otherDataButton(item, otherCount) : ''}</td>` : ''}
          <td class="inventory-cell-actions"><button type="button" class="inventory-row-menu" data-action="edit-item" data-item-id="${item.id}" aria-label="Edit ${item.title}">⋯</button></td>
        </tr>`;
  });
  return html`
    <div class="inventory-filter"><input type="search" id="inventory-filter-input" class="form-input" placeholder="Filter by title or visible fields…" aria-label="Filter items" /></div>
    <div class="inventory-table-wrap"><table class="inventory-table"><thead><tr>${headers.map((header) => html`<th scope="col">${header}</th>`)}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function legacyTableHtml(state: ZoneState): SafeHtml {
  if (state.schema.mode !== 'legacy') return html``;
  const { zone } = state;
  const manifest = state.schema.manifest;
  const fields = manifest.fields;
  const extras: string[] = [];
  for (const item of zone.items) {
    for (const extra of item.extraFields) if (!extras.includes(extra.key)) extras.push(extra.key);
  }
  const showQuantity = zone.items.some((item) => item.quantity !== 1);
  const headers = [
    'Title',
    'Value',
    ...(showQuantity ? ['Quantity'] : []),
    'Container',
    ...fields.map((field) => field.label),
    ...extras,
    '',
  ];
  const containers = [
    ...new Set(zone.items.map((item) => item.container).filter(Boolean)),
  ] as string[];
  const groups = [
    ...containers.map((container) => ({
      heading: container,
      items: zone.items.filter((item) => item.container === container),
    })),
    { heading: 'Unassigned', items: zone.items.filter((item) => !item.container) },
  ].filter((group) => group.items.length > 0);
  const rowHtml = (item: SharedInventoryItem): SafeHtml => {
    const filterText = [item.title, item.description ?? '', item.serial ?? '']
      .join(' ')
      .toLowerCase();
    return html`
    <tr data-item-id="${item.id}" data-filter-text="${filterText}">
      <td class="inventory-cell-title">${item.title}${item.tags?.length ? html`<span class="inventory-tags">${item.tags.map((tag) => html`<span class="inventory-tag">${tag}</span>`)}</span>` : ''}${item.warnings ? html`<span class="inventory-item-warning" title="${item.warnings.join('; ')}">⚠</span>` : ''}${item.readOnly ? html`<span class="inventory-item-warning" title="${item.readOnly}">🔒</span>` : ''}</td>
      <td class="inventory-cell-value">${item.value !== undefined ? formatLegacyMoney(item.value, manifest.currency) : html`<span class="inventory-unvalued">—</span>`}</td>
      ${showQuantity ? html`<td class="inventory-cell-quantity">${item.quantity !== 1 ? item.quantity : ''}</td>` : ''}
      <td>${item.container ?? ''}</td>
      ${fields.map((field) => html`<td>${item.fieldValues[field.id] !== undefined ? String(item.fieldValues[field.id]) : ''}</td>`)}
      ${extras.map((key) => {
        const extra = item.extraFields.find((candidate) => candidate.key === key);
        return html`<td>${extra ? extraCell(extra) : ''}</td>`;
      })}
      <td class="inventory-cell-actions"><button type="button" class="inventory-row-menu" data-action="edit-item" data-item-id="${item.id}" aria-label="Edit ${item.title}">⋯</button></td>
    </tr>`;
  };
  return html`
    <div class="inventory-filter"><input type="search" id="inventory-filter-input" class="form-input" placeholder="Filter by title, description, or serial…" aria-label="Filter items" /></div>
    <div class="inventory-table-wrap"><table class="inventory-table"><thead><tr>${headers.map((header) => html`<th scope="col">${header}</th>`)}</tr></thead>
      ${groups.map((group) => html`<tbody data-container-group><tr class="inventory-group-row"><th colspan="${headers.length}" scope="rowgroup">${group.heading}</th></tr>${group.items.map(rowHtml)}</tbody>`)}
    </table></div>`;
}

function neutralTableHtml(state: ZoneState): SafeHtml {
  const showOther = state.zone.items.some((item) => item.extraFields.length > 0);
  return html`
    <div class="inventory-table-wrap"><table class="inventory-table"><thead><tr><th scope="col">Title</th>${showOther ? html`<th scope="col">Other data</th>` : ''}<th scope="col"></th></tr></thead><tbody>
      ${state.zone.items.map((item) => {
        const count = item.extraFields.length;
        return html`<tr data-item-id="${item.id}" data-filter-text="${item.title.toLowerCase()}"><td class="inventory-cell-title">${item.title}</td>${showOther ? html`<td>${count > 0 ? otherDataButton(item, count) : ''}</td>` : ''}<td class="inventory-cell-actions"><button type="button" class="inventory-row-menu" data-action="edit-item" data-item-id="${item.id}" aria-label="View ${item.title}">⋯</button></td></tr>`;
      })}
    </tbody></table></div>`;
}

function attentionHtml(state: ZoneState): SafeHtml {
  if (state.zone.needsAttention.length === 0) return html``;
  return html`
    <section class="inventory-attention"><h2>Needs attention</h2><ul>
      ${state.zone.needsAttention.map(
        (entry) =>
          html`<li>${entry.title || entry.id ? html`<strong>${entry.title ?? entry.id ?? ''}</strong> — ` : ''}${entry.reason}</li>`
      )}
    </ul></section>`;
}

export class InventoryZone extends InventoryElement<ZoneState> implements AppElement<ZoneState> {
  private dialog: ModalDialog | null = null;
  private currentItem: SharedInventoryItem | null = null;
  private deleteDisarm: ReturnType<typeof setTimeout> | null = null;

  protected paint(): void {
    this.show(this.zoneHtml(this.state!), this.itemDialog());
  }

  /** The item dialog: made once, and kept across renders. */
  private itemDialog(): ModalDialog {
    if (!this.dialog) {
      const dialog = document.createElement('modal-dialog') as ModalDialog;
      dialog.id = 'inventory-item-dialog';
      dialog.setAttribute('title', 'Edit item');
      render(
        dialog,
        html`
        <div slot="body">
          <div id="inventory-item-form"></div>
        </div>
        <div slot="footer">
          <button class="button button-secondary inventory-delete-button" id="delete-inventory-item">Delete item</button>
          <button class="button button-secondary" id="cancel-inventory-item">Cancel</button>
          <button class="button button-primary" id="save-inventory-item">Save</button>
        </div>`
      );
      this.dialog = dialog;
    }
    return this.dialog;
  }

  private formHost(): HTMLElement {
    return this.itemDialog().querySelector<HTMLElement>('#inventory-item-form')!;
  }

  private button(id: string): HTMLButtonElement {
    return this.itemDialog().querySelector<HTMLButtonElement>(`#${id}`)!;
  }

  private quickAddHtml(state: ZoneState): SafeHtml {
    if (!state.enabled || state.schema.mode === 'invalid') return html``;
    const { zone } = state;
    if (!zone.writable) {
      return html`
        <div class="inventory-notice inventory-notice--warning" role="status">
          <span class="inventory-notice-heading">This zone is read-only for the app</span>
          <p>${zone.readOnlyReason ?? zone.parseError ?? 'The file shape is not supported.'} ${editorRecoveryHtml(this.links, { path: zone.path, label: 'Open in editor', kind: 'zone' })}</p>
        </div>`;
    }
    if (state.schema.mode === 'legacy') return legacyQuickAddHtml(state);
    return html`
      <form class="inventory-quick-add inventory-quick-add--configured" id="inventory-quick-add" novalidate>
        <div class="inventory-add-grid">
          <label class="inventory-add-field inventory-add-title"><span>Title</span><input class="form-input" name="title" required aria-describedby="inventory-add-error" maxlength="500" /></label>
          ${state.schema.manifest.fields
            .filter((field) => field.visibility.add)
            .map((field) => configuredFieldInput(field, 'add'))}
        </div>
        <button type="submit" class="button button-primary">Add item</button>
        <p class="inventory-add-error" id="inventory-add-error" role="alert" hidden></p>
      </form>`;
  }

  private downloadHtml(state: ZoneState): SafeHtml {
    const links = this.links;
    const enabled =
      links !== null && state.schema.mode !== 'invalid' && state.zone.items.length > 0;
    return enabled
      ? html`<a class="inventory-download" href="${links.exportZone(state.zone.path)}" download>Download zone CSV</a>`
      : html`<span class="inventory-download is-disabled" title="${state.schema.mode === 'invalid' ? 'Repair inventory.yaml before exporting' : 'Nothing to export yet'}">Download zone CSV</span>`;
  }

  private zoneHtml(state: ZoneState): SafeHtml {
    const { zone } = state;
    const notices = html`
      ${checkinBarHtml(state.dirty)}
      ${schemaNoticeHtml(this.links, state.schema, state.manifestPath)}`;
    if (zone.parseError) {
      return html`
        ${notices}
        ${warningsHtml(state.warnings)}
        <div class="inventory-notice inventory-notice--error" role="alert"><span class="inventory-notice-heading">${zone.path} could not be parsed</span><ul><li>${zone.parseError}</li></ul></div>`;
    }
    const table =
      zone.items.length === 0
        ? html`<p class="inventory-empty-zones">This zone has no items yet.</p>`
        : state.schema.mode === 'configured'
          ? configuredTableHtml(state)
          : state.schema.mode === 'legacy'
            ? legacyTableHtml(state)
            : neutralTableHtml(state);
    return html`
      ${notices}
      ${warningsHtml([...state.warnings, ...(zone.warnings ?? [])])}
      ${table}
      ${this.quickAddHtml(state)}
      <div class="inventory-totals"><span>${plural(zone.totals.itemCount, 'item')}</span>${aggregateTotalHtml(zone.totals, state.schema)}${this.downloadHtml(state)}</div>
      ${attentionHtml(state)}`;
  }

  // ---- Events ---------------------------------------------------------------

  protected override onClick(target: HTMLElement): void {
    if (target.closest('#inventory-checkin')) {
      this.dispatchEvent(new CustomEvent(CHECKIN_REQUEST_EVENT, { bubbles: true, composed: true }));
      return;
    }
    const dialog = this.dialog;
    if (dialog?.contains(target)) {
      if (target.closest('#cancel-inventory-item')) dialog.close();
      else if (target.closest('#save-inventory-item')) void this.save();
      else if (target.closest('#delete-inventory-item')) void this.deleteItem();
      else if (this.state?.schema.mode === 'configured') {
        handleConfiguredFormClick(this.formHost(), target);
      }
      return;
    }
    const other = target.closest<HTMLElement>('[data-action="show-other-data"]');
    if (other) {
      this.openItem(other.dataset.itemId!, 'other');
      return;
    }
    const edit = target.closest<HTMLElement>('[data-action="edit-item"]');
    if (edit) {
      this.openItem(edit.dataset.itemId!);
      return;
    }
    if (target.closest('button, a')) return;
    const row = target.closest<HTMLTableRowElement>('tr[data-item-id]');
    if (row) this.openItem(row.dataset.itemId!);
  }

  protected override onSubmit(form: HTMLFormElement): void {
    if (form.id === 'inventory-quick-add') void this.addItem(form);
  }

  protected override onInput(target: HTMLElement): void {
    if (target.id === 'inventory-filter-input') {
      this.filter((target as HTMLInputElement).value);
      return;
    }
    const form = target.closest<HTMLFormElement>('#inventory-quick-add');
    if (form && target instanceof HTMLInputElement && target.name === 'title') {
      const errorEl = form.querySelector<HTMLElement>('#inventory-add-error');
      if (errorEl && target.value.trim() !== '') clearFieldError(target, errorEl);
    }
  }

  protected override onChange(target: HTMLElement): void {
    if (this.dialog?.contains(target)) handleExtraTypeChange(target);
  }

  // ---- Filter and quick add -------------------------------------------------

  private filter(value: string): void {
    const query = value.trim().toLocaleLowerCase('en-US');
    this.querySelectorAll<HTMLTableRowElement>('tr[data-filter-text]').forEach((row) => {
      row.hidden = query !== '' && !(row.dataset.filterText ?? '').includes(query);
    });
    this.querySelectorAll<HTMLElement>('tbody[data-container-group]').forEach((group) => {
      const visible = [...group.querySelectorAll<HTMLTableRowElement>('tr[data-filter-text]')].some(
        (row) => !row.hidden
      );
      const heading = group.querySelector<HTMLTableRowElement>('.inventory-group-row');
      if (heading) heading.hidden = !visible;
    });
  }

  private async addItem(form: HTMLFormElement): Promise<void> {
    const state = this.state;
    const errorEl = form.querySelector<HTMLElement>('#inventory-add-error');
    const titleInput = form.querySelector<HTMLInputElement>('input[name="title"]');
    if (!state || !errorEl || !titleInput || state.schema.mode === 'invalid') return;
    const data = new FormData(form);
    const text = (name: string): string | undefined => {
      const value = String(data.get(name) ?? '').trim();
      return value === '' ? undefined : value;
    };
    const title = text('title');
    if (title === undefined) {
      showRequiredTitleError(titleInput, errorEl);
      return;
    }
    clearFieldError(titleInput, errorEl);
    const fieldValues: Record<string, SharedInventoryScalar> = {};
    for (const input of form.querySelectorAll<HTMLInputElement>('input[data-field-id]')) {
      const raw = input.value.trim();
      if (raw === '') {
        if (input.required) {
          errorEl.textContent = `${input.closest('label')?.querySelector('span')?.textContent ?? 'Field'} is required.`;
          errorEl.hidden = false;
          input.focus();
          return;
        }
        continue;
      }
      const value = input.dataset.fieldType === 'number' ? Number(raw) : raw;
      if (typeof value === 'number' && !Number.isFinite(value)) {
        errorEl.textContent = 'Enter a finite number.';
        errorEl.hidden = false;
        input.focus();
        return;
      }
      fieldValues[input.dataset.fieldId!] = value;
    }

    let item: Record<string, unknown> = {
      title,
      ...(Object.keys(fieldValues).length > 0 ? { fieldValues } : {}),
    };
    if (state.schema.mode === 'legacy') {
      const numeric = (name: string): number | undefined => {
        const value = text(name);
        return value === undefined ? undefined : Number(value);
      };
      item = {
        ...item,
        ...(numeric('value') !== undefined ? { value: numeric('value') } : {}),
        ...(numeric('quantity') !== undefined ? { quantity: numeric('quantity') } : {}),
        ...(text('serial') !== undefined ? { serial: text('serial') } : {}),
        ...(text('acquired') !== undefined ? { acquired: text('acquired') } : {}),
        ...(text('container') !== undefined ? { container: text('container') } : {}),
        ...(text('description') !== undefined ? { description: text('description') } : {}),
        ...(text('tags') !== undefined
          ? {
              tags: text('tags')!
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            }
          : {}),
      };
    }
    const res = await requestOp<InventoryOps, 'add-item'>(this, {
      type: 'add-item',
      path: state.zone.path,
      item,
    });
    if (!res.ok) {
      errorEl.textContent = res.message || 'Could not add the item.';
      errorEl.hidden = false;
      return;
    }
    this.notify(`Added “${title}” — local until check-in.`, 'success');
    this.setState(res.state);
  }

  // ---- The item dialog ------------------------------------------------------

  private openItem(itemId: string, section: 'configured' | 'other' = 'configured'): void {
    const state = this.state;
    const item = state?.zone.items.find((candidate) => candidate.id === itemId);
    if (!state || !item) return;
    this.currentItem = item;
    const formHost = this.formHost();
    render(formHost, itemFormHtml(this.links, item, state));
    const disabled =
      state.schema.mode === 'invalid' || item.readOnly !== undefined || !state.zone.writable;
    this.button('save-inventory-item').disabled = disabled;
    this.button('delete-inventory-item').disabled = disabled;
    this.disarmDelete();
    this.itemDialog().open();
    queueMicrotask(() => {
      formHost
        .querySelector<HTMLElement>(
          section === 'other'
            ? '#inventory-other-data-heading'
            : '#inventory-configured-fields-heading'
        )
        ?.focus();
    });
  }

  private disarmDelete(): void {
    if (this.deleteDisarm !== null) clearTimeout(this.deleteDisarm);
    this.deleteDisarm = null;
    const del = this.button('delete-inventory-item');
    del.dataset.armed = 'false';
    del.textContent = 'Delete item';
  }

  /** An item op's answer: true when it succeeded. */
  private settleItemOp(res: Result<object>): boolean {
    if (res.ok) return true;
    if (res.code === 'INVENTORY_ITEM_NOT_FOUND') {
      this.notify('The item no longer exists in the file — reloading.', 'warning');
      this.dispatchEvent(new CustomEvent(RELOAD_REQUEST_EVENT, { bubbles: true, composed: true }));
      return false;
    }
    this.notify(res.message || 'Could not save the item.', 'error');
    return false;
  }

  private async save(): Promise<void> {
    const item = this.currentItem;
    const state = this.state;
    if (!item || !state || state.schema.mode === 'invalid') return;
    const formHost = this.formHost();
    const error = formHost.querySelector<HTMLElement>('#inventory-item-error');
    let changes: Record<string, unknown>;
    if (state.schema.mode === 'configured') {
      const collected = collectConfiguredChanges(formHost, item, state.schema);
      if (collected.error) {
        if (error) {
          error.textContent = collected.error.message;
          error.hidden = false;
        }
        collected.error.input?.focus();
        return;
      }
      changes = collected.changes ?? {};
    } else {
      const titleInput = formHost.querySelector<HTMLInputElement>('input[name="title"]');
      if (!titleInput || !error) return;
      if (titleInput.value.trim() === '') {
        showRequiredTitleError(titleInput, error);
        return;
      }
      clearFieldError(titleInput, error);
      changes = collectLegacyChanges(formHost, item);
    }
    if (Object.keys(changes).length === 0) {
      this.itemDialog().close();
      return;
    }
    const res = await requestOp<InventoryOps, 'update-item'>(this, {
      type: 'update-item',
      path: state.zone.path,
      id: item.id,
      changes,
    });
    if (!this.settleItemOp(res) || !res.ok) return;
    this.itemDialog().close();
    this.notify('Saved — local until check-in.', 'success');
    this.setState(res.state);
  }

  private async deleteItem(): Promise<void> {
    const item = this.currentItem;
    const state = this.state;
    if (!item || !state || state.schema.mode === 'invalid') return;
    const del = this.button('delete-inventory-item');
    if (del.dataset.armed !== 'true') {
      del.dataset.armed = 'true';
      del.textContent = 'Really delete?';
      this.deleteDisarm = setTimeout(() => this.disarmDelete(), 4000);
      return;
    }
    const res = await requestOp<InventoryOps, 'delete-item'>(this, {
      type: 'delete-item',
      path: state.zone.path,
      id: item.id,
    });
    if (!this.settleItemOp(res) || !res.ok) return;
    this.itemDialog().close();
    this.notify('Deleted — local until check-in.', 'success');
    this.setState(res.state);
  }
}

defineElement('spl-inventory-zone', InventoryZone);

declare global {
  interface HTMLElementTagNameMap {
    'spl-inventory-zone': InventoryZone;
  }
}
