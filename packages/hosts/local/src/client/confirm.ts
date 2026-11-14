// The page's one way to ask before losing work: a question in a `<modal-dialog>`,
// answered true by its confirm button and false by Cancel, Escape or the close
// button. Every confirmation here loses something (edits, or the newer file on
// disk), so Cancel has the focus when it opens.
//
// Not `close-on-overlay-click`: the dialog's overlay closes on any click that
// bubbles through it, a slotted button's included, before the button's own
// listener can answer.

import '@stillpointlab/modal-dialog-component';
import { html, render } from '@stillpointlab/common-format/html';

import type { Confirmation } from './words';
import type { ModalDialog } from '@stillpointlab/modal-dialog-component';

export type Confirm = (confirmation: Confirmation) => Promise<boolean>;

/** A confirmation helper over one `<modal-dialog>` appended to `host`. */
export function createConfirm(host: HTMLElement): Confirm {
  const dialog = document.createElement('modal-dialog') as ModalDialog;
  dialog.className = 'confirm';
  host.append(dialog);
  let asking = false;

  return (confirmation) => {
    // One question at a time: a second, while the first is open, is declined.
    if (asking) return Promise.resolve(false);
    asking = true;
    dialog.title = confirmation.question;
    render(
      dialog,
      html`<div slot="body">${
        confirmation.detail ? html`<p class="confirm-detail">${confirmation.detail}</p>` : ''
      }</div><div slot="footer" class="confirm-actions"><button type="button" class="button" data-answer="cancel" data-autofocus>${confirmation.cancel}</button><button type="button" class="button button-primary" data-answer="confirm">${confirmation.confirm}</button></div>`
    );
    return new Promise((resolve) => {
      let answer = false;
      const onClick = (event: Event) => {
        const button = (event.target as Element).closest<HTMLElement>('[data-answer]');
        if (!button) return;
        answer = button.dataset.answer === 'confirm';
        dialog.close();
      };
      const onClosed = () => {
        dialog.removeEventListener('click', onClick);
        dialog.removeEventListener('modal-closed', onClosed);
        asking = false;
        resolve(answer);
      };
      dialog.addEventListener('click', onClick);
      dialog.addEventListener('modal-closed', onClosed);
      dialog.open();
    });
  };
}
