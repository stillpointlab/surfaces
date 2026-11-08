/// <reference lib="dom" />
/**
 * `<spl-inventory-overview>`: an inventory's zones, totals and "Add zone"
 * (Context Manager's ADR-0022 and ADR-0038). The page sets its state (the
 * overview, or `null` when the repository has no inventory) and its links;
 * adding a zone asks the page for an `add-zone` op and renders the overview it
 * answers.
 */
import { requestOp } from '@stillpointlab/common-format/app';
import { defineElement } from '@stillpointlab/common-format/elements';
import { html } from '@stillpointlab/common-format/html';

import { InventoryElement } from './base.js';
import {
  aggregateTotalHtml,
  checkinBarHtml,
  plural,
  schemaNoticeHtml,
  warningsHtml,
  zoneSummaryTotalHtml,
} from './render.js';
import { CHECKIN_REQUEST_EVENT } from './types.js';

import type { InventoryOps } from './types.js';
import type { SharedInventoryDirtyFile, SharedInventorySpace } from '../types.js';
import type { AppElement } from '@stillpointlab/common-format/app';
import type { SafeHtml } from '@stillpointlab/common-format/html';

function zoneBadge(dirty: SharedInventoryDirtyFile[], path: string): SafeHtml {
  const entry = dirty.find((file) => file.path === path);
  if (!entry) return html``;
  return html`<span class="inventory-zone-dirty" title="Local changes — not checked in yet">${entry.newFile ? 'new' : 'edited'}</span>`;
}

export class InventoryOverview
  extends InventoryElement<SharedInventorySpace | null>
  implements AppElement<SharedInventorySpace | null>
{
  protected paint(): void {
    const space = this.state;
    this.show(space ? this.spaceHtml(space) : this.noManifestHtml());
  }

  private noManifestHtml(): SafeHtml {
    return html`
      <div class="inventory-notice inventory-notice--info">
        <span class="inventory-notice-heading">This repository has no inventory yet</span>
        <p>Create an <code>inventory.yaml</code> with <code>version: 2</code>, then add zone files under the adjacent <code>rooms/</code> directory.</p>
      </div>`;
  }

  private addZoneHtml(space: SharedInventorySpace): SafeHtml {
    if (!space.enabled || space.schema.mode === 'invalid') return html``;
    return html`
      <form class="inventory-add-zone" id="inventory-add-zone">
        <label class="inventory-add-field inventory-add-title">
          <span>Add zone</span>
          <input class="form-input" name="title" required maxlength="120" placeholder="Attic" />
        </label>
        <button type="submit" class="button button-primary">Add zone</button>
        <p class="inventory-add-error" id="inventory-add-zone-error" role="alert" hidden></p>
      </form>`;
  }

  private spaceHtml(space: SharedInventorySpace): SafeHtml {
    const links = this.links;
    const zones =
      space.zones.length === 0
        ? html`<p class="inventory-empty-zones">No zones yet — use Add zone or add <code>rooms/&lt;zone&gt;.yaml</code> beside <code>${space.manifestPath}</code>.</p>`
        : html`<ul class="inventory-zone-list">${space.zones.map((zone) => {
            const problem = zone.parseError
              ? zone.parseError
              : zone.needsAttentionCount > 0
                ? `${zone.needsAttentionCount} need${zone.needsAttentionCount === 1 ? 's' : ''} attention`
                : '';
            const inner = html`
                  <span class="inventory-zone-name">${zone.label}${zoneBadge(space.dirty, zone.path)}</span>
                  <span class="inventory-zone-count">${plural(zone.itemCount, 'item')}</span>
                  ${zoneSummaryTotalHtml(zone.totals, space.schema)}
                  ${problem ? html`<span class="inventory-zone-problem">${problem}</span>` : ''}`;
            return html`
              <li class="inventory-zone-row${zone.parseError ? ' is-broken' : ''}">
                ${
                  links
                    ? html`<a class="inventory-zone-link" href="${links.zone(zone.path)}">${inner}</a>`
                    : html`<span class="inventory-zone-link">${inner}</span>`
                }
              </li>`;
          })}</ul>`;

    const canDownload =
      links !== null && space.schema.mode !== 'invalid' && space.totals.itemCount > 0;
    const download = canDownload
      ? html`<a class="inventory-download" href="${links.exportAll()}" download>Download inventory (.zip)</a>`
      : html`<span class="inventory-download is-disabled" title="${space.schema.mode === 'invalid' ? 'Repair inventory.yaml before exporting' : 'Nothing to export yet'}">Download inventory (.zip)</span>`;

    return html`
      ${checkinBarHtml(space.dirty)}
      ${schemaNoticeHtml(links, space.schema, space.manifestPath, space.manifestErrors)}
      ${warningsHtml(space.warnings)}
      ${zones}
      ${this.addZoneHtml(space)}
      <div class="inventory-totals">
        <span>${plural(space.totals.itemCount, 'item')}</span>
        ${aggregateTotalHtml(space.totals, space.schema)}
        ${download}
      </div>`;
  }

  protected override onClick(target: HTMLElement): void {
    if (target.closest('#inventory-checkin')) {
      this.dispatchEvent(new CustomEvent(CHECKIN_REQUEST_EVENT, { bubbles: true, composed: true }));
    }
  }

  protected override onSubmit(form: HTMLFormElement): void {
    if (form.id === 'inventory-add-zone') void this.addZone(form);
  }

  private async addZone(form: HTMLFormElement): Promise<void> {
    const title = String(new FormData(form).get('title') ?? '').trim();
    if (title === '') return;
    const errorEl = form.querySelector<HTMLElement>('#inventory-add-zone-error');
    const button = form.querySelector<HTMLButtonElement>('button[type=submit]');
    if (errorEl) errorEl.hidden = true;
    if (button) button.disabled = true;
    const res = await requestOp<InventoryOps, 'add-zone'>(this, { type: 'add-zone', title });
    if (button) button.disabled = false;
    if (!res.ok) {
      if (errorEl) {
        errorEl.textContent = res.message || 'Could not add the zone.';
        errorEl.hidden = false;
      }
      return;
    }
    this.notify(`Added zone “${title}” — local until check-in.`, 'success');
    this.setState(res.space);
  }
}

defineElement('spl-inventory-overview', InventoryOverview);

declare global {
  interface HTMLElementTagNameMap {
    'spl-inventory-overview': InventoryOverview;
  }
}
