/// <reference lib="dom" />

// `<checkin-review>`: a check-in's review, over a `<modal-dialog>`. The files,
// each with a checkbox (checked) and its label, a moved one as old → new, under
// their groups, with one box to check or uncheck them all; a title and a body;
// the branch, the current one or a new one with its name (only a new one when
// `HEAD` is detached), when the host offers one; and a note above the buttons.
// What it shows is light-DOM content of its dialog, with the classes an app's
// elements borrow from their host (`.button`, `.form-field`, `.form-input`, …),
// so the host's own styles reach it; its own stylesheet is layout alone.
//
// Confirm checks what is missing first (no file, a required title, a new
// branch's name) and says so under the form, with focus on what to fix, so the
// button is never disabled and its reason never hidden. Then it asks the host
// one op, `checkin`, by path (`requestOp`), while the dialog stays open: a
// refusal shows under the form as text, with everything kept; a check-in the
// host took closes it and raises `notification` with the reply's message, and
// `checkin-accepted` with the op and the reply. While the host answers, a
// second confirm, Enter, Escape and the close button do nothing.
//
// `setFiles` while it is open reads the rows again: a row keeps its check, a
// row that went goes, and a row that appeared starts unchecked, so nothing is
// checked in that was not on screen when it was checked. Files set while the
// host answers wait for the answer.
//
// Not `close-on-overlay-click`: a stray click must not drop what was typed.

import '@stillpointlab/modal-dialog-component';
import { requestOp } from '@stillpointlab/common-format/app';
import { defineElement } from '@stillpointlab/common-format/elements';
import { html, render } from '@stillpointlab/common-format/html';

import { checkinOpOf, checkinProblem, groupsOf, rowsFor } from './request';
import { reviewStyles } from './review.styles';

import type {
  CheckinField,
  CheckinFile,
  CheckinInput,
  CheckinOp,
  CheckinReply,
  CheckinRow,
} from './request';
import type { AppShellOps, CheckinBranch, CheckinWords } from '@stillpointlab/common-format/app';
import type { SafeHtml } from '@stillpointlab/common-format/html';

/** What `open` shows. */
export interface CheckinReviewInput {
  files: readonly CheckinFile[];
  words: CheckinWords;
  /** The title the field starts with. */
  title: string;
  titlePlaceholder?: string;
  /** Whether confirm asks for a title before it sends. */
  titleRequired?: boolean;
  /** Offer a branch choice: the current branch (`null` when detached), and whether a new one may be named. */
  branch?: CheckinBranch;
  /** A line above the buttons: "notes.md has unsaved edits, which this does not include." */
  note?: string;
  /** Passed back with the op untouched, for a host that needs the app's own context. */
  context?: Record<string, unknown>;
  /**
   * The field a refusal is about, by its code, so focus goes back there; for any
   * other refusal (and without this) focus goes to the refusal itself.
   */
  refusalField?(code: string): CheckinField | null | undefined;
}

export interface CheckinReviewElement extends HTMLElement {
  open(input: CheckinReviewInput): void;
  /** The files changed while the review is open. Checks are kept as the commit dialog keeps them. */
  setFiles(files: readonly CheckinFile[]): void;
  close(): void;
}

/** Raised (bubbling, composed) when the host took a check-in, `done` or `started`. */
export const CHECKIN_ACCEPTED_EVENT = 'checkin-accepted';

/** The `checkin-accepted` event's detail: what was asked, and what the host answered. */
export interface CheckinAccepted {
  op: CheckinOp;
  reply: CheckinReply;
}

/** The review's own words: none of them depends on what a check-in is to its host. */
export const REVIEW_WORDS = {
  files: 'Files',
  all: 'All',
  chosen: (count: number, total: number) =>
    `${count} of ${total} ${total === 1 ? 'file' : 'files'} chosen`,
  moved: (from: string, to: string) => `${from} → ${to}`,
  branch: 'Branch',
  onCurrent: (branch: string) => `On ${branch}`,
  onNew: 'On a new branch',
  newName: 'New branch name',
  noBranch: 'Name the new branch.',
  notOnBranch: 'Not on a branch.',
  /** The defaults for the host's optional words. */
  busy: 'Working…',
  noFiles: 'Choose at least one file.',
  noTitle: (title: string) => `${title} is missing.`,
  detached: 'HEAD is detached (not on a branch), so this goes on a new branch.',
  nothing: 'No files have changed.',
} as const;

/** What the review needs of its `<modal-dialog>`, without importing its types. */
interface Dialog extends HTMLElement {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  title: string;
}

let instances = 0;

export class CheckinReview extends HTMLElement implements CheckinReviewElement {
  /** Prefixes every id, so two reviews can share a page. */
  private readonly key = `checkin-review-${++instances}`;
  private readonly styleElement: HTMLStyleElement;
  private dialog: Dialog | null = null;
  /** What is open; `null` while closed. */
  private input: CheckinReviewInput | null = null;
  private rows: CheckinRow[] = [];
  private busy = false;
  /** Files set while the host answered, shown once it has. */
  private waiting: readonly CheckinFile[] | null = null;
  private listening: AbortController | null = null;

  constructor() {
    super();
    // As text, never markup.
    this.styleElement = document.createElement('style');
    this.styleElement.textContent = reviewStyles;
    this.addEventListener('click', this.onClick);
    this.addEventListener('keydown', this.onKeydown);
    this.addEventListener('change', this.onChange);
    this.addEventListener('input', this.onInput);
    this.addEventListener('modal-closed', this.onClosed);
  }

  connectedCallback(): void {
    this.ensureDialog();
    this.listening?.abort();
    this.listening = new AbortController();
    const { signal } = this.listening;
    // While the host answers the dialog stays: Escape (heard on the document) and
    // the close button (in the dialog's shadow root) wait. Capturing runs first.
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
    this.addEventListener(
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

  disconnectedCallback(): void {
    this.listening?.abort();
    this.listening = null;
  }

  /** Whether the review is open. */
  get isOpen(): boolean {
    return this.input !== null && this.dialog?.isOpen === true;
  }

  /** Whether the host is answering a check-in. */
  get isBusy(): boolean {
    return this.busy;
  }

  open(input: CheckinReviewInput): void {
    if (this.busy) return;
    const dialog = this.ensureDialog();
    const wasOpen = dialog.isOpen;
    this.input = input;
    this.rows = rowsFor(input.files);
    this.waiting = null;
    dialog.title = input.words.heading;
    this.showForm(input);
    if (wasOpen) this.field('title')?.focus();
    else dialog.open();
  }

  setFiles(files: readonly CheckinFile[]): void {
    if (!this.isOpen) return;
    if (this.busy) {
      this.waiting = files;
      return;
    }
    this.rows = rowsFor(files, this.rows);
    this.showRows();
  }

  /** Close it, without asking anything; an answer already asked for still raises its events. */
  close(): void {
    this.dialog?.close();
  }

  // ---- the markup ----

  private ensureDialog(): Dialog {
    if (!this.dialog) {
      this.dialog = document.createElement('modal-dialog') as Dialog;
      this.dialog.className = 'checkin-review-dialog';
    }
    if (this.styleElement.parentNode !== this) this.prepend(this.styleElement);
    if (this.dialog.parentNode !== this) this.append(this.dialog);
    return this.dialog;
  }

  private idOf(part: string): string {
    return `${this.key}-${part}`;
  }

  private showForm(input: CheckinReviewInput): void {
    const { words, branch, note, titlePlaceholder } = input;
    render(
      this.dialog!,
      html`<div slot="body" class="checkin-review-body">${
        words.help ? html`<p class="form-help checkin-review-help">${words.help}</p>` : ''
      }<fieldset class="checkin-review-files"><legend class="form-label">${REVIEW_WORDS.files}</legend><div class="checkin-review-files-head"><label class="checkin-review-all"><input type="checkbox" class="checkin-review-all-box" aria-describedby="${this.idOf('count')}"> ${REVIEW_WORDS.all}</label><span id="${this.idOf('count')}" class="form-help checkin-review-count"></span></div><ul class="checkin-review-list"></ul></fieldset><div class="form-field"><label class="form-label" for="${this.idOf('title')}">${words.title}</label><input id="${this.idOf('title')}" class="form-input checkin-review-title" type="text" autocomplete="off" aria-describedby="${this.idOf('error')}" ${
        titlePlaceholder ? html`placeholder="${titlePlaceholder}"` : ''
      } data-autofocus></div><div class="form-field"><label class="form-label" for="${this.idOf('body')}">${words.body}</label><textarea id="${this.idOf('body')}" class="form-input checkin-review-text" rows="3"></textarea></div>${
        branch ? this.branchHtml(branch, words) : ''
      }${note ? html`<p class="form-help checkin-review-note">${note}</p>` : ''}<p id="${this.idOf('error')}" class="form-message checkin-review-error" role="alert" tabindex="-1" hidden></p></div><div slot="footer" class="checkin-review-actions"><button type="button" class="button button-secondary" data-answer="cancel">${words.cancel}</button><button type="button" class="button button-primary" data-answer="confirm">${words.confirm}</button></div>`
    );
    // As a property, so what the field holds is never markup.
    this.field('title')!.value = input.title;
    this.showRows();
  }

  private branchHtml(branch: CheckinBranch, words: CheckinWords): SafeHtml {
    const legend = html`<legend class="form-label">${REVIEW_WORDS.branch}</legend>`;
    if (!branch.offerNew) {
      return html`<fieldset class="checkin-review-branch">${legend}<p class="form-help checkin-review-current">${
        branch.current === null ? REVIEW_WORDS.notOnBranch : REVIEW_WORDS.onCurrent(branch.current)
      }</p></fieldset>`;
    }
    const choice = this.idOf('branch-choice');
    const choices =
      branch.current === null
        ? html`<p class="form-help checkin-review-detached">${words.detached ?? REVIEW_WORDS.detached}</p>`
        : html`<label class="checkin-review-choice"><input type="radio" name="${choice}" value="current" checked> ${REVIEW_WORDS.onCurrent(branch.current)}</label><label class="checkin-review-choice"><input type="radio" name="${choice}" value="new"> ${REVIEW_WORDS.onNew}</label>`;
    return html`<fieldset class="checkin-review-branch">${legend}${choices}<input id="${this.idOf('branch')}" class="form-input checkin-review-branch-name" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="${REVIEW_WORDS.newName}" placeholder="${REVIEW_WORDS.newName}" aria-describedby="${this.idOf('error')}"></fieldset>`;
  }

  /** The rows under their groups, the box over them and the count, keeping focus on the row that had it. */
  private showRows(): void {
    const list = this.dialog?.querySelector<HTMLElement>('.checkin-review-list');
    if (!list || !this.input) return;
    const active = document.activeElement as HTMLElement | null;
    const focused = active && list.contains(active) ? (active.dataset.path ?? null) : null;
    const row = ({ row: { file }, index }: { row: CheckinRow; index: number }): SafeHtml =>
      html`<li class="checkin-review-row"><label class="checkin-review-row-label"><input type="checkbox" class="checkin-review-box" data-row="${index}" data-path="${file.path}"><span class="checkin-review-path">${
        file.from === undefined || file.from === file.path
          ? file.path
          : REVIEW_WORDS.moved(file.from, file.path)
      }</span><span class="checkin-review-label" data-label="${file.label}">${file.label}</span></label></li>`;
    render(
      list,
      this.rows.length === 0
        ? html`<li class="form-help checkin-review-nothing">${
            this.input.words.nothing ?? REVIEW_WORDS.nothing
          }</li>`
        : html`${groupsOf(this.rows).map((group) =>
            group.name === null
              ? group.rows.map(row)
              : html`<li class="checkin-review-group"><span class="checkin-review-group-name">${group.name}</span><ul class="checkin-review-group-rows">${group.rows.map(row)}</ul></li>`
          )}`
    );
    for (const box of list.querySelectorAll<HTMLInputElement>('.checkin-review-box')) {
      box.checked = this.rows[Number(box.dataset.row)]?.checked === true;
      if (focused !== null && box.dataset.path === focused) box.focus();
    }
    this.showCount();
  }

  private showCount(): void {
    const chosen = this.rows.filter((row) => row.checked).length;
    const total = this.rows.length;
    const all = this.dialog?.querySelector<HTMLInputElement>('.checkin-review-all-box');
    if (all) {
      all.checked = total > 0 && chosen === total;
      all.indeterminate = chosen > 0 && chosen < total;
    }
    const count = this.dialog?.querySelector<HTMLElement>(`#${this.idOf('count')}`);
    if (count) count.textContent = REVIEW_WORDS.chosen(chosen, total);
  }

  // ---- what is typed and chosen ----

  private field(name: 'title' | 'body' | 'branch'): HTMLInputElement | HTMLTextAreaElement | null {
    return (
      this.dialog?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${this.idOf(name)}`) ??
      null
    );
  }

  /** The new branch's name when one is chosen, else `null`. */
  private chosenBranch(): string | null {
    const branch = this.input?.branch;
    if (!branch?.offerNew) return null;
    const name = this.field('branch')?.value ?? '';
    if (branch.current === null) return name;
    const choice = this.dialog?.querySelector<HTMLInputElement>(
      `input[name="${this.idOf('branch-choice')}"]:checked`
    );
    return choice?.value === 'new' ? name : null;
  }

  private formInput(input: CheckinReviewInput): CheckinInput {
    return {
      rows: this.rows,
      title: this.field('title')?.value ?? '',
      body: this.field('body')?.value ?? '',
      titleRequired: input.titleRequired === true,
      branch: this.chosenBranch(),
      ...(input.context === undefined ? {} : { context: input.context }),
    };
  }

  private problemMessage(field: CheckinField, words: CheckinWords): string {
    if (field === 'files') return words.noFiles ?? REVIEW_WORDS.noFiles;
    if (field === 'title') return words.noTitle ?? REVIEW_WORDS.noTitle(words.title);
    return REVIEW_WORDS.noBranch;
  }

  // ---- asking the host ----

  private async confirm(): Promise<void> {
    const input = this.input;
    if (this.busy || !input) return;
    const form = this.formInput(input);
    const problem = checkinProblem(form);
    if (problem) {
      this.showError(this.problemMessage(problem, input.words));
      this.focusField(problem, true);
      return;
    }
    const op = checkinOpOf(form);
    this.setBusy(true);
    const reply = await requestOp<AppShellOps, 'checkin'>(this, { type: 'checkin', ...op });
    const still = this.input === input;
    if (still) this.setBusy(false);
    else this.busy = false;
    if (reply.ok) {
      const answered: CheckinReply = {
        status: reply.status === 'started' ? 'started' : 'done',
        ...(typeof reply.message === 'string' ? { message: reply.message } : {}),
      };
      if (still) this.close();
      this.dispatchEvent(
        new CustomEvent<CheckinAccepted>(CHECKIN_ACCEPTED_EVENT, {
          detail: { op, reply: answered },
          bubbles: true,
          composed: true,
        })
      );
      if (answered.message) {
        this.dispatchEvent(
          new CustomEvent('notification', {
            detail: {
              message: answered.message,
              type: answered.status === 'done' ? 'success' : 'info',
            },
            bubbles: true,
            composed: true,
          })
        );
      }
      return;
    }
    if (!still) return;
    this.showWaiting();
    this.showError(reply.message);
    this.focusField(input.refusalField?.(reply.code) ?? 'error');
  }

  /** Files that came while the host answered. */
  private showWaiting(): void {
    if (this.waiting === null) return;
    this.rows = rowsFor(this.waiting, this.rows);
    this.waiting = null;
    this.showRows();
  }

  /** A message under the form as text (a host's own words may span lines), or none. */
  private showError(message: string | null): void {
    const error = this.dialog?.querySelector<HTMLElement>(`#${this.idOf('error')}`);
    if (!error) return;
    error.hidden = message === null;
    error.textContent = message ?? '';
    if (message === null) {
      for (const field of this.dialog!.querySelectorAll('[aria-invalid]')) {
        field.removeAttribute('aria-invalid');
      }
    }
  }

  private focusField(field: CheckinField | 'error', invalid = false): void {
    const target =
      field === 'files'
        ? this.dialog?.querySelector<HTMLElement>('.checkin-review-all-box')
        : field === 'error'
          ? this.dialog?.querySelector<HTMLElement>(`#${this.idOf('error')}`)
          : this.field(field);
    if (!target) return;
    if (invalid && field !== 'files') target.setAttribute('aria-invalid', 'true');
    target.focus();
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    const dialog = this.dialog;
    if (!dialog) return;
    if (busy) dialog.setAttribute('aria-busy', 'true');
    else dialog.removeAttribute('aria-busy');
    for (const fieldset of dialog.querySelectorAll<HTMLFieldSetElement>('fieldset')) {
      fieldset.disabled = busy;
    }
    for (const name of ['title', 'body'] as const) {
      const field = this.field(name);
      if (field) field.readOnly = busy;
    }
    for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-answer]')) {
      button.disabled = busy;
    }
    const confirm = dialog.querySelector<HTMLButtonElement>('[data-answer="confirm"]');
    const words = this.input?.words;
    if (confirm && words) {
      confirm.textContent = busy ? (words.busy ?? REVIEW_WORDS.busy) : words.confirm;
    }
  }

  // ---- what the person does ----

  private readonly onClick = (event: MouseEvent): void => {
    const button = (event.target as Element).closest<HTMLElement>('[data-answer]');
    if (!button || !this.dialog?.contains(button) || this.busy) return;
    if (button.dataset.answer === 'confirm') void this.confirm();
    else this.close();
  };

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || !this.input) return;
    const target = event.target as HTMLElement;
    // Enter in a one-line field confirms; in the body, Ctrl+Enter or Cmd+Enter.
    const confirms =
      (target instanceof HTMLInputElement && target.type === 'text') ||
      (target instanceof HTMLTextAreaElement && (event.ctrlKey || event.metaKey));
    if (!confirms || !this.dialog?.contains(target)) return;
    event.preventDefault();
    void this.confirm();
  };

  private readonly onChange = (event: Event): void => {
    const target = event.target;
    if (!this.input || !(target instanceof HTMLInputElement)) return;
    if (target.classList.contains('checkin-review-all-box')) {
      for (const row of this.rows) row.checked = target.checked;
      for (const box of this.dialog!.querySelectorAll<HTMLInputElement>('.checkin-review-box')) {
        box.checked = target.checked;
      }
    } else if (target.classList.contains('checkin-review-box')) {
      const row = this.rows[Number(target.dataset.row)];
      if (row) row.checked = target.checked;
    } else if (target.type !== 'radio') {
      return;
    }
    this.showCount();
    this.showError(null);
  };

  private readonly onInput = (event: Event): void => {
    if (!this.input) return;
    // Typing a name chooses the new branch.
    if ((event.target as Element).id === this.idOf('branch')) {
      const radio = this.dialog?.querySelector<HTMLInputElement>(
        `input[name="${this.idOf('branch-choice')}"][value="new"]`
      );
      if (radio) radio.checked = true;
    }
    this.showError(null);
  };

  /** Closed, by any way: what was open is gone. */
  private readonly onClosed = (event: Event): void => {
    if (!this.dialog || event.target !== this.dialog) return;
    this.input = null;
    this.rows = [];
    this.waiting = null;
    if (this.busy) this.setBusy(false);
    render(this.dialog, html``);
  };
}

defineElement('checkin-review', CheckinReview);
