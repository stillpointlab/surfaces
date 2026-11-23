// Creating an instance: one dialog over a `<modal-dialog>` that holds the app's
// own create form (`./create-element`) under the host's folder field and, for an
// app whose `meta.create` asks it, the consent a create at the served root needs.
// The folder, the consent and the dialog are the host's; the form's fields are
// the app's.
//
// An app's folder is one row in the explorer, so the files already in the
// folder typed go behind that row once the app is there. The dialog says so
// under the field, with how to see them again ("Show files…"), while the folder
// holds any.
//
// Create (or Enter in the folder) checks the folder and then asks the form to
// `submit()`. The form raises its one op, `create`, which the dialog answers by
// sending the form's input with the folder to `HostClient.appCreate`; a refusal
// goes back to the form, which shows it in its own error line, and a create that
// landed closes the dialog with the new manifest's path.
//
// Not `close-on-overlay-click`, for the reason `confirm.ts` gives.

import '@stillpointlab/modal-dialog-component';
import { answerOps, fail } from '@stillpointlab/common-format/app';
import { html, render } from '@stillpointlab/common-format/html';

import { words } from '../words';

import type { CannotUndoNotice, HostClient } from '../host-client';
import type { ClientApp } from './registry';
import type { Result } from '@stillpointlab/common-format/app';
import type { ModalDialog } from '@stillpointlab/modal-dialog-component';

/** What the dialog needs of an app's create form. */
interface CreateForm extends HTMLElement {
  setState(state: object): void;
  submit(): Promise<Result>;
}

const FOLDER_ID = 'app-create-folder';
const ERROR_ID = 'app-create-error';
const CONSENT_ID = 'app-create-consent';

/** What a create made: the new manifest's path, and the host's word when it kept no undo step. */
export interface CreatedApp {
  manifestPath: string;
  notice?: CannotUndoNotice;
}

/** Why a folder cannot be created in, or `null`. The server checks again. */
export function createFolderProblem(folder: string): string | null {
  const check = words.apps.create.check;
  if (folder.startsWith('/')) return check.leadingSlash;
  if (folder === '') return null;
  const segments = folder.split('/');
  if (segments.includes('..')) return check.dotDot;
  if (segments.includes('')) return check.empty;
  return null;
}

export class CreateDialog {
  readonly element: ModalDialog;
  private asking = false;

  constructor(
    host: HTMLElement,
    private readonly client: HostClient,
    /** How many listed files a folder holds, at any depth. */
    private readonly filesIn: (folder: string) => number = () => 0
  ) {
    this.element = document.createElement('modal-dialog') as ModalDialog;
    this.element.className = 'app-create';
    host.append(this.element);
  }

  destroy(): void {
    this.element.remove();
  }

  get isOpen(): boolean {
    return this.element.isOpen;
  }

  /**
   * Ask for a new instance of `appId` in a folder, starting at `folder`. Answers
   * the new manifest's path once it is created, with the host's notice when the
   * create was written with no undo step, or `null` when cancelled.
   */
  async open(appId: string, app: ClientApp, folder: string): Promise<CreatedApp | null> {
    const create = app.meta.create;
    if (!create || !app.create || this.asking) return null;
    this.asking = true;
    const dialog = this.element;
    dialog.title = words.apps.create.title(create.noun);
    const help = [
      create.folderHelp,
      create.folderExample ? words.apps.create.folderExample(create.folderExample) : undefined,
      create.rootConsent ? words.apps.create.rootHelp : undefined,
    ]
      .filter((line): line is string => typeof line === 'string' && line !== '')
      .join(' ');
    render(
      dialog,
      html`<div slot="body" class="app-create-body"><div class="form-field"><label class="form-label" for="${FOLDER_ID}">${words.apps.create.folder}</label><input id="${FOLDER_ID}" class="form-input app-create-folder" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="${ERROR_ID}" data-autofocus><p class="form-help">${help}</p><p class="form-help app-create-holds" hidden></p></div>${
        create.rootConsent
          ? html`<div class="app-create-root" hidden><p class="app-create-warning">${create.rootConsent.warning}</p><label class="app-create-consent"><input id="${CONSENT_ID}" type="checkbox"> ${create.rootConsent.confirm}</label></div>`
          : ''
      }<p id="${ERROR_ID}" class="form-message app-create-error" role="alert" hidden></p><div class="app-create-form"></div></div><div slot="footer" class="confirm-actions"><button type="button" class="button" data-answer="cancel">${words.apps.create.cancel}</button><button type="button" class="button button-primary" data-answer="confirm" disabled>${words.apps.create.confirm}</button></div>`
    );
    const input = dialog.querySelector<HTMLInputElement>(`#${FOLDER_ID}`)!;
    const error = dialog.querySelector<HTMLElement>(`#${ERROR_ID}`)!;
    const rootBlock = dialog.querySelector<HTMLElement>('.app-create-root');
    const consent = dialog.querySelector<HTMLInputElement>(`#${CONSENT_ID}`);
    const confirm = dialog.querySelector<HTMLButtonElement>('[data-answer="confirm"]')!;
    input.value = folder;

    const show = (message: string | null): void => {
      error.hidden = message === null;
      error.textContent = message ?? '';
      if (message === null) input.removeAttribute('aria-invalid');
      else input.setAttribute('aria-invalid', 'true');
    };
    const holds = dialog.querySelector<HTMLElement>('.app-create-holds')!;
    const showRoot = (): void => {
      const typed = input.value.trim().replace(/\/+$/, '');
      if (rootBlock) rootBlock.hidden = typed !== '';
      // At the root an app holds only the files it names, so nothing goes behind a row.
      const count = typed === '' || createFolderProblem(typed) !== null ? 0 : this.filesIn(typed);
      holds.hidden = count === 0;
      holds.textContent = count === 0 ? '' : words.apps.create.holdsFiles(count);
    };
    showRoot();

    /** The folder as typed, trimmed and without a trailing slash, or the problem with it. */
    const target = (): { folder: string; confirmRoot?: boolean } | string => {
      const value = input.value.trim().replace(/\/+$/, '');
      const problem = createFolderProblem(value);
      if (problem !== null) return problem;
      if (value === '' && create.rootConsent && !consent?.checked) {
        return words.apps.create.check.consent;
      }
      return value === '' && consent?.checked
        ? { folder: value, confirmRoot: true }
        : { folder: value };
    };

    return new Promise((resolve) => {
      let made: CreatedApp | null = null;
      let form: CreateForm | null = null;
      let stopOps: (() => void) | null = null;
      const listening = new AbortController();
      const { signal } = listening;

      // While the create runs the dialog stays, as the file dialogs do: Escape
      // (heard on the document), the close button and Cancel wait for it. Closed
      // meanwhile, the instance would appear all the same with nothing said.
      // A capturing listener runs before each of them.
      let busy = false;
      window.addEventListener(
        'keydown',
        (event) => {
          if (busy && event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
          }
        },
        { signal, capture: true }
      );
      dialog.addEventListener(
        'click',
        (event) => {
          if (busy) {
            event.preventDefault();
            event.stopPropagation();
          }
        },
        { signal, capture: true }
      );

      const go = async (): Promise<void> => {
        if (!form || confirm.disabled) return;
        const at = target();
        if (typeof at === 'string') {
          show(at);
          input.focus();
          return;
        }
        show(null);
        confirm.disabled = true;
        busy = true;
        dialog.setAttribute('aria-busy', 'true');
        try {
          await form.submit();
        } finally {
          busy = false;
          dialog.removeAttribute('aria-busy');
          if (dialog.isOpen) confirm.disabled = false;
        }
      };

      dialog.addEventListener(
        'click',
        (event) => {
          const button = (event.target as Element).closest<HTMLElement>('[data-answer]');
          if (!button) return;
          if (button.dataset.answer === 'confirm') void go();
          else dialog.close();
        },
        { signal }
      );
      input.addEventListener(
        'keydown',
        (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          void go();
        },
        { signal }
      );
      input.addEventListener(
        'input',
        () => {
          show(null);
          showRoot();
        },
        { signal }
      );
      dialog.addEventListener(
        'modal-closed',
        () => {
          listening.abort();
          stopOps?.();
          this.asking = false;
          resolve(made);
        },
        { signal }
      );
      dialog.open();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);

      void (async () => {
        const holder = dialog.querySelector<HTMLElement>('.app-create-form')!;
        try {
          await app.create!.load();
        } catch (failure) {
          console.error('surfaces: a create form could not load', failure);
          render(holder, html`<p class="form-message">${words.apps.create.loadFailed}</p>`);
          return;
        }
        if (!dialog.isOpen) return;
        form = document.createElement(app.create!.tag) as CreateForm;
        stopOps = answerOps<{
          create: { op: { input: unknown }; reply: { manifestPath: string } };
        }>(form, async (op) => {
          if (op.type !== 'create') return fail('APP_OP_UNKNOWN', `"${op.type}" is not a create.`);
          const at = target();
          if (typeof at === 'string') {
            show(at);
            return fail('HOST_BAD_REQUEST', at);
          }
          const answer = await this.client.appCreate({ app: appId, ...at, input: op.input });
          if (answer.ok) {
            made = {
              manifestPath: answer.manifestPath,
              ...(answer.notice ? { notice: answer.notice } : {}),
            };
            dialog.close();
          }
          return answer;
        });
        holder.replaceChildren(form);
        form.setState({});
        confirm.disabled = false;
      })();
    });
  }
}
