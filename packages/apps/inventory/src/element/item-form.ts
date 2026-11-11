/// <reference lib="dom" />
/**
 * The zone's item dialog: the form for one item in each schema mode, its
 * controls (structured values, Other data rows), and reading the changes back
 * as the body the update endpoint takes. Moved from the inventory page as it
 * was, with its markup built by `html`.
 */
import { html, render } from '@stillpointlab/common-format/html';

import {
  INVENTORY_FIELD_ID_MAX_LENGTH,
  INVENTORY_FIELD_ID_PATTERN,
  INVENTORY_RESERVED_FIELD_IDS,
} from '../paths.js';

import { editorRecoveryHtml } from './render.js';

import type { InventoryItemChanges, InventoryLinks } from './types.js';
import type {
  SharedInventoryExtraField,
  SharedInventoryFieldV2,
  SharedInventoryItem,
  SharedInventoryResolvedValue,
  SharedInventoryZoneState,
  SharedInventoryScalar,
  SharedInventorySchema,
} from '../types.js';
import type { SafeHtml } from '@stillpointlab/common-format/html';

export type ConfiguredSchema = Extract<SharedInventorySchema, { mode: 'configured' }>;

/** A value from Other data as a table cell or a read-only line. */
export function extraCell(extra: SharedInventoryExtraField): SafeHtml {
  if (extra.opaque) {
    return html`<span class="inventory-opaque" title="${extra.readOnlyReason ?? 'Structured value — open the file to see it'}">${extra.summary ?? 'structured'}</span>`;
  }
  if (Array.isArray(extra.value)) return html`${extra.value.map(String).join(', ')}`;
  return html`${String(extra.value ?? '')}`;
}

export function showRequiredTitleError(input: HTMLInputElement, error: HTMLElement): void {
  error.textContent = 'Title is required.';
  error.hidden = false;
  input.setAttribute('aria-invalid', 'true');
  input.focus();
}

export function clearFieldError(input: HTMLInputElement, error: HTMLElement): void {
  error.hidden = true;
  error.textContent = '';
  input.removeAttribute('aria-invalid');
}

function dialogField(
  label: string,
  name: string,
  value: string,
  options: {
    type?: string;
    disabled?: boolean;
    list?: string;
    fieldId?: string;
    fieldType?: string;
    required?: boolean;
    describedBy?: string;
  } = {}
): SafeHtml {
  return html`
    <label class="inventory-add-field"><span>${label}</span><input class="form-input" name="${name}" value="${value}" type="${options.type ?? 'text'}"${options.type === 'number' ? html` step="any"` : ''}${options.disabled ? html` disabled` : ''}${options.required ? html` required` : ''}${options.describedBy ? html` aria-describedby="${options.describedBy}"` : ''}${options.list ? html` list="${options.list}"` : ''}${options.fieldId ? html` data-field-id="${options.fieldId}"` : ''}${options.fieldType ? html` data-field-type="${options.fieldType}"` : ''} /></label>`;
}

function readOnlyBanner(
  links: InventoryLinks | null,
  reason: string,
  path: string,
  suffix: string
): SafeHtml {
  return html`<div class="inventory-notice inventory-notice--warning" role="status"><p>${reason}${suffix} ${editorRecoveryHtml(links, { path, label: 'Open in editor', kind: 'zone' })}</p></div>`;
}

function legacyItemFormHtml(
  links: InventoryLinks | null,
  item: SharedInventoryItem,
  state: SharedInventoryZoneState
): SafeHtml {
  if (state.schema.mode !== 'legacy') return html``;
  const disabled = item.readOnly !== undefined;
  const banner = disabled
    ? readOnlyBanner(
        links,
        item.readOnly ?? '',
        state.zone.path,
        ' — this item can only be edited in the file.'
      )
    : html``;
  return html`
    ${banner}<section><h2 tabindex="-1" id="inventory-configured-fields-heading">Item fields</h2><div class="inventory-add-grid" data-item-id="${item.id}">
      ${dialogField('Id (immutable)', 'id', item.id, { disabled: true })}
      ${dialogField('Title', 'title', item.title, {
        disabled,
        required: !disabled,
        describedBy: 'inventory-item-error',
      })}
      ${dialogField('Value', 'value', item.value !== undefined ? String(item.value) : '', { type: 'number', disabled })}
      ${dialogField('Quantity', 'quantity', item.quantity !== 1 ? String(item.quantity) : '', { type: 'number', disabled })}
      ${dialogField('Serial', 'serial', item.serial ?? '', { disabled })}
      ${dialogField('Acquired', 'acquired', item.acquired ?? '', { disabled })}
      ${dialogField('Container', 'container', item.container ?? '', { disabled, list: 'inventory-container-options' })}
      ${dialogField('Tags', 'tags', (item.tags ?? []).join(', '), { disabled })}
      ${dialogField('Description', 'description', item.description ?? '', { disabled })}
      ${state.schema.manifest.fields.map((field) =>
        dialogField(
          field.label,
          `field:${field.id}`,
          item.fieldValues[field.id] !== undefined ? String(item.fieldValues[field.id]) : '',
          {
            type: field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text',
            disabled,
            fieldId: field.id,
            fieldType: field.type,
          }
        )
      )}
    </div></section>
    <p class="inventory-add-error" id="inventory-item-error" role="alert" hidden></p>
    ${
      item.extraFields.length > 0
        ? html`<section class="inventory-dialog-extras"><h2>Other data</h2><ul>${item.extraFields.map((extra) => html`<li><code>${extra.key}</code>: ${extraCell(extra)}</li>`)}</ul></section>`
        : ''
    }`;
}

function configuredEditorField(
  field: SharedInventoryFieldV2,
  resolved: SharedInventoryResolvedValue | undefined,
  disabled: boolean
): SafeHtml {
  const inputType = field.type === 'number' ? 'number' : 'text';
  const step = field.type === 'number' ? html` step="any"` : '';
  if (resolved?.state === 'structured') {
    return html`
      <div class="inventory-add-field inventory-structured-field" data-structured-field="${field.id}">
        <span>${field.label}</span>
        <p>Structured value — ${resolved.issue.message}</p>
        <button type="button" class="button button-secondary" data-action="replace-structured" data-field-id="${field.id}"${disabled ? html` disabled` : ''}>Replace with ${field.type}</button>
        <input class="form-input" data-field-id="${field.id}" data-field-type="${field.type}" data-original-state="structured" type="${inputType}"${step} disabled hidden />
      </div>`;
  }
  const invalid = resolved?.state === 'invalid';
  const value = resolved?.state === 'valid' ? String(resolved.value) : '';
  return html`
    <label class="inventory-add-field">
      <span>${field.label}${field.format ? html` <small>(${field.format.currency})</small>` : ''}</span>
      ${invalid ? html`<span class="inventory-field-issue" role="status">Current raw value: <code>${String(resolved.value)}</code> — ${resolved.issue.message}</span>` : ''}
      <input class="form-input" data-field-id="${field.id}" data-field-type="${field.type}" data-original-state="${invalid ? 'invalid' : (resolved?.state ?? 'missing')}" type="${inputType}"${step} value="${value}"${field.required ? html` required` : ''}${disabled ? html` disabled` : ''} />
    </label>`;
}

function scalarExtraControl(extra: SharedInventoryExtraField, disabled: boolean): SafeHtml {
  const value = extra.value as SharedInventoryScalar;
  const type =
    typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'text';
  const off = disabled ? html` disabled` : '';
  const control =
    type === 'boolean'
      ? html`<select class="form-input inventory-extra-value" data-extra-type="boolean"${off}><option value="true"${value === true ? html` selected` : ''}>True</option><option value="false"${value === false ? html` selected` : ''}>False</option></select>`
      : html`<input class="form-input inventory-extra-value" data-extra-type="${type}" type="${type === 'number' ? 'number' : 'text'}"${type === 'number' ? html` step="any"` : ''} value="${String(value)}"${off} />`;
  return html`
    <div class="inventory-extra-row" data-extra-key="${extra.key}">
      <label><span>Key</span><input class="form-input" value="${extra.key}" disabled /></label>
      <label><span>Value</span>${control}</label>
      <button type="button" class="button button-secondary" data-action="remove-extra"${off}>Remove</button>
    </div>`;
}

function otherDataHtml(item: SharedInventoryItem, state: SharedInventoryZoneState): SafeHtml {
  const configured = state.schema.mode === 'configured';
  const disabled = !configured || item.readOnly !== undefined || !state.zone.writable;
  return html`
    <details class="inventory-other-data" id="inventory-other-data-section" open>
      <summary><span id="inventory-other-data-heading" role="heading" aria-level="2" tabindex="-1">Other data</span></summary>
      <div id="inventory-extra-list">
        ${item.extraFields.map((extra) => {
          const safeKey =
            extra.key.length <= INVENTORY_FIELD_ID_MAX_LENGTH &&
            INVENTORY_FIELD_ID_PATTERN.test(extra.key) &&
            !INVENTORY_RESERVED_FIELD_IDS.has(extra.key);
          if (
            configured &&
            !extra.opaque &&
            !Array.isArray(extra.value) &&
            extra.value !== undefined &&
            safeKey
          ) {
            return scalarExtraControl(extra, disabled);
          }
          return html`<div class="inventory-extra-readonly"><code>${extra.key}</code>: ${extraCell(extra)} <span class="inventory-field-issue">Read-only — edit in YAML.</span></div>`;
        })}
      </div>
      ${configured && !disabled ? html`<button type="button" class="button button-secondary" id="inventory-add-extra">Add other data</button>` : ''}
    </details>`;
}

function configuredItemFormHtml(
  links: InventoryLinks | null,
  item: SharedInventoryItem,
  state: SharedInventoryZoneState
): SafeHtml {
  const schema = state.schema as ConfiguredSchema;
  const disabled = item.readOnly !== undefined || !state.zone.writable;
  const banner = disabled
    ? readOnlyBanner(links, item.readOnly ?? state.zone.readOnlyReason ?? '', state.zone.path, '')
    : html``;
  return html`
    ${banner}
    <section class="inventory-configured-fields"><h2 tabindex="-1" id="inventory-configured-fields-heading">Configured fields</h2><div class="inventory-add-grid" data-item-id="${item.id}">
      ${dialogField('Id (immutable)', 'id', item.id, { disabled: true })}
      ${dialogField('Title', 'title', item.title, {
        disabled,
        required: !disabled,
        describedBy: 'inventory-item-error',
      })}
      ${schema.manifest.fields
        .filter((field) => field.visibility.edit)
        .map((field) =>
          configuredEditorField(field, item.resolvedFieldValues?.[field.id], disabled)
        )}
    </div></section>
    <p class="inventory-add-error" id="inventory-item-error" role="alert" hidden></p>
    ${otherDataHtml(item, state)}`;
}

function neutralItemFormHtml(
  links: InventoryLinks | null,
  item: SharedInventoryItem,
  state: SharedInventoryZoneState
): SafeHtml {
  return html`
    <section><h2 tabindex="-1" id="inventory-configured-fields-heading">Configured fields</h2><div class="inventory-add-grid">
      ${dialogField('Id (immutable)', 'id', item.id, { disabled: true })}
      ${dialogField('Title', 'title', item.title, { disabled: true })}
    </div></section>
    ${otherDataHtml(item, state)}
    <p>${editorRecoveryHtml(links, { path: state.manifestPath, label: 'Open inventory.yaml in editor', kind: 'manifest' })}</p>`;
}

export function itemFormHtml(
  links: InventoryLinks | null,
  item: SharedInventoryItem,
  state: SharedInventoryZoneState
): SafeHtml {
  if (state.schema.mode === 'configured') return configuredItemFormHtml(links, item, state);
  if (state.schema.mode === 'legacy') return legacyItemFormHtml(links, item, state);
  return neutralItemFormHtml(links, item, state);
}

function appendNewExtraRow(host: HTMLElement): void {
  const row = document.createElement('div');
  row.className = 'inventory-extra-row inventory-extra-row--new';
  row.dataset.newExtra = 'true';
  render(
    row,
    html`
    <label><span>Key</span><input class="form-input" data-extra-key-input maxlength="${INVENTORY_FIELD_ID_MAX_LENGTH}" /></label>
    <label><span>Type</span><select class="form-input" data-extra-type-select><option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option></select></label>
    <label><span>Value</span><input class="form-input inventory-extra-value" data-extra-type="text" type="text" /></label>
    <button type="button" class="button button-secondary" data-action="discard-new-extra">Remove</button>`
  );
  host.appendChild(row);
  row.querySelector<HTMLInputElement>('[data-extra-key-input]')?.focus();
}

/** A click inside a configured item's form; true when it was one of the form's controls. */
export function handleConfiguredFormClick(formHost: HTMLElement, target: HTMLElement): boolean {
  const replace = target.closest<HTMLButtonElement>('[data-action="replace-structured"]');
  if (replace) {
    const wrapper = replace.closest<HTMLElement>('[data-structured-field]');
    const input = wrapper?.querySelector<HTMLInputElement>('input[data-field-id]');
    if (!input) return true;
    input.disabled = false;
    input.hidden = false;
    input.dataset.replaceStructured = 'true';
    replace.hidden = true;
    input.focus();
    return true;
  }
  const remove = target.closest<HTMLButtonElement>('[data-action="remove-extra"]');
  if (remove) {
    const row = remove.closest<HTMLElement>('[data-extra-key]');
    if (!row) return true;
    const removed = row.dataset.removed !== 'true';
    row.dataset.removed = String(removed);
    row
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>('.inventory-extra-value')
      .forEach((control) => (control.disabled = removed));
    remove.textContent = removed ? 'Undo remove' : 'Remove';
    return true;
  }
  if (target.closest('#inventory-add-extra')) {
    const list = formHost.querySelector<HTMLElement>('#inventory-extra-list');
    if (list) appendNewExtraRow(list);
    return true;
  }
  const discard = target.closest('[data-action="discard-new-extra"]');
  if (discard) {
    discard.closest('.inventory-extra-row--new')?.remove();
    return true;
  }
  return false;
}

/** A new Other data row's type changed: swap its value control for that type's. */
export function handleExtraTypeChange(target: HTMLElement): void {
  const select = target.closest<HTMLSelectElement>('[data-extra-type-select]');
  if (!select) return;
  const row = select.closest<HTMLElement>('.inventory-extra-row--new');
  const current = row?.querySelector<HTMLElement>('.inventory-extra-value');
  if (!row || !current) return;
  const next = document.createElement(select.value === 'boolean' ? 'select' : 'input') as
    HTMLInputElement | HTMLSelectElement;
  next.className = 'form-input inventory-extra-value';
  next.dataset.extraType = select.value;
  if (next instanceof HTMLSelectElement) {
    for (const value of ['true', 'false']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value === 'true' ? 'True' : 'False';
      next.append(option);
    }
  } else {
    next.type = select.value === 'number' ? 'number' : 'text';
    if (select.value === 'number') next.step = 'any';
  }
  current.replaceWith(next);
}

export function collectLegacyChanges(
  form: HTMLElement,
  item: SharedInventoryItem
): InventoryItemChanges {
  const value = (name: string): string =>
    (form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? '').trim();
  const changes: InventoryItemChanges = {};
  const title = value('title');
  if (title !== item.title) changes.title = title;
  const numeric = (name: 'value', current: number | undefined): void => {
    const raw = value(name);
    const next = raw === '' ? null : Number(raw);
    if (next === null ? current !== undefined : next !== current) changes[name] = next;
  };
  numeric('value', item.value);
  const quantityRaw = value('quantity');
  const quantity = quantityRaw === '' ? null : Number(quantityRaw);
  if ((quantity ?? 1) !== item.quantity) changes.quantity = quantity;
  for (const name of ['serial', 'acquired', 'container', 'description'] as const) {
    const raw = value(name);
    const next = raw === '' ? null : raw;
    if ((next ?? undefined) !== item[name]) changes[name] = next;
  }
  const tags = value('tags')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.join('\0') !== (item.tags ?? []).join('\0')) changes.tags = tags.length ? tags : null;
  const fieldValues: Record<string, SharedInventoryScalar | null> = {};
  form.querySelectorAll<HTMLInputElement>('input[data-field-id]').forEach((input) => {
    const id = input.dataset.fieldId!;
    const raw = input.value.trim();
    const next: SharedInventoryScalar | null =
      raw === '' ? null : input.dataset.fieldType === 'number' ? Number(raw) : raw;
    const current = item.fieldValues[id];
    if (next === null ? current !== undefined : next !== current) fieldValues[id] = next;
  });
  if (Object.keys(fieldValues).length) changes.fieldValues = fieldValues;
  return changes;
}

function scalarControlValue(
  control: HTMLInputElement | HTMLSelectElement,
  type: string
): SharedInventoryScalar {
  if (type === 'number') return Number(control.value);
  if (type === 'boolean') return control.value === 'true';
  return control.value;
}

export function collectConfiguredChanges(
  form: HTMLElement,
  item: SharedInventoryItem,
  schema: ConfiguredSchema
): { changes?: InventoryItemChanges; error?: { message: string; input?: HTMLElement } } {
  const changes: InventoryItemChanges = {};
  const titleInput = form.querySelector<HTMLInputElement>('input[name="title"]');
  const title = titleInput?.value.trim() ?? '';
  if (title === '')
    return { error: { message: 'Title is required.', input: titleInput ?? undefined } };
  if (title !== item.title) changes.title = title;

  const fieldValues: Record<string, SharedInventoryScalar | null> = {};
  for (const input of form.querySelectorAll<HTMLInputElement>('input[data-field-id]')) {
    if (input.disabled) continue;
    const field = schema.manifest.fields.find(
      (candidate) => candidate.id === input.dataset.fieldId
    );
    if (!field) continue;
    const raw = input.value.trim();
    const original = item.resolvedFieldValues?.[field.id];
    if (
      (input.dataset.originalState === 'invalid' || input.dataset.originalState === 'structured') &&
      raw === ''
    ) {
      if (field.required) {
        return { error: { message: `${field.label} must be repaired before saving.`, input } };
      }
      continue;
    }
    if (raw === '') {
      if (field.required) return { error: { message: `${field.label} is required.`, input } };
      if (original?.state === 'valid') fieldValues[field.id] = null;
      continue;
    }
    const next: SharedInventoryScalar = field.type === 'number' ? Number(raw) : raw;
    if (typeof next === 'number' && !Number.isFinite(next)) {
      return { error: { message: `${field.label} must be a finite number.`, input } };
    }
    if (original?.state !== 'valid' || original.value !== next) fieldValues[field.id] = next;
  }
  if (Object.keys(fieldValues).length) changes.fieldValues = fieldValues;

  const extraValues: Record<string, SharedInventoryScalar | null> = {};
  for (const row of form.querySelectorAll<HTMLElement>('[data-extra-key]')) {
    const key = row.dataset.extraKey!;
    if (row.dataset.removed === 'true') {
      extraValues[key] = null;
      continue;
    }
    const control = row.querySelector<HTMLInputElement | HTMLSelectElement>(
      '.inventory-extra-value'
    );
    const original = item.extraFields.find((extra) => extra.key === key)?.value;
    if (!control || Array.isArray(original) || original === undefined) continue;
    const next = scalarControlValue(control, control.dataset.extraType ?? 'text');
    if (typeof next === 'number' && !Number.isFinite(next)) {
      return { error: { message: `${key} must be a finite number.`, input: control } };
    }
    if (next !== original) extraValues[key] = next;
  }
  const seenNew = new Set<string>();
  for (const row of form.querySelectorAll<HTMLElement>('[data-new-extra="true"]')) {
    const keyInput = row.querySelector<HTMLInputElement>('[data-extra-key-input]');
    const control = row.querySelector<HTMLInputElement | HTMLSelectElement>(
      '.inventory-extra-value'
    );
    const key = keyInput?.value.trim() ?? '';
    if (key === '' && (control?.value ?? '') === '') continue;
    if (
      key === '' ||
      key.length > INVENTORY_FIELD_ID_MAX_LENGTH ||
      !INVENTORY_FIELD_ID_PATTERN.test(key) ||
      INVENTORY_RESERVED_FIELD_IDS.has(key)
    ) {
      return {
        error: {
          message: 'Other data keys must be lowercase slugs and cannot be id or title.',
          input: keyInput ?? undefined,
        },
      };
    }
    if (
      schema.manifest.fields.some((field) => field.id === key) ||
      item.extraFields.some((extra) => extra.key === key) ||
      seenNew.has(key)
    ) {
      return {
        error: {
          message: `Other data key '${key}' already exists or is configured.`,
          input: keyInput ?? undefined,
        },
      };
    }
    if (!control || control.value.trim() === '') {
      return { error: { message: `Give '${key}' a value.`, input: control ?? undefined } };
    }
    const next = scalarControlValue(control, control.dataset.extraType ?? 'text');
    if (typeof next === 'number' && !Number.isFinite(next)) {
      return { error: { message: `${key} must be a finite number.`, input: control } };
    }
    seenNew.add(key);
    extraValues[key] = next;
  }
  if (Object.keys(extraValues).length) changes.extraValues = extraValues;
  return { changes };
}
