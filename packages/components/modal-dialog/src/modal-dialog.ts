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
      const slotted = this.getFocusableElements().find((el) => this.contains(el));
      const shadowFocusable = this.shadowRoot?.querySelector<HTMLElement>(
        '[tabindex], button, input, select, textarea, a[href]'
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
    // Basic focus trap (can be expanded)
    if (event.key === 'Tab' && this.isOpen) {
      this.trapFocus(event);
    }
  };

  private getFocusableElements(): HTMLElement[] {
    if (!this.shadowRoot) return [];

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

    // Consider slotted content too:
    const focusableInShadow = Array.from(
      this.shadowRoot.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute('disabled') && isVisible(el));

    const slotElements = Array.from(
      this.querySelectorAll<HTMLElement>( // Query light DOM children (slotted)
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute('disabled') && isVisible(el));

    return [...focusableInShadow, ...slotElements];
  }

  private trapFocus(event: KeyboardEvent): void {
    const focusableElements = this.getFocusableElements();

    if (focusableElements.length === 0) return;

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement; // Could also be this.shadowRoot.activeElement if focus is in shadow

    if (event.shiftKey) {
      // Shift + Tab
      if (
        activeElement === firstFocusable ||
        (!this.contains(activeElement as Node) && !this.shadowRoot?.contains(activeElement as Node))
      ) {
        lastFocusable.focus();
        event.preventDefault();
      }
    } else {
      // Tab
      if (
        activeElement === lastFocusable ||
        (!this.contains(activeElement as Node) && !this.shadowRoot?.contains(activeElement as Node))
      ) {
        firstFocusable.focus();
        event.preventDefault();
      }
    }
  }

  private setupEventListeners(): void {
    const overlay = this.shadowRoot?.querySelector('.modal-overlay');
    const closeButton = this.shadowRoot?.querySelector('.modal-close-button'); // If you add one

    overlay?.addEventListener('click', () => {
      // Optional: Close on overlay click, if a certain attribute is set
      if (this.hasAttribute('close-on-overlay-click')) {
        this.close();
      }
    });

    closeButton?.addEventListener('click', () => this.close());
  }

  private render(): void {
    if (!this.shadowRoot) return;
    render(
      this.shadowRoot,
      this.isOpen
        ? html`
                <div class="modal-overlay" title="">
                <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title-id" tabindex="-1" aria-hidden="false" title="">
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

defineElement('modal-dialog', ModalDialog);
