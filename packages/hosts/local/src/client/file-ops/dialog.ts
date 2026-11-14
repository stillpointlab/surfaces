// The explorer's one dialog, over a `<modal-dialog>`: a path field (New file,
// Rename) or a message (Delete), a confirm button, and Cancel. Enter confirms.
// Confirming runs the write while the dialog stays open: a check's message or the
// server's refusal shows under the field (or the message), with what was typed
// kept, and only a write that landed closes it. While a write runs, a second
// confirm, Enter and Escape do nothing.
//
// Not `close-on-overlay-click`, for the reason `confirm.ts` gives.

import '@stillpointlab/modal-dialog-component';
import { html, render, type SafeHtml } from '@stillpointlab/common-format/html';

import { words } from '../words';

import type { ModalDialog } from '@stillpointlab/modal-dialog-component';

/** The write a confirm runs: null when it landed, or the message to show. */
export type Run<T> = (value: T) => Promise<string | null>;

export interface FieldRequest {
  title: string;
  confirm: string;
  value: string;
  /** The text selected when it opens; the caret at the end when absent. */
  select?: [start: number, end: number];
  /** The page's own check, before anything is sent: a message, or null. */
  check: (value: string) => string | null;
  run: Run<string>;
}

export interface MessageRequest {
  title: string;
  detail?: string;
  confirm: string;
  danger?: boolean;
  run: Run<void>;
}

const FIELD_ID = 'file-op-path';
const ERROR_ID = 'file-op-error';

export class FileOpDialog {
  readonly element: ModalDialog;
  private busy = false;
  private asking = false;
  private readonly listening = new AbortController();

  constructor(host: HTMLElement) {
    this.element = document.createElement('modal-dialog') as ModalDialog;
    this.element.className = 'file-op';
    host.append(this.element);
    const { signal } = this.listening;
    // While a write runs the dialog stays: Escape (heard on the document) and the
    // close button wait for it. A capturing listener runs before either.
    window.addEventListener(
      'keydown',
      (event) => {
        if (this.busy && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      { signal, capture: true }
    );
    this.element.addEventListener(
      'click',
      (event) => {
        if (this.busy) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      { signal, capture: true }
    );
  }

  destroy(): void {
    this.listening.abort();
    this.element.remove();
  }

  get isOpen(): boolean {
    return this.element.isOpen;
  }

  /** Ask for a path; true once the write it ran has landed, false when cancelled. */
  askPath(request: FieldRequest): Promise<boolean> {
    return this.ask(
      request.title,
      html`<label class="file-op-label" for="${FIELD_ID}">${words.fileOps.pathLabel}</label><input id="${FIELD_ID}" class="file-op-path" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="${ERROR_ID}" data-autofocus>`,
      request.confirm,
      false,
      () => {
        const input = this.input()!;
        input.value = request.value;
        input.focus();
        const [start, end] = request.select ?? [request.value.length, request.value.length];
        input.setSelectionRange(start, end);
      },
      async () => {
        const value = this.input()!.value;
        return request.check(value) ?? (await request.run(value));
      }
    );
  }

  /** Ask a question; true once the write it ran has landed, false when cancelled. */
  askMessage(request: MessageRequest): Promise<boolean> {
    return this.ask(
      request.title,
      request.detail ? html`<p class="confirm-detail">${request.detail}</p>` : html``,
      request.confirm,
      request.danger ?? false,
      () => this.confirmButton()?.focus(),
      () => request.run()
    );
  }

  private input(): HTMLInputElement | null {
    return this.element.querySelector<HTMLInputElement>(`#${FIELD_ID}`);
  }

  private confirmButton(): HTMLButtonElement | null {
    return this.element.querySelector<HTMLButtonElement>('[data-answer="confirm"]');
  }

  private ask(
    title: string,
    body: SafeHtml,
    confirm: string,
    danger: boolean,
    focus: () => void,
    submit: () => Promise<string | null>
  ): Promise<boolean> {
    // One at a time: a second, while the first is open, is declined.
    if (this.asking) return Promise.resolve(false);
    this.asking = true;
    const dialog = this.element;
    dialog.title = title;
    render(
      dialog,
      html`<div slot="body" class="file-op-body">${body}<p id="${ERROR_ID}" class="file-op-error" role="alert" hidden></p></div><div slot="footer" class="confirm-actions"><button type="button" class="button" data-answer="cancel">${words.fileOps.cancel}</button><button type="button" class="button ${danger ? 'button-danger' : 'button-primary'}" data-answer="confirm">${confirm}</button></div>`
    );
    const error = dialog.querySelector<HTMLElement>(`#${ERROR_ID}`)!;

    const show = (message: string | null) => {
      error.hidden = message === null;
      error.textContent = message ?? '';
      const input = this.input();
      if (input) {
        if (message === null) input.removeAttribute('aria-invalid');
        else input.setAttribute('aria-invalid', 'true');
      }
    };

    const setBusy = (busy: boolean) => {
      this.busy = busy;
      if (busy) dialog.setAttribute('aria-busy', 'true');
      else dialog.removeAttribute('aria-busy');
      const input = this.input();
      if (input) input.readOnly = busy;
      for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-answer]')) {
        button.disabled = busy;
      }
    };

    return new Promise((resolve) => {
      let landed = false;
      const listening = new AbortController();
      const { signal } = listening;

      const go = async () => {
        if (this.busy) return;
        setBusy(true);
        let message: string | null;
        try {
          message = await submit();
        } catch (error) {
          message = String(error);
        }
        setBusy(false);
        if (message === null) {
          landed = true;
          dialog.close();
          return;
        }
        show(message);
        // Back to where the person was, with what they typed.
        (this.input() ?? this.confirmButton())?.focus();
      };

      dialog.addEventListener(
        'click',
        (event) => {
          const button = (event.target as Element).closest<HTMLElement>('[data-answer]');
          if (!button || this.busy) return;
          if (button.dataset.answer === 'confirm') void go();
          else dialog.close();
        },
        { signal }
      );
      dialog.addEventListener(
        'keydown',
        (event) => {
          // Enter in the field confirms; on a button it presses that button.
          if (event.key !== 'Enter' || (event.target as Element).closest('button')) return;
          event.preventDefault();
          void go();
        },
        { signal }
      );
      dialog.addEventListener('input', () => show(null), { signal });
      dialog.addEventListener(
        'modal-closed',
        () => {
          listening.abort();
          setBusy(false);
          this.asking = false;
          resolve(landed);
        },
        { signal }
      );
      dialog.open();
      focus();
    });
  }
}
