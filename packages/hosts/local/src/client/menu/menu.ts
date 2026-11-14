// The host's one options menu: a list of entries opened at a point, for whatever
// asks (the explorer's rows now; an app's row and the task board's
// `open-options-menu` request later). It knows nothing of files: each entry is a
// label and the action to run when it is chosen.
//
// One per page, and one open at a time: opening it again replaces what it showed.
// It is page chrome in the light DOM, so the page's stylesheet styles it. It
// follows the menu pattern: `role="menu"` with `menuitem`s, focus on the first
// entry when it opens, Up, Down, Home, End and a letter to move, Enter or Space to
// choose, and Escape or Tab to close. A click outside, a scroll or a resize
// closes it as well, leaving focus where the person put it.

import { html, render } from '@stillpointlab/common-format/html';

export interface MenuEntry {
  label: string;
  /** Runs when the entry is chosen, after the menu has closed. */
  action: () => void;
  /** It loses something (a delete): styled as such. */
  danger?: boolean;
  /** Shown, and reachable by the arrow keys, but not chosen. */
  disabled?: boolean;
  /** The entry's tooltip and description: why it is disabled, for one. */
  title?: string;
}

export interface MenuRequest {
  /** Where the menu's top-left corner goes, in viewport coordinates. */
  x: number;
  y: number;
  entries: readonly MenuEntry[];
  /** The menu's accessible name. */
  label?: string;
  /**
   * Where focus goes when the menu closes by a key (Escape, Tab) or a choice.
   * By default, back to what had focus when it opened.
   */
  returnFocus?: () => void;
}

/** The gap kept between the menu and the viewport's edges. */
const MARGIN = 4;

const ITEM = '[role="menuitem"]';

/** The focused element, looking into shadow roots: a tree row, not the tree. */
export function deepActiveElement(): HTMLElement | null {
  let active: Element | null = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

export class HostMenu {
  /** The menu's element, appended to the host it was made with. */
  readonly element: HTMLElement;
  private request: MenuRequest | null = null;
  private listening: AbortController | null = null;

  constructor(host: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'host-menu';
    this.element.setAttribute('role', 'menu');
    this.element.setAttribute('aria-orientation', 'vertical');
    this.element.tabIndex = -1;
    this.element.hidden = true;
    host.append(this.element);
    this.element.addEventListener('keydown', (event) => this.onKeydown(event));
    this.element.addEventListener('click', (event) => {
      const item = (event.target as Element).closest<HTMLElement>(ITEM);
      if (item) this.choose(item);
    });
    this.element.addEventListener('mouseover', (event) => {
      const item = (event.target as Element).closest<HTMLElement>(ITEM);
      if (item && item !== document.activeElement) item.focus({ preventScroll: true });
    });
    // A right click on the menu itself is not the browser's.
    this.element.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  get isOpen(): boolean {
    return this.request !== null;
  }

  /** Open at the request's point, in place of anything open. No entries, no menu. */
  open(request: MenuRequest): void {
    // Opened again from inside itself: focus still goes back where the first went.
    const opener = deepActiveElement();
    const inherited =
      opener && this.element.contains(opener) ? this.request?.returnFocus : undefined;
    this.close();
    if (request.entries.length === 0) return;
    this.request = {
      ...request,
      returnFocus:
        request.returnFocus ?? inherited ?? (() => opener?.isConnected && opener.focus()),
    };
    render(
      this.element,
      html`${request.entries.map(
        (entry, index) =>
          html`<button type="button" class="host-menu-item${entry.danger ? ' host-menu-danger' : ''}" role="menuitem" tabindex="-1" data-index="${index}"${entry.disabled ? html` aria-disabled="true"` : ''}${entry.title ? html` title="${entry.title}"` : ''}>${entry.label}</button>`
      )}`
    );
    if (request.label) this.element.setAttribute('aria-label', request.label);
    else this.element.removeAttribute('aria-label');
    this.element.hidden = false;
    this.place(request.x, request.y);
    this.listen();
    this.items()[0]?.focus({ preventScroll: true });
  }

  /** Close without a choice, leaving focus where it is. */
  close(): void {
    if (!this.request) return;
    this.request = null;
    this.listening?.abort();
    this.listening = null;
    this.element.hidden = true;
    render(this.element, html``);
  }

  destroy(): void {
    this.close();
    this.element.remove();
  }

  // ---- placing ----

  /** At the point, moved left or above it as far as it must to stay in the viewport. */
  private place(x: number, y: number): void {
    const style = this.element.style;
    style.left = `${x}px`;
    style.top = `${y}px`;
    const { width, height } = this.element.getBoundingClientRect();
    const right = window.innerWidth - MARGIN;
    const bottom = window.innerHeight - MARGIN;
    const left = x + width > right ? Math.max(MARGIN, right - width) : x;
    // Too low: above the point when it fits there, else as low as it can go.
    const top =
      y + height <= bottom
        ? y
        : y - height >= MARGIN
          ? y - height
          : Math.max(MARGIN, bottom - height);
    style.left = `${left}px`;
    style.top = `${top}px`;
  }

  private listen(): void {
    this.listening = new AbortController();
    const { signal } = this.listening;
    const outside = (target: EventTarget | null) =>
      !(target instanceof Node && this.element.contains(target));
    window.addEventListener(
      'pointerdown',
      (event) => {
        if (outside(event.composedPath()[0] ?? event.target)) this.close();
      },
      { signal, capture: true }
    );
    window.addEventListener(
      'scroll',
      (event) => {
        if (outside(event.target)) this.close();
      },
      { signal, capture: true }
    );
    window.addEventListener('resize', () => this.close(), { signal });
    window.addEventListener('blur', () => this.close(), { signal });
    // Focus taken elsewhere (a click the pointer handler missed, a shortcut).
    this.element.addEventListener(
      'focusout',
      (event) => {
        const next = (event as FocusEvent).relatedTarget;
        if (next !== null && outside(next)) this.close();
      },
      { signal }
    );
  }

  // ---- choosing ----

  private items(): HTMLElement[] {
    return [...this.element.querySelectorAll<HTMLElement>(ITEM)];
  }

  private choose(item: HTMLElement): void {
    const request = this.request;
    if (!request || item.getAttribute('aria-disabled') === 'true') return;
    const entry = request.entries[Number(item.dataset.index)];
    this.close();
    request.returnFocus?.();
    entry?.action();
  }

  private dismiss(): void {
    const request = this.request;
    this.close();
    request?.returnFocus?.();
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const items = this.items();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const move = (index: number) => items[(index + items.length) % items.length]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        move(at + 1);
        break;
      case 'ArrowUp':
        move(at < 0 ? -1 : at - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(-1);
        break;
      case 'Enter':
      case ' ':
        if (at >= 0) this.choose(items[at]!);
        break;
      case 'Escape':
      case 'Tab':
        this.dismiss();
        break;
      default: {
        // A letter moves to the next entry that starts with it.
        if (event.key.length !== 1 || event.shiftKey) return;
        const key = event.key.toLowerCase();
        for (let step = 1; step <= items.length; step += 1) {
          const item = items[(at + step) % items.length]!;
          if (item.textContent?.trim().toLowerCase().startsWith(key)) {
            item.focus();
            break;
          }
        }
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }
}
