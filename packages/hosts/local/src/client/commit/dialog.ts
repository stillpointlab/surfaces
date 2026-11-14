// The commit dialog, over a `<modal-dialog>`: the changed files, each with a
// checkbox (checked) and its status, a moved file as old → new, with one box to
// check or uncheck them all; a summary (required) and details; and the branch,
// the current one or a new one with its name (only a new one when `HEAD` is
// detached). It says when the open file has unsaved edits, which a commit does
// not take.
//
// Commit checks what is missing first (no file, no summary, no branch name) and
// says so under the form, with focus back on what to fix; so the button is never
// disabled and its reason is never hidden. Then it asks the host
// (`client.commit`, a function of `{ paths, message, branch? }` alone) while the
// dialog stays open: a refusal shows under the form as text, git's own words
// included, with everything kept as it was; only a commit that landed closes it.
// While a commit runs, a second confirm, Enter, Escape and the close button do
// nothing, as in `file-ops/dialog.ts`.
//
// The rows come from `client.changes()` when it opens. If the changes move while
// it is open (`changesMoved`, on the host's events), they are read again: a row
// keeps its check, a row that went goes, and a row that appeared starts
// unchecked, so nothing is committed that was not on screen when it was checked.
//
// Not `close-on-overlay-click`, for the reason `confirm.ts` gives.

import '@stillpointlab/modal-dialog-component';
import { html, render } from '@stillpointlab/common-format/html';

import { words } from '../words';

import { commitProblem, rowsFor, requestOf } from './request';

import type { HostClient } from '../host-client';
import type { CommitInput, CommitRow } from './request';
import type { HostCommit } from '@stillpointlab/common-format/host';
import type { ModalDialog } from '@stillpointlab/modal-dialog-component';

export interface CommitDialogContext {
  client: HostClient;
  /** The open file's name when it has unsaved edits, which a commit does not take. */
  unsaved(): string | null;
}

const ID = {
  summary: 'commit-summary',
  details: 'commit-details',
  name: 'commit-branch-name',
  error: 'commit-error',
  count: 'commit-count',
} as const;

export class CommitDialog {
  readonly element: ModalDialog;
  private busy = false;
  private asking = false;
  /** The rows shown, while the form is. */
  private rows: CommitRow[] | null = null;
  /** The current branch, or null when `HEAD` is detached. */
  private branch: string | null = null;
  private reading: Promise<void> | null = null;
  private readAgain = false;
  private readonly listening = new AbortController();

  constructor(
    host: HTMLElement,
    private readonly context: CommitDialogContext
  ) {
    this.element = document.createElement('modal-dialog') as ModalDialog;
    this.element.className = 'commit';
    host.append(this.element);
    const { signal } = this.listening;
    // While a commit runs the dialog stays: Escape (heard on the document) and the
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

  get isOpen(): boolean {
    return this.element.isOpen;
  }

  destroy(): void {
    this.listening.abort();
    this.element.remove();
  }

  /** Open it; resolves with the commit made, or null when it closed without one. */
  open(): Promise<HostCommit | null> {
    if (this.asking) return Promise.resolve(null);
    this.asking = true;
    const dialog = this.element;
    dialog.title = words.commit.title;
    this.rows = null;
    this.showMessage(words.commit.loading);

    return new Promise((resolve) => {
      let landed: HostCommit | null = null;
      const listening = new AbortController();
      const { signal } = listening;

      const go = async () => {
        if (this.busy || this.rows === null) return;
        const input = this.input();
        const problem = commitProblem(input);
        if (problem) {
          this.showError(problem.message);
          this.focusField(problem.field);
          return;
        }
        this.setBusy(true);
        let message: string;
        let code = '';
        try {
          const answer = await this.context.client.commit(requestOf(input));
          if (answer.ok) {
            landed = answer;
            this.setBusy(false);
            dialog.close();
            return;
          }
          message = answer.message;
          code = answer.code;
        } catch (error) {
          message = String(error);
        }
        this.setBusy(false);
        this.showError(message);
        if (code === 'HOST_NOT_CHANGED') void this.changesMoved();
        this.focusField(
          code.startsWith('HOST_BRANCH_')
            ? 'branch'
            : code === 'HOST_COMMIT_NO_MESSAGE'
              ? 'summary'
              : code === 'HOST_COMMIT_NO_PATHS'
                ? 'files'
                : 'error'
        );
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
          if (event.key !== 'Enter') return;
          const target = event.target as HTMLElement;
          // Enter in a one-line field commits; in the details, Ctrl+Enter or Cmd+Enter.
          const field =
            (target instanceof HTMLInputElement && target.type === 'text') ||
            (target instanceof HTMLTextAreaElement && (event.ctrlKey || event.metaKey));
          if (!field) return;
          event.preventDefault();
          void go();
        },
        { signal }
      );
      dialog.addEventListener('change', (event) => this.onChange(event.target as Element), {
        signal,
      });
      dialog.addEventListener(
        'input',
        (event) => {
          // Typing a name chooses the new branch.
          if ((event.target as Element).id === ID.name) {
            const radio = dialog.querySelector<HTMLInputElement>('input[value="new"]');
            if (radio) radio.checked = true;
          }
          this.showError(null);
        },
        { signal }
      );
      dialog.addEventListener(
        'modal-closed',
        () => {
          listening.abort();
          this.setBusy(false);
          this.asking = false;
          this.rows = null;
          resolve(landed);
        },
        { signal }
      );
      dialog.open();
      void this.read(true);
    });
  }

  /** The changes may have moved: read them again while the form shows, keeping what is checked. */
  changesMoved(): Promise<void> {
    if (!this.isOpen || this.busy || this.rows === null) return Promise.resolve();
    return this.read(false);
  }

  /** Read the branch and the changes, and show the form (`first`) or its rows again. */
  private read(first: boolean): Promise<void> {
    if (this.reading) {
      this.readAgain = true;
      return this.reading;
    }
    this.reading = (async () => {
      do {
        this.readAgain = false;
        const { client } = this.context;
        let failed: string | null = null;
        let changes: CommitRow['change'][] = [];
        try {
          const [git, read] = await Promise.all([client.git(), client.changes()]);
          if (read.ok) {
            changes = read.changes;
            this.branch = git.branch;
          } else failed = read.message;
        } catch (error) {
          failed = String(error);
        }
        if (!this.asking || this.busy) return;
        if (failed !== null) {
          if (first) this.showMessage(words.commit.readFailed(failed));
          else this.showError(words.commit.readFailed(failed));
        } else if (changes.length === 0) {
          this.rows = null;
          this.showMessage(words.commit.nothing);
        } else if (first || this.rows === null) {
          this.rows = rowsFor(changes);
          this.showForm();
          // The form replaced what had focus while the changes were read.
          this.focusField('summary');
        } else {
          this.rows = rowsFor(changes, this.rows);
          this.showRows();
        }
        first = false;
      } while (this.readAgain);
    })().finally(() => (this.reading = null));
    return this.reading;
  }

  /** A message in place of the form, and Close. */
  private showMessage(message: string): void {
    render(
      this.element,
      html`<div slot="body" class="commit-body"><p class="commit-message">${message}</p></div><div slot="footer" class="confirm-actions"><button type="button" class="button" data-answer="cancel" data-autofocus>${words.commit.close}</button></div>`
    );
  }

  private showForm(): void {
    const unsaved = this.context.unsaved();
    const branch = this.branch;
    const choice =
      branch === null
        ? html`<p class="commit-note">${words.commit.detached}</p><input type="hidden" name="commit-branch" value="new">`
        : html`<label class="commit-choice"><input type="radio" name="commit-branch" value="current"> ${words.commit.onCurrent(branch)}</label><label class="commit-choice"><input type="radio" name="commit-branch" value="new"> ${words.commit.onNew}</label>`;
    render(
      this.element,
      html`<div slot="body" class="commit-body"><fieldset class="commit-files"><legend class="commit-legend">${words.commit.files}</legend><div class="commit-files-head"><label class="commit-all"><input type="checkbox" class="commit-all-box" aria-describedby="${ID.count}"> ${words.commit.all}</label><span id="${ID.count}" class="commit-count"></span></div><ul class="commit-list"></ul></fieldset><label class="commit-label" for="${ID.summary}">${words.commit.summary}</label><input id="${ID.summary}" class="commit-field" type="text" autocomplete="off" aria-describedby="${ID.error}" data-autofocus><label class="commit-label" for="${ID.details}">${words.commit.details}</label><textarea id="${ID.details}" class="commit-field commit-details" rows="3"></textarea><fieldset class="commit-branch"><legend class="commit-legend">${words.commit.branch}</legend>${choice}<input id="${ID.name}" class="commit-field" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="${words.commit.newName}" placeholder="${words.commit.newName}" aria-describedby="${ID.error}"></fieldset>${
        unsaved === null
          ? ''
          : html`<p class="commit-note commit-unsaved">${words.commit.unsaved(unsaved)}</p>`
      }<p id="${ID.error}" class="commit-error" role="alert" tabindex="-1" hidden></p></div><div slot="footer" class="confirm-actions"><button type="button" class="button" data-answer="cancel">${words.commit.cancel}</button><button type="button" class="button button-primary" data-answer="confirm">${words.commit.confirm}</button></div>`
    );
    const current = this.element.querySelector<HTMLInputElement>('input[value="current"]');
    if (current) current.checked = true;
    this.showRows();
  }

  /** The rows, the box over them and the count, keeping focus on the row that had it. */
  private showRows(): void {
    const rows = this.rows ?? [];
    const list = this.element.querySelector<HTMLElement>('.commit-list');
    if (!list) return;
    const active = document.activeElement as HTMLElement | null;
    const focused = active && list.contains(active) ? (active.dataset.path ?? null) : null;
    render(
      list,
      html`${rows.map(
        ({ change }, index) =>
          html`<li class="commit-row"><label class="commit-row-label"><input type="checkbox" class="commit-box" data-row="${index}" data-path="${change.path}"><span class="commit-status" data-status="${change.status}">${words.commit.status[change.status]}</span><span class="commit-path">${
            change.from === undefined ? change.path : words.commit.moved(change.from, change.path)
          }</span></label></li>`
      )}`
    );
    const boxes = list.querySelectorAll<HTMLInputElement>('.commit-box');
    boxes.forEach((box, index) => {
      box.checked = rows[index].checked;
      if (focused !== null && box.dataset.path === focused) box.focus();
    });
    this.showCount();
  }

  private showCount(): void {
    const rows = this.rows ?? [];
    const chosen = rows.filter((row) => row.checked).length;
    const all = this.element.querySelector<HTMLInputElement>('.commit-all-box');
    if (all) {
      all.checked = chosen === rows.length && rows.length > 0;
      all.indeterminate = chosen > 0 && chosen < rows.length;
    }
    const count = this.element.querySelector<HTMLElement>(`#${ID.count}`);
    if (count) count.textContent = words.commit.chosen(chosen, rows.length);
  }

  private onChange(target: Element): void {
    if (!this.rows || !(target instanceof HTMLInputElement)) return;
    if (target.classList.contains('commit-all-box')) {
      for (const row of this.rows) row.checked = target.checked;
      for (const box of this.element.querySelectorAll<HTMLInputElement>('.commit-box')) {
        box.checked = target.checked;
      }
      this.showCount();
    } else if (target.classList.contains('commit-box')) {
      const row = this.rows[Number(target.dataset.row)];
      if (row) row.checked = target.checked;
      this.showCount();
    } else {
      return;
    }
    this.showError(null);
  }

  /** What the form holds now. */
  private input(): CommitInput {
    const value = (id: string) =>
      this.element.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)?.value ?? '';
    const chosen = this.element.querySelector<HTMLInputElement>(
      'input[name="commit-branch"]:checked, input[name="commit-branch"][type="hidden"]'
    );
    return {
      rows: this.rows ?? [],
      summary: value(ID.summary),
      details: value(ID.details),
      branch: chosen?.value === 'new' ? value(ID.name) : null,
    };
  }

  /** Show a message under the form as text (git's own words may span lines), or hide it. */
  private showError(message: string | null): void {
    const error = this.element.querySelector<HTMLElement>(`#${ID.error}`);
    if (!error) return;
    error.hidden = message === null;
    error.textContent = message ?? '';
  }

  private focusField(field: 'files' | 'summary' | 'branch' | 'error'): void {
    const target =
      field === 'files'
        ? this.element.querySelector<HTMLElement>('.commit-all-box')
        : field === 'summary'
          ? this.element.querySelector<HTMLElement>(`#${ID.summary}`)
          : field === 'branch'
            ? this.element.querySelector<HTMLElement>(`#${ID.name}`)
            : this.element.querySelector<HTMLElement>(`#${ID.error}`);
    target?.focus();
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    const dialog = this.element;
    if (busy) dialog.setAttribute('aria-busy', 'true');
    else dialog.removeAttribute('aria-busy');
    for (const fieldset of dialog.querySelectorAll<HTMLFieldSetElement>('fieldset')) {
      fieldset.disabled = busy;
    }
    for (const field of dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      `#${ID.summary}, #${ID.details}`
    )) {
      field.readOnly = busy;
    }
    for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-answer]')) {
      button.disabled = busy;
    }
    const confirm = dialog.querySelector<HTMLButtonElement>('[data-answer="confirm"]');
    if (confirm) confirm.textContent = busy ? words.commit.committing : words.commit.confirm;
  }
}
