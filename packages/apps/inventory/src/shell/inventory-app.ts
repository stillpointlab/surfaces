/// <reference lib="dom" />
/**
 * `<spl-inventory-app>`: the inventory's page around its elements (the app
 * contract's `AppShellElement`). A host gives it a base, a view and its state;
 * the shell lays out the bar (the back link, the title, the location) and the
 * overview or the zone, and builds the links between the inventory's pages
 * from the base. It keeps the title current from each reply it learns.
 *
 * Check-in is the shell's: it holds one `<checkin-review>`, takes its
 * elements' `checkin-request` (a host never hears it), and opens the review on
 * the dirty files, the latest state's or the latest reply's. The review asks
 * the host `checkin`, in the host's words (`input.checkin`) or the shell's own.
 * When the input is set again while the review is open, its rows follow.
 *
 * What stays the host's: navigation (a link click raises `navigate`; the shell
 * never sets `location`), the exports (`extras.exports`; without them the
 * download controls are hidden), the editor link (`link-editor`, let through),
 * answering `checkin`, and the other requests its elements raise
 * (`notification`, `reload-request`), which bubble through it unchanged.
 */
import '@stillpointlab/checkin-review-component';
import '@stillpointlab/spl-icon-component';
import '../element/inventory-overview.js';
import '../element/inventory-zone.js';

import { createReadyGate, pageHref } from '@stillpointlab/common-format/app';
import { defineElement } from '@stillpointlab/common-format/elements';
import { html, render } from '@stillpointlab/common-format/html';

import { CHECKIN_REQUEST_EVENT } from '../element/types.js';

import {
  dirtyOf,
  INVENTORY_CHECKIN_PLACEHOLDER,
  INVENTORY_CHECKIN_WORDS,
  inventoryCheckinFiles,
} from './checkin.js';
import { exportsOf, zoneHref, zoneSlugOfPath } from './links.js';
import { shellStyles } from './shell.styles';

import type { InventoryOverview } from '../element/inventory-overview.js';
import type { InventoryZone } from '../element/inventory-zone.js';
import type { InventoryLinks } from '../element/types.js';
import type {
  SharedInventoryDirtyFile,
  SharedInventorySpace,
  SharedInventoryZoneState,
} from '../types.js';
import type { CheckinReview } from '@stillpointlab/checkin-review-component';
import type { AppShellElement, AppShellInput } from '@stillpointlab/common-format/app';
import type { SafeHtml } from '@stillpointlab/common-format/html';

/** Raised (bubbling, composed, cancelable) with `{ href }` when a link in the shell is followed. */
export const NAVIGATE_EVENT = 'navigate';

/** The `navigate` event's detail. */
export interface InventoryNavigate {
  href: string;
}

/** What the body shows: the overview, one zone, or a notice that there is nothing to show. */
type Body = 'space' | 'zone' | 'missing';

const DEFAULT_TITLE = 'Inventory';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function bodyOf(input: AppShellInput): Body {
  const type = input.view?.type;
  if (input.view === null || type === 'space') return 'space';
  if (type === 'zone' && input.state !== null) return 'zone';
  return 'missing';
}

/** The bar's title for a state: the inventory's label, and the zone's after it on a zone page. */
function titleOf(body: Body, state: object | null): string {
  if (body === 'space' && isObject(state)) {
    const { label } = state as Partial<SharedInventorySpace>;
    return typeof label === 'string' && label !== '' ? label : DEFAULT_TITLE;
  }
  if (body === 'zone' && isObject(state)) {
    const { spaceLabel, zone } = state as Partial<SharedInventoryZoneState>;
    const label = isObject(zone) && typeof zone.label === 'string' ? zone.label : '';
    if (label === '') return DEFAULT_TITLE;
    return typeof spaceLabel === 'string' && spaceLabel !== '' ? `${spaceLabel} — ${label}` : label;
  }
  return DEFAULT_TITLE;
}

/** Whether a click on `link` is one the page would follow in place: no modifier, no new window. */
function followsInPlace(event: MouseEvent, link: HTMLAnchorElement): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.hasAttribute('download')) return false;
  const target = link.getAttribute('target');
  return target === null || target === '' || target === '_self';
}

/**
 * The links the elements render, read from the shell's current input each time
 * one is built. An export is a member only while the host offers it, so an
 * element shows no control for one it does not. The editor link is always
 * asked for (`link-editor`): the shell holds no host ids.
 */
class ShellLinks implements InventoryLinks {
  constructor(
    private readonly input: () => AppShellInput | null,
    private readonly slugs: ReadonlyMap<string, string>
  ) {}

  zone(path: string): string {
    return zoneHref(this.input()?.base ?? '', this.slugs.get(path) ?? zoneSlugOfPath(path));
  }

  get exportAll(): (() => string) | undefined {
    const { all } = exportsOf(this.input()?.extras);
    return all === undefined ? undefined : () => all;
  }

  get exportZone(): ((path: string) => string) | undefined {
    return exportsOf(this.input()?.extras).zone;
  }

  editor(): undefined {
    return undefined;
  }
}

export class InventoryApp extends HTMLElement implements AppShellElement {
  private input: AppShellInput | null = null;
  private barTitle = DEFAULT_TITLE;
  /** Zone slugs by file path, from every state and reply; the path rule otherwise. */
  private readonly slugs = new Map<string, string>();
  private readonly ready = createReadyGate(this);
  private styleElement: HTMLStyleElement | null = null;
  private shown: Body | null = null;
  private bar: HTMLElement | null = null;
  private body: InventoryOverview | InventoryZone | null = null;
  private review: CheckinReview | null = null;
  /** The dirty files, from the input or a reply learned since, whichever came last. */
  private dirty: SharedInventoryDirtyFile[] = [];

  private readonly links = new ShellLinks(() => this.input, this.slugs);

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  setState(input: AppShellInput): void {
    this.input = input;
    const body = bodyOf(input);
    this.remember(input.state);
    this.dirty = dirtyOf(input.state) ?? [];
    this.barTitle = titleOf(body, input.state);
    this.refresh();
    if (this.review?.isOpen) this.review.setFiles(inventoryCheckinFiles(this.dirty));
  }

  learn(_op: { type: string }, reply: object): void {
    const body = this.input ? bodyOf(this.input) : null;
    const answered = reply as { space?: unknown; state?: unknown };
    const state = body === 'space' ? answered.space : body === 'zone' ? answered.state : undefined;
    if (!isObject(state) || body === null) return;
    this.remember(state);
    this.dirty = dirtyOf(state) ?? this.dirty;
    this.barTitle = titleOf(body, state);
    this.paintBar();
  }

  /** No inventory op's reply depends on the view on screen. */
  opView(_op: { type: string }): undefined {
    return undefined;
  }

  connectedCallback(): void {
    this.addEventListener('click', this.handleClick);
    // Capture, so the shell takes the request before a host's listener on the shell hears it.
    this.addEventListener(CHECKIN_REQUEST_EVENT, this.handleCheckinRequest, true);
    this.refresh();
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.handleClick);
    this.removeEventListener(CHECKIN_REQUEST_EVENT, this.handleCheckinRequest, true);
    this.ready.begin();
  }

  private refresh(): void {
    if (!this.isConnected || !this.input) return;
    this.paint(this.input);
    this.ready.settle();
  }

  private paint(input: AppShellInput): void {
    const body = bodyOf(input);
    this.dataset.variant = body === 'zone' ? 'zone' : 'space';
    if (body !== this.shown || !this.bar) {
      render(this, html`<div class="inventory-bar"></div>${this.bodyHtml(body, input)}`);
      if (!this.styleElement) {
        this.styleElement = document.createElement('style');
        this.styleElement.textContent = shellStyles;
      }
      this.prepend(this.styleElement);
      // The review outlives the layout: it goes back after each one.
      this.review ??= document.createElement('checkin-review') as CheckinReview;
      this.append(this.review);
      this.bar = this.querySelector<HTMLElement>(':scope > .inventory-bar');
      this.body = this.querySelector<InventoryOverview | InventoryZone>(
        ':scope > spl-inventory-overview, :scope > spl-inventory-zone'
      );
      if (this.body) this.body.links = this.links;
      this.shown = body;
    }
    this.paintBar();
    if (body === 'space') {
      (this.body as InventoryOverview).setState(input.state as SharedInventorySpace | null);
    } else if (body === 'zone') {
      (this.body as InventoryZone).setState(input.state as SharedInventoryZoneState);
    }
  }

  private bodyHtml(body: Body, input: AppShellInput): SafeHtml {
    if (body === 'space') return html`<spl-inventory-overview></spl-inventory-overview>`;
    if (body === 'zone') return html`<spl-inventory-zone></spl-inventory-zone>`;
    const zone = input.view?.type === 'zone';
    return html`
      <div class="inventory-app-missing" role="status">
        <p>${zone ? 'This zone is not in the inventory any more.' : 'There is nothing to show here.'}</p>
        <a href="${pageHref(input.base, '')}">Open the inventory</a>
      </div>`;
  }

  private paintBar(): void {
    const input = this.input;
    if (!this.bar || !input) return;
    render(
      this.bar,
      html`
        ${this.backHtml(input)}
        <h1 class="inventory-title" id="inventory-title">${this.barTitle}</h1>
        ${
          typeof input.location === 'string' && input.location !== ''
            ? html`<span class="inventory-repo" title="${input.location}">${input.location}</span>`
            : ''
        }`
    );
  }

  /** A zone page leads back to the overview, the app's own page; the overview to the host's `back`. */
  private backHtml(input: AppShellInput): SafeHtml {
    const back =
      bodyOf(input) === 'space'
        ? input.back
        : { href: pageHref(input.base, ''), label: 'Back to inventory overview' };
    if (!back) return html``;
    return html`
      <a class="back-button" href="${back.href}" aria-label="${back.label}" title="${back.label}">
        <spl-icon icon-name="back-arrow" data-size="medium" data-padding="none" aria-hidden="true" inert></spl-icon>
      </a>`;
  }

  /** Learn the zones' slugs a state carries. */
  private remember(state: unknown): void {
    if (!isObject(state)) return;
    const zones = Array.isArray(state.zones) ? state.zones : [state.zone];
    for (const zone of zones) {
      if (isObject(zone) && typeof zone.path === 'string' && typeof zone.slug === 'string') {
        this.slugs.set(zone.path, zone.slug);
      }
    }
  }

  /** An element's check-in request stops here: the review opens on the dirty files. */
  private readonly handleCheckinRequest = (event: Event): void => {
    if (event.target === this) return;
    event.stopPropagation();
    const input = this.input;
    if (!input || !this.review) return;
    this.review.open({
      files: inventoryCheckinFiles(this.dirty),
      words: input.checkin?.words ?? INVENTORY_CHECKIN_WORDS,
      title: '',
      titlePlaceholder: input.checkin?.defaultTitle ?? INVENTORY_CHECKIN_PLACEHOLDER,
      ...(input.checkin?.branch ? { branch: input.checkin.branch } : {}),
    });
  };

  /** A followed link is the host's to navigate: it claims `navigate`, or the browser follows it. */
  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (!link || !this.contains(link) || !followsInPlace(event, link)) return;
    const claimed = !this.dispatchEvent(
      new CustomEvent<InventoryNavigate>(NAVIGATE_EVENT, {
        detail: { href: link.getAttribute('href')! },
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    );
    if (claimed) event.preventDefault();
  };
}

defineElement('spl-inventory-app', InventoryApp);

declare global {
  interface HTMLElementTagNameMap {
    'spl-inventory-app': InventoryApp;
  }
}
