/// <reference lib="dom" />
/**
 * What both inventory elements share (Context Manager's ADR-0038): their
 * stylesheet, the ready gate, the page's links, notifications, and the editor
 * recovery button, which asks the page to link a file and then follows the link
 * it answers.
 */
import { createReadyGate, requestOp } from '@stillpointlab/common-format/app';
import { render } from '@stillpointlab/common-format/html';

import { inventoryStyles } from './inventory.styles';
import { NOTIFICATION_EVENT } from './types.js';

import type {
  InventoryLinks,
  InventoryNotification,
  InventoryNotificationType,
  InventoryOps,
} from './types.js';
import type { SafeHtml } from '@stillpointlab/common-format/html';

export abstract class InventoryElement<State> extends HTMLElement {
  protected state: State | undefined = undefined;
  protected linkSet: InventoryLinks | null = null;

  private readonly ready = createReadyGate(this);
  private styleElement: HTMLStyleElement | null = null;

  /** The page's URLs. Without them, zone names render as text and downloads as disabled. */
  get links(): InventoryLinks | null {
    return this.linkSet;
  }

  set links(links: InventoryLinks | null) {
    this.linkSet = links;
    if (this.hasState()) this.refresh();
  }

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  setState(state: State): void {
    this.state = state;
    this.refresh();
  }

  connectedCallback(): void {
    this.addEventListener('click', this.handleClick);
    this.addEventListener('submit', this.handleSubmit);
    this.addEventListener('input', this.handleInput);
    this.addEventListener('change', this.handleChange);
    if (this.hasState()) this.refresh();
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.handleClick);
    this.removeEventListener('submit', this.handleSubmit);
    this.removeEventListener('input', this.handleInput);
    this.removeEventListener('change', this.handleChange);
    this.ready.begin();
  }

  protected hasState(): boolean {
    return this.state !== undefined;
  }

  /** Render the current state, then settle. */
  protected refresh(): void {
    if (!this.isConnected || !this.hasState()) return;
    this.paint();
    this.ready.settle();
  }

  /** Replace what the element shows, keeping its stylesheet first and `keep` after it. */
  protected show(content: SafeHtml, ...keep: Element[]): void {
    render(this, content);
    if (!this.styleElement) {
      this.styleElement = document.createElement('style');
      this.styleElement.textContent = inventoryStyles;
    }
    this.prepend(this.styleElement);
    this.append(...keep);
  }

  protected notify(message: string, type: InventoryNotificationType): void {
    this.dispatchEvent(
      new CustomEvent<InventoryNotification>(NOTIFICATION_EVENT, {
        detail: { message, type },
        bubbles: true,
        composed: true,
      })
    );
  }

  protected abstract paint(): void;

  protected onClick(_target: HTMLElement, _event: MouseEvent): void {}
  protected onSubmit(_form: HTMLFormElement): void {}
  protected onInput(_target: HTMLElement): void {}
  protected onChange(_target: HTMLElement): void {}

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const editor = target.closest<HTMLButtonElement>('button[data-action="open-inventory-editor"]');
    if (editor && this.contains(editor)) {
      void this.openEditor(editor);
      return;
    }
    this.onClick(target, event);
  };

  private readonly handleSubmit = (event: Event): void => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    this.onSubmit(form);
  };

  private readonly handleInput = (event: Event): void => {
    if (event.target instanceof HTMLElement) this.onInput(event.target);
  };

  private readonly handleChange = (event: Event): void => {
    if (event.target instanceof HTMLElement) this.onChange(event.target);
  };

  /** Link the file through the page, then follow the editor link it answers. */
  private async openEditor(button: HTMLButtonElement): Promise<void> {
    const path = button.dataset.editorPath;
    if (!path || button.disabled) return;
    const kind = button.dataset.editorKind === 'manifest' ? 'manifest' : 'zone';
    const originalLabel = button.textContent ?? 'Open in editor';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Opening…';
    const res = await requestOp<InventoryOps, 'link-editor'>(this, {
      type: 'link-editor',
      path,
      kind,
    });
    if (!res.ok) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = originalLabel;
      this.notify(res.message || `Could not open ${path} in the editor.`, 'error');
      return;
    }
    const link = document.createElement('a');
    link.className = 'inventory-editor-link';
    link.href = res.href;
    link.textContent = originalLabel;
    button.replaceWith(link);
    link.click();
  }
}
