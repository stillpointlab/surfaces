/// <reference lib="dom" />
/**
 * `<spl-tasks-create>`: a tasks manifest's own fields for a create (spec
 * create-from-the-app): its columns and kinds, each id derived from its label
 * until the id is edited by hand. Ids are permanent once created (ADR-0028
 * decision 5), which the form says where they are edited. The host lays it out
 * in its create dialog beside the folder and the root consent, which it owns,
 * and answers its one op, `create`, by creating the manifest in that folder.
 *
 * The checks are `checkTasksCreate` (`./create`), which the core's plan runs
 * too. The form shows the first problem on submit, and any refusal its host
 * hands back, in its error line.
 */
import { createReadyGate, fail, ok, requestOp } from '@stillpointlab/common-format/app';
import { defineElement } from '@stillpointlab/common-format/elements';
import { html, render } from '@stillpointlab/common-format/html';

import {
  checkTasksCreate,
  slugifyTaskId,
  TASKS_CREATE_DEFAULT_COLUMNS,
  TASKS_CREATE_DEFAULT_KINDS,
  TASKS_DESCRIPTION_MAX_LENGTH,
  TASKS_ID_MAX_LENGTH,
  TASKS_LABEL_MAX_LENGTH,
} from '../createRules.js';

import { createStyles } from './create.styles';

import type { TasksCreateField, TasksCreateFields } from '../createRules.js';
import type { AppElement, Failure, Result } from '@stillpointlab/common-format/app';
import type { SafeHtml } from '@stillpointlab/common-format/html';

/** What the form starts with: column and kind labels. Left out, the defaults. */
export interface TasksCreateState {
  columns?: string[];
  kinds?: string[];
}

/** The form's op: create a manifest with these columns and kinds, in the host's folder. */
export type TasksCreateOps = {
  create: { op: { input: TasksCreateFields }; reply: object };
};

/** Raised (bubbling) when the form's fields go from valid to invalid or back. */
export const CREATE_VALIDITY_EVENT = 'create-validity';

type ListKind = 'columns' | 'kinds';

/** One label+id row; columns add a description line. */
function idRow(list: ListKind, label = ''): SafeHtml {
  const placeholder = list === 'columns' ? 'Todo' : 'Task';
  return html`<div class="create-tasks-row"><div class="create-tasks-row-line"><input type="text" class="form-input" placeholder="${placeholder}" maxlength="${TASKS_LABEL_MAX_LENGTH}" autocomplete="off" data-role="label" value="${label}" /><input type="text" class="form-input create-tasks-id-input" placeholder="id" maxlength="${TASKS_ID_MAX_LENGTH}" autocomplete="off" autocapitalize="none" spellcheck="false" data-role="id" title="Permanent once created — labels can be renamed later, ids cannot." value="${slugifyTaskId(label)}" /><button type="button" class="create-tasks-remove" data-action="remove-row" aria-label="Remove ${placeholder}">×</button></div>${list === 'columns' ? html`<input type="text" class="form-input create-tasks-description-input" placeholder="Description (optional)" maxlength="${TASKS_DESCRIPTION_MAX_LENGTH}" autocomplete="off" data-role="description" />` : ''}</div>`;
}

function appendRow(list: HTMLElement, row: SafeHtml): HTMLElement {
  const holder = document.createElement('div');
  render(holder, row);
  const element = holder.firstElementChild as HTMLElement;
  list.appendChild(element);
  return element;
}

interface RowValue {
  id: string;
  label: string;
  description?: string;
}

export class TasksCreate extends HTMLElement implements AppElement<TasksCreateState> {
  private state: TasksCreateState | undefined = undefined;
  private readonly ready = createReadyGate(this);
  private valid: boolean | null = null;
  private pending: Promise<Result> | null = null;

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  /** Start the form over with these labels. */
  setState(state: TasksCreateState): void {
    this.state = state;
    this.paint();
  }

  connectedCallback(): void {
    this.addEventListener('click', this.handleClick);
    this.addEventListener('input', this.handleInput);
    this.addEventListener('keydown', this.handleKeydown);
    this.paint();
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.handleClick);
    this.removeEventListener('input', this.handleInput);
    this.removeEventListener('keydown', this.handleKeydown);
    this.ready.begin();
  }

  /** Focus the first column's label. */
  override focus(): void {
    this.querySelector<HTMLInputElement>('#create-tasks-columns [data-role="label"]')?.focus();
  }

  /** The fields as a create's input, or the first problem with them. */
  value(): Result<{ input: TasksCreateFields }> {
    const columnsList = this.list('columns');
    const kindsList = this.list('kinds');
    if (!columnsList || !kindsList) {
      return fail('TASKS_CREATE_NOT_READY', 'The form has not rendered yet.');
    }
    const input: TasksCreateFields = {
      columns: this.rows(columnsList).map((row) => ({
        id: row.id,
        label: row.label,
        ...(row.description !== undefined ? { description: row.description } : {}),
      })),
      kinds: this.rows(kindsList).map((row) => ({ id: row.id, label: row.label })),
    };
    const checked = checkTasksCreate(input);
    return checked.ok ? ok({ input }) : checked;
  }

  /**
   * Show a refusal in the form's error line, marking the row it names
   * (`details[0]`, as `checkTasksCreate` gives it), if any.
   */
  showError(failure: Failure): void {
    this.clearError();
    const error = this.querySelector<HTMLElement>('#create-tasks-error');
    if (error) {
      error.textContent = failure.message;
      error.hidden = false;
    }
    const field = this.fieldOf(failure.details?.[0]);
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
  }

  /** Hide the error line and unmark the fields. */
  clearError(): void {
    const error = this.querySelector<HTMLElement>('#create-tasks-error');
    if (error) {
      error.hidden = true;
      error.textContent = '';
    }
    for (const marked of this.querySelectorAll('[aria-invalid]')) {
      marked.removeAttribute('aria-invalid');
    }
  }

  /**
   * Ask the host to create: the first problem shows instead when the fields
   * are not valid, and a refusal shows when the host answers one. A second
   * submit while one is out answers the first's result.
   */
  submit(): Promise<Result> {
    if (this.pending) return this.pending;
    const value = this.value();
    if (!value.ok) {
      this.showError(value);
      return Promise.resolve(value);
    }
    this.clearError();
    this.pending = requestOp<TasksCreateOps, 'create'>(this, {
      type: 'create',
      input: value.input,
    }).then((reply) => {
      this.pending = null;
      if (!reply.ok) this.showError(reply);
      return reply;
    });
    return this.pending;
  }

  private list(kind: ListKind): HTMLElement | null {
    return this.querySelector<HTMLElement>(`#create-tasks-${kind}`);
  }

  private paint(): void {
    if (!this.isConnected || this.state === undefined) return;
    const columns = this.state.columns ?? TASKS_CREATE_DEFAULT_COLUMNS;
    const kinds = this.state.kinds ?? TASKS_CREATE_DEFAULT_KINDS;
    render(
      this,
      html`<div class="form-field"><span class="form-label">Columns</span><div class="create-tasks-list" id="create-tasks-columns">${columns.length > 0 ? columns.map((label) => idRow('columns', label)) : idRow('columns')}</div><button type="button" class="button button-secondary" id="create-tasks-add-column">Add another column</button><p class="form-help">Board lanes, in order. Labels can be renamed later; <strong>ids are permanent</strong>.</p></div>
<div class="form-field"><span class="form-label">Kinds</span><div class="create-tasks-list" id="create-tasks-kinds">${kinds.length > 0 ? kinds.map((label) => idRow('kinds', label)) : idRow('kinds')}</div><button type="button" class="button button-secondary" id="create-tasks-add-kind">Add another kind</button><p class="form-help">Document types the board creates — each gets its own folder (<code>tasks/</code> for a “task” kind). New cards start from a simple stub.</p></div>
<p class="form-message error" id="create-tasks-error" role="alert" hidden></p>`
    );
    const style = document.createElement('style');
    style.textContent = createStyles;
    this.prepend(style);
    this.pending = null;
    this.valid = null;
    this.ready.settle();
  }

  /** A list's rows; an untouched spare row (no label, no id) is left out. */
  private rows(list: HTMLElement): RowValue[] {
    const rows: RowValue[] = [];
    for (const row of list.querySelectorAll<HTMLElement>('.create-tasks-row')) {
      const label = row.querySelector<HTMLInputElement>('[data-role="label"]')?.value.trim() ?? '';
      const id = row.querySelector<HTMLInputElement>('[data-role="id"]')?.value.trim() ?? '';
      const description =
        row.querySelector<HTMLInputElement>('[data-role="description"]')?.value.trim() ?? '';
      if (label === '' && id === '') continue;
      rows.push({ label, id, ...(description !== '' ? { description } : {}) });
    }
    return rows;
  }

  /** Tell the host when the fields' validity changes. */
  private announceValidity(): void {
    const valid = this.value().ok;
    if (valid === this.valid) return;
    this.valid = valid;
    this.dispatchEvent(
      new CustomEvent(CREATE_VALIDITY_EVENT, { detail: { valid }, bubbles: true, composed: true })
    );
  }

  /** The row a refusal names, by its index among the rows `value()` read. */
  private fieldOf(where: unknown): HTMLElement | null {
    if (typeof where !== 'object' || where === null || !('field' in where)) return null;
    const { field, index } = where as TasksCreateField;
    if (field !== 'columns' && field !== 'kinds') return null;
    const list = this.list(field);
    if (!list) return null;
    const filled = [...list.querySelectorAll<HTMLElement>('.create-tasks-row')].filter((row) => {
      const label = row.querySelector<HTMLInputElement>('[data-role="label"]')?.value.trim();
      const id = row.querySelector<HTMLInputElement>('[data-role="id"]')?.value.trim();
      return label !== '' || id !== '';
    });
    const row = filled[index ?? 0];
    if (!row) return null;
    const label = row.querySelector<HTMLInputElement>('[data-role="label"]');
    // An id refusal is about the id; anything else about the label.
    const idField = row.querySelector<HTMLInputElement>('[data-role="id"]');
    return label?.value.trim() === '' ? label : (idField ?? label);
  }

  private readonly handleClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    for (const kind of ['columns', 'kinds'] as const) {
      const add = kind === 'columns' ? '#create-tasks-add-column' : '#create-tasks-add-kind';
      if (target.closest(add)) {
        const list = this.list(kind);
        if (list) {
          // An added row suggests the next likely entry, not the first.
          const placeholder = kind === 'columns' ? 'Review' : 'Note';
          const row = appendRow(list, idRow(kind));
          row
            .querySelector('[data-action="remove-row"]')
            ?.setAttribute('aria-label', `Remove ${placeholder}`);
          const label = row.querySelector<HTMLInputElement>('[data-role="label"]');
          if (label) {
            label.placeholder = placeholder;
            label.focus();
          }
        }
        return;
      }
    }
    const remove = target.closest('[data-action="remove-row"]');
    if (!remove) return;
    const list = remove.closest<HTMLElement>('.create-tasks-list');
    remove.closest('.create-tasks-row')?.remove();
    // Never leave a list with no way back: keep one empty row.
    if (list && list.querySelector('.create-tasks-row') === null) {
      appendRow(list, idRow(list.id === 'create-tasks-columns' ? 'columns' : 'kinds'));
    }
    this.announceValidity();
  };

  /** The id follows its label until it is edited by hand; from then on it is the user's. */
  private readonly handleInput = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.dataset.role === 'id') {
      target.dataset.touched = '1';
    } else if (target instanceof HTMLInputElement && target.dataset.role === 'label') {
      const id = target
        .closest('.create-tasks-row')
        ?.querySelector<HTMLInputElement>('[data-role="id"]');
      if (id && id.dataset.touched !== '1') id.value = slugifyTaskId(target.value);
    }
    this.announceValidity();
  };

  /** Enter in a text field submits, as the host's other dialogs do. */
  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return;
    if (event.target.type === 'checkbox') return;
    event.preventDefault();
    void this.submit();
  };
}

defineElement('spl-tasks-create', TasksCreate);
