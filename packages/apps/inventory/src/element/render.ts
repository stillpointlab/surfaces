/// <reference lib="dom" />
/**
 * Markup both inventory elements render (Context Manager's ADR-0038): notices,
 * the check-in bar, the editor recovery link, totals and number formatting.
 * Everything is built with `html`, which escapes every value it is given.
 */
import { html } from '@stillpointlab/common-format/html';
import { formatSheetCellValue } from '@stillpointlab/sheet-format/presentation';

import type { InventoryLinks } from './types.js';
import type {
  SharedInventoryDirtyFile,
  SharedInventoryFieldV2,
  SharedInventorySchema,
  SharedInventoryTotals,
} from '../types.js';
import type { SafeHtml } from '@stillpointlab/common-format/html';

/** `1 item`, `2 items`. */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function formatLegacyMoney(amount: number, currency: string): string {
  if (/^[A-Z]{3}$/.test(currency)) {
    return formatSheetCellValue(String(amount), {
      kind: 'currency',
      currency,
      decimalPlaces: 2,
    });
  }
  return `${amount.toLocaleString()} ${currency}`;
}

export function formatConfiguredNumber(value: number, field: SharedInventoryFieldV2): string {
  return field.format ? formatSheetCellValue(String(value), field.format) : String(value);
}

/**
 * Open a file in the editor: a link when the page knows the editor's URL,
 * otherwise a button the element answers by asking `link-editor`.
 */
export function editorRecoveryHtml(
  links: InventoryLinks | null,
  options: { path: string; label: string; kind: 'zone' | 'manifest' }
): SafeHtml {
  const href = links?.editor(options.path);
  if (href !== undefined) {
    return html`<a class="inventory-editor-link" href="${href}">${options.label}</a>`;
  }
  return html`<button type="button" class="inventory-editor-link inventory-editor-link--button" data-action="open-inventory-editor" data-editor-path="${options.path}" data-editor-kind="${options.kind}">${options.label}</button>`;
}

export function schemaNoticeHtml(
  links: InventoryLinks | null,
  schema: SharedInventorySchema,
  manifestPath: string,
  legacyErrors?: string[]
): SafeHtml {
  const errors = schema.mode === 'invalid' ? schema.errors : legacyErrors;
  if (!errors || errors.length === 0) return html``;
  const recovery = editorRecoveryHtml(links, {
    path: manifestPath,
    label: 'Open inventory.yaml in editor',
    kind: 'manifest',
  });
  return html`
    <div class="inventory-notice inventory-notice--error" role="alert">
      <span class="inventory-notice-heading">inventory.yaml is not valid${schema.mode === 'invalid' ? ' — inventory changes and exports are disabled' : ''}</span>
      <ul>${errors.map((error) => html`<li>${error}</li>`)}</ul>
      <p>${recovery}</p>
    </div>`;
}

export function warningsHtml(warnings: string[]): SafeHtml {
  if (warnings.length === 0) return html``;
  return html`
    <div class="inventory-notice inventory-notice--warning" role="status">
      <ul>${warnings.map((warning) => html`<li>${warning}</li>`)}</ul>
    </div>`;
}

export function checkinBarHtml(dirty: SharedInventoryDirtyFile[]): SafeHtml {
  if (dirty.length === 0) return html``;
  return html`
    <div class="inventory-checkin-bar">
      <span>${plural(dirty.length, 'file')} with local changes</span>
      <button type="button" class="button button-primary" id="inventory-checkin">Check in…</button>
    </div>`;
}

/** The configured total's field, when the manifest still declares it. */
function totalField(
  schema: SharedInventorySchema,
  fieldId: string
): SharedInventoryFieldV2 | undefined {
  return schema.mode === 'configured'
    ? schema.manifest.fields.find((candidate) => candidate.id === fieldId)
    : undefined;
}

export function aggregateTotalHtml(
  totals: SharedInventoryTotals,
  schema: SharedInventorySchema
): SafeHtml {
  if (schema.mode === 'legacy' && 'value' in totals) {
    return html`<span class="inventory-totals-value">Total ${formatLegacyMoney(totals.value, schema.manifest.currency)}</span>${
      totals.unvaluedCount > 0
        ? html`<span class="inventory-unvalued">${plural(totals.unvaluedCount, 'item')} unvalued</span>`
        : ''
    }`;
  }
  if (schema.mode === 'configured' && 'total' in totals && totals.total !== undefined) {
    const total = totals.total;
    const field = totalField(schema, total.fieldId)!;
    return html`<span class="inventory-totals-value">Total ${total.label} ${formatConfiguredNumber(total.value, field)}</span>`;
  }
  return html``;
}

export function zoneSummaryTotalHtml(
  totals: SharedInventoryTotals,
  schema: SharedInventorySchema
): SafeHtml {
  if (schema.mode === 'legacy' && 'value' in totals) {
    return html`<span class="inventory-zone-subtotal">${formatLegacyMoney(totals.value, schema.manifest.currency)}${
      totals.unvaluedCount > 0
        ? html` <span class="inventory-unvalued">(${totals.unvaluedCount} unvalued)</span>`
        : ''
    }</span>`;
  }
  if (schema.mode === 'configured' && 'total' in totals && totals.total !== undefined) {
    const total = totals.total;
    const field = totalField(schema, total.fieldId)!;
    return html`<span class="inventory-zone-subtotal">Total ${total.label} ${formatConfiguredNumber(total.value, field)}</span>`;
  }
  return html``;
}
