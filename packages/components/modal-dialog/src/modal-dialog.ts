/// <reference lib="dom" />

// A modal dialog: scrim, focus trap, Escape to close, and header, body and footer
// slots. Moved from Context Manager, which is why it has `open()`/`close()` and
// `is-open` rather than a native <dialog>.

import { defineElement } from '@stillpointlab/common-format/elements';
import { html, render } from '@stillpointlab/common-format/html';

import { modalStyles } from './modal.styles';

export class ModalDialog extends HTMLElement {
  static get observedAttributes() {
    return ['is-open', 'title'];
  }

  private previouslyFocusedElement: HTMLElement | null = null;
  /** Which way the last Tab went, until an edge has used it. */
  private tabbedBackward: boolean | null = null;

  // Set as text, so the stylesheet never goes through markup; each render puts it
  // back first in the shadow root.
  private readonly styleElement: HTMLStyleElement;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.styleElement = document.createElement('style');
    this.styleElement.textContent = modalStyles;
  }

  connectedCallback() {
    this.render();
    if (this.isOpen) {
      this._handleOpen(); // Handle if opened declaratively
    }
  }

  disconnectedCallback() {
    // Remove global listeners if any (e.g., for Escape key on document)
    document.removeEventListener('keydown', this.handleDocumentKeyDown);
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;
    if (name === 'is-open') {
      if (this.isOpen) {
        this._handleOpen();
      } else {
        this._handleClose();
      }
    }
    this.render(); // Re-render if title changes, or to apply open/close styles
  }

  get isOpen(): boolean {
    return this.hasAttribute('is-open');
  }

  set isOpen(value: boolean) {
    if (value) {
      this.setAttribute('is-open', '');
    } else {
      this.removeAttribute('is-open');
    }
  }

  override get title(): string {
    return this.getAttribute('title') || '';
  }

  override set title(value: string) {
    this.setAttribute('title', value);
  }

  public open(): void {
    if (this.isOpen) return;
    this.previouslyFocusedElement = document.activeElement as HTMLElement;
    this.isOpen = true; // Triggers attributeChangedCallback
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false; // Triggers attributeChangedCallback
  }

  public dispatchNotification(
    message: string,
    type: 'error' | 'success' | 'info' | 'warning'
  ): void {
    this.dispatchEvent(
      new CustomEvent('notification', { bubbles: true, composed: true, detail: { message, type } })
    );
  }

  private _handleOpen(): void {
    // 1. Add body scroll lock (basic)
    document.body.style.overflow = 'hidden';

    // 2. Add Escape key listener
    document.addEventListener('keydown', this.handleDocumentKeyDown);

    // 3. Focus management (focus modal or first element)
    // Needs to happen after render ensures modal is visible.
    //
    // Slotted content wins over the shadow root. Preferring the shadow root put
    // focus on the × close button and — because this runs on the next frame —
    // did so AFTER any page-side input.focus()/select(), silently undoing it.
    // An explicit [data-autofocus] (or native [autofocus]) in the light DOM is
    // the strongest signal; failing that, take the first focusable slotted
    // control, then fall back to the previous behaviour. Pages should mark the
    // target with data-autofocus, not autofocus: before this element is
    // defined the slotted content is ordinary in-flow DOM, and the browser's
    // native autofocus pass would focus the input and scroll the freshly
    // loaded page down to wherever the dialog markup sits.
    requestAnimationFrame(() => {
      // Opening code and fast pointer/keyboard interaction may focus a more
      // specific control before this deferred callback runs. Preserve that
      // intent instead of moving focus (and subsequent input) elsewhere.
      const activeElement = document.activeElement;
      const focusAlreadyInside =
        (activeElement instanceof Node && this.contains(activeElement)) ||
        Boolean(this.shadowRoot?.activeElement);
      if (focusAlreadyInside) return;

      const slottedAutofocus = this.querySelector<HTMLElement>('[data-autofocus], [autofocus]');
      const slotted = this.tabbables().find((el) => this.contains(el));
      const shadowFocusable = this.shadowRoot?.querySelector<HTMLElement>(
        '[tabindex]:not(.modal-edge), button, input, select, textarea, a[href]'
      );
      const modalContainer = this.shadowRoot?.querySelector<HTMLElement>('.modal');
      const target = slottedAutofocus ?? slotted ?? shadowFocusable ?? modalContainer;
      if (!target) return;
      target.focus();
      // Opening on an existing value should let you type straight over it.
      if (target instanceof HTMLInputElement && target.value !== '') target.select();
    });

    this.dispatchEvent(new CustomEvent('modal-opened', { bubbles: true, composed: true }));
  }

  private _handleClose(): void {
    // 1. Remove body scroll lock
    document.body.style.overflow = '';

    // 2. Remove Escape key listener
    document.removeEventListener('keydown', this.handleDocumentKeyDown);

    // 3. Return focus
    this.previouslyFocusedElement?.focus();
    this.previouslyFocusedElement = null;

    this.dispatchEvent(new CustomEvent('modal-closed', { bubbles: true, composed: true }));
  }

  // Bound function for event listener
  private handleDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.isOpen) {
      this.close();
    }
    if (event.key === 'Tab' && this.isOpen) {
      this.trapFocus(event);
    }
  };

  /**
   * What Tab stops at in the dialog, in the order Tab reaches it: the slots'
   * content where the slots are, and inside a slotted element's own shadow root.
   * A closed shadow root, or a frame, cannot be read, which is why nothing here
   * decides where focus is: the two edges do (see `turnAt`).
   */
  private tabbables(): HTMLElement[] {
    const modal = this.shadowRoot?.querySelector('.modal');
    if (!modal) return [];

    const isVisible = (el: HTMLElement): boolean => {
      const style = window.getComputedStyle(el);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        el.offsetWidth > 0 &&
        el.offsetHeight > 0
      );
    };
    const found: HTMLElement[] = [];
    const visit = (node: Element): void => {
      if (node instanceof HTMLSlotElement) {
        const assigned = node.assignedElements();
        for (const child of assigned.length > 0 ? assigned : Array.from(node.children))
          visit(child);
        return;
      }
      if (
        node instanceof HTMLElement &&
        node.matches(TABBABLE) &&
        !node.hasAttribute('disabled') &&
        isVisible(node)
      ) {
        found.push(node);
      }
      for (const child of Array.from((node.shadowRoot ?? node).children)) visit(child);
    };
    visit(modal);
    return found;
  }

  /** Whether `node` is in the dialog, through its slots and any shadow root. */
  private holds(node: Node): boolean {
    for (
      let at: Node | null = node;
      at;
      at = at.parentNode ?? (at as Partial<ShadowRoot>).host ?? null
    ) {
      if (at === this) return true;
    }
    return false;
  }

  /**
   * The focused element when it is in the dialog. At the document, focus inside
   * a shadow root reads as that root's host, so this follows it down.
   */
  private focusedInside(): Element | null {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active && this.holds(active) ? active : null;
  }

  /**
   * Tab inside the dialog is the browser's to move: it knows every stop, and
   * the two edges turn it round. This notes which way the key goes, and takes
   * the one case no edge sees: focus that is outside the dialog (the page behind
   * it, or nothing) comes in at the end the key points to.
   */
  private trapFocus(event: KeyboardEvent): void {
    // Something inside took the key for itself: an editor that indents with Tab.
    if (event.defaultPrevented) return;
    this.tabbedBackward = event.shiftKey;
    if (this.focusedInside()) return;
    this.turnAt(event.shiftKey ? 'start' : 'end');
    event.preventDefault();
  }

  /**
   * Focus reached an edge: one of the two stops that sit before and after
   * everything else in the dialog, which nothing else can be tabbed past. It
   * goes on to the first stop, or backward to the last, so Tab never leaves. The
   * key's direction says which; with no key (focus sent here some other way), the
   * edge does.
   */
  private turnAt(edge: 'start' | 'end'): void {
    const backward = this.tabbedBackward ?? edge === 'start';
    this.tabbedBackward = null;
    const tabbables = this.tabbables();
    const target =
      (backward ? tabbables[tabbables.length - 1] : tabbables[0]) ??
      this.shadowRoot?.querySelector<HTMLElement>('.modal');
    target?.focus();
  }

  private setupEventListeners(): void {
    const overlay = this.shadowRoot?.querySelector('.modal-overlay');
    const closeButton = this.shadowRoot?.querySelector('.modal-close-button'); // If you add one

    overlay?.addEventListener('click', (event) => {
      // Only a click on the scrim itself: one inside the dialog (a slotted button's
      // included) bubbles through the overlay too, and must not close it.
      if (event.target === overlay && this.hasAttribute('close-on-overlay-click')) {
        this.close();
      }
    });

    closeButton?.addEventListener('click', () => this.close());

    for (const edge of ['start', 'end'] as const) {
      this.shadowRoot
        ?.querySelector(`.modal-edge[data-edge="${edge}"]`)
        ?.addEventListener('focus', () => this.turnAt(edge));
    }
  }

  private render(): void {
    if (!this.shadowRoot) return;
    render(
      this.shadowRoot,
      this.isOpen
        ? html`
                <div class="modal-overlay" title="">
                <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title-id" tabindex="-1" aria-hidden="false" title="">
                    <div class="modal-edge" data-edge="start" tabindex="0"></div>
                    <header class="modal-header">
                        <slot name="header">
                            <h2 id="modal-title-id" class="modal-title"></h2>
                        </slot>
                        <button class="modal-close-button" aria-label="Close dialog">×</button>
                    </header>
                    <section class="modal-body">
                        <slot name="body"></slot> <!-- Default slot for main content -->
                    </section>
                    <footer class="modal-footer">
                        <slot name="footer"></slot>
                    </footer>
                    <div class="modal-edge" data-edge="end" tabindex="0"></div>
                </div>
                </div>
            `
        : html``
    );
    this.shadowRoot.prepend(this.styleElement);
    // As text, never markup: a title can carry a name a person typed.
    const heading = this.shadowRoot.querySelector('.modal-title');
    if (heading) heading.textContent = this.title;
    this.setupEventListeners();
  }
}

/** What Tab stops at, but for the dialog's own two edges. */
const TABBABLE =
  ':is(button, [href], input, select, textarea, [contenteditable]:not([contenteditable="false"]), [tabindex]):not([tabindex="-1"], .modal-edge)';

defineElement('modal-dialog', ModalDialog);
