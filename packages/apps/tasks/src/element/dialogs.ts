/// <reference lib="dom" />
/**
 * The board's four dialogs (phase 7 spec board-dialogs): settings, new card,
 * title and tags, moved from Context Manager's task board page with their ids,
 * copy and behaviour. Each is a `<modal-dialog>` made once and kept in a
 * container the board repaints around, so a board refresh behind an open
 * dialog leaves it, its inputs and its focus alone. Every change is an op the
 * host answers; the dialogs know no endpoints.
 */
import '@stillpointlab/modal-dialog-component';

import { reportError, requestOp } from '@stillpointlab/common-format/app';
import { html, render } from '@stillpointlab/common-format/html';

import { slugifyTaskId, TASKS_ID_MAX_LENGTH } from '../paths.js';

import type { TaskBoardOps } from './task-board.js';
import type {
  SharedTaskKindDescriptor,
  SharedTaskManifestEditOp,
  SharedTasksManifestColumn,
} from '../types.js';
import type { SafeHtml } from '@stillpointlab/common-format/html';
import type { ModalDialog } from '@stillpointlab/modal-dialog-component';

/** What the settings dialog edits: the manifest slice a board state carries. */
export interface BoardSettingsSnapshot {
  columns: SharedTasksManifestColumn[];
  kinds: SharedTaskKindDescriptor[];
  defaultColumn: string;
  doneColumn: string;
}

/** A new card's kind, as the board's "+ New" button names it. */
export interface NewCardRequest {
  boardPath: string;
  kind: string;
  kindDir: string;
  /** Whether the kind creates from a template; template-less kinds start from a stub. */
  templated: boolean;
}

type Notify = (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;

const settingsHtml = (): SafeHtml => html`
  <div slot="body">
    <p class="form-help">
      Changes rewrite <code>tasks.yaml</code> locally and ride your next check-in.
      <strong>Ids are permanent</strong> — labels rename freely; renaming an id is a repository-level
      edit (see <code>docs/guides/tasks-id-rename.md</code>).
    </p>
    <div class="form-field">
      <span class="form-label">Columns</span>
      <div class="board-settings-list" id="board-settings-columns"></div>
      <div class="board-settings-add-line">
        <input type="text" class="form-input" id="board-settings-add-column-label" maxlength="40" placeholder="New column label" autocomplete="off" />
        <input type="text" class="form-input board-settings-add-id" id="board-settings-add-column-id" maxlength="${TASKS_ID_MAX_LENGTH}" placeholder="id" autocomplete="off" autocapitalize="none" spellcheck="false" />
        <button type="button" class="button button-secondary" id="board-settings-add-column">Add column</button>
      </div>
    </div>
    <div class="form-field">
      <span class="form-label">Kinds</span>
      <div class="board-settings-list" id="board-settings-kinds"></div>
      <div class="board-settings-add-line">
        <input type="text" class="form-input" id="board-settings-add-kind-label" maxlength="40" placeholder="New kind label" autocomplete="off" />
        <input type="text" class="form-input board-settings-add-id" id="board-settings-add-kind-id" maxlength="${TASKS_ID_MAX_LENGTH}" placeholder="id" autocomplete="off" autocapitalize="none" spellcheck="false" />
        <button type="button" class="button button-secondary" id="board-settings-add-kind">Add kind</button>
      </div>
      <p class="form-help">A new kind's cards live in its own folder (a “memo” kind uses <code>memos/</code>) and create from a simple stub.</p>
    </div>
    <div class="form-field board-settings-pickers">
      <label>
        <span class="form-label">New cards land in</span>
        <select class="form-input" id="board-settings-default"></select>
      </label>
      <label>
        <span class="form-label">Done column</span>
        <select class="form-input" id="board-settings-done"></select>
      </label>
    </div>
    <p class="form-message" id="board-settings-status" role="status" hidden></p>
  </div>
  <div slot="footer">
    <button class="button button-primary" id="close-board-settings">Done</button>
  </div>`;

const newCardHtml = (): SafeHtml => html`
  <div slot="body">
    <p id="new-brief-description">
      Creates a brief from the repository's brief template in this board's briefs folder. It stays
      local until you check it in.
    </p>
    <div class="form-field">
      <label class="form-label" for="new-brief-title">Title</label>
      <input type="text" class="form-input" id="new-brief-title" maxlength="200" placeholder="My new brief" data-autofocus />
      <p class="form-help">
        Shown on the card and stored as YAML frontmatter. The file name is derived from it
        (snake_case).
      </p>
    </div>
  </div>
  <div slot="footer">
    <button class="button button-secondary" id="cancel-new-brief">Cancel</button>
    <button class="button button-primary" id="confirm-new-brief">Create</button>
  </div>`;

const titleHtml = (): SafeHtml => html`
  <div slot="body">
    <div class="form-field">
      <label class="form-label" for="set-title-input">Title</label>
      <input type="text" class="form-input" id="set-title-input" maxlength="200" data-autofocus />
      <p class="form-help">Stored as YAML frontmatter. Leave blank to remove the title.</p>
    </div>
  </div>
  <div slot="footer">
    <button class="button button-secondary" id="cancel-set-title">Cancel</button>
    <button class="button button-primary" id="confirm-set-title">Save</button>
  </div>`;

const tagsHtml = (): SafeHtml => html`
  <div slot="body">
    <p>
      Tags come from the registry in <code>tasks.yaml</code>. Adding a new one writes it into the
      registry (local until check-in).
    </p>
    <ul id="tag-options" class="tag-options"></ul>
    <div class="form-field tag-add-row">
      <input type="text" class="form-input" id="new-tag-input" maxlength="60" placeholder="Add a new tag…" />
      <button class="button button-secondary" id="add-new-tag" type="button">Add</button>
    </div>
  </div>
  <div slot="footer">
    <button class="button button-secondary" id="cancel-set-tags">Cancel</button>
    <button class="button button-primary" id="confirm-set-tags">Save</button>
  </div>`;

const columnRowHtml = (column: SharedTasksManifestColumn): SafeHtml => html`
  <div class="board-settings-row" data-id="${column.id}">
    <div class="board-settings-row-line">
      <code class="board-settings-id" title="Ids are permanent — see the rename guide">${column.id}</code>
      <input type="text" class="form-input" data-role="label" maxlength="40" value="${column.label}" aria-label="Label for ${column.id}" />
      <button type="button" class="board-settings-remove" data-action="remove" aria-label="Remove column ${column.id}" title="Removable only when no card is in this column">×</button>
    </div>
    <input type="text" class="form-input board-settings-description" data-role="description" maxlength="200" value="${column.description ?? ''}" placeholder="Description (optional)" aria-label="Description for ${column.id}" />
  </div>`;

const kindRowHtml = (kind: SharedTaskKindDescriptor): SafeHtml => html`
  <div class="board-settings-row" data-id="${kind.id}">
    <div class="board-settings-row-line">
      <code class="board-settings-id" title="Ids are permanent — see the rename guide">${kind.id}</code>
      <input type="text" class="form-input" data-role="label" maxlength="40" value="${kind.label}" aria-label="Label for ${kind.id}" />
      <input type="text" class="form-input board-settings-badge" data-role="badge" maxlength="4" value="${kind.badge}" aria-label="Badge for ${kind.id}" />
      <label class="board-settings-creatable" title="Offer this kind on the + New menu">
        <input type="checkbox" data-role="creatable" ${kind.creatable ? html`checked` : html``} aria-label="Creatable ${kind.id}" />
        + New
      </label>
      <button type="button" class="board-settings-remove" data-action="remove" aria-label="Remove kind ${kind.id}" title="Removable only when its folder holds no files (${kind.dir}/)">×</button>
    </div>
  </div>`;

const columnOptionsHtml = (columns: SharedTasksManifestColumn[], selected: string): SafeHtml =>
  html`${columns.map(
    (column) =>
      html`<option value="${column.id}" ${column.id === selected ? html`selected` : html``}>${column.label} (${column.id})</option>`
  )}`;

const tagOptionsHtml = (registry: string[], selected: Set<string>): SafeHtml =>
  html`${registry.map(
    (tag) => html`
      <li>
        <label class="tag-option">
          <input type="checkbox" data-tag="${tag}" ${selected.has(tag.toLowerCase()) ? html`checked` : html``} />
          <span>${tag}</span>
        </label>
      </li>`
  )}`;

/** A dialog made once, with its body and footer. */
function makeDialog(id: string, title: string, body: SafeHtml): ModalDialog {
  const dialog = document.createElement('modal-dialog') as ModalDialog;
  dialog.id = id;
  dialog.setAttribute('title', title);
  render(dialog, body);
  return dialog;
}

/**
 * The board's dialogs and the container that holds them. The board asks for
 * each one; every op goes out through `board`, the element its host answers.
 */
export class BoardDialogs {
  /** Kept as the board's last child across every repaint. */
  readonly container: HTMLElement;

  private readonly settings: ModalDialog;
  private readonly newCard: ModalDialog;
  private readonly title: ModalDialog;
  private readonly tags: ModalDialog;

  /** The settings dialog's manifest slice: from the board on open, then from each reply. */
  private current: BoardSettingsSnapshot | null = null;
  private busy = false;

  private pendingCard: NewCardRequest | null = null;
  private pendingTitlePath: string | null = null;
  private pendingTagsPath: string | null = null;

  constructor(
    private readonly board: HTMLElement,
    private readonly notify: Notify
  ) {
    this.container = document.createElement('div');
    this.container.className = 'board-dialogs';
    this.settings = makeDialog('board-settings-dialog', 'Board settings', settingsHtml());
    this.newCard = makeDialog('new-brief-dialog', 'New brief', newCardHtml());
    this.title = makeDialog('set-title-dialog', 'Set card title', titleHtml());
    this.tags = makeDialog('set-tags-dialog', 'Card tags', tagsHtml());
    this.container.append(this.settings, this.newCard, this.title, this.tags);
    this.wireSettings();
    this.wireNewCard();
    this.wireTitle();
    this.wireTags();
  }

  private find<T extends HTMLElement>(dialog: ModalDialog, id: string): T {
    return dialog.querySelector<T>(`#${id}`)!;
  }

  // ---- Settings (spec tasks_edit #9) ---------------------------------------

  /** Open the settings dialog on a manifest slice. */
  openSettings(snapshot: BoardSettingsSnapshot): void {
    this.current = snapshot;
    this.setStatus('', false);
    this.renderSettings();
    this.settings.open();
  }

  private setStatus(message: string, isError: boolean): void {
    const status = this.find(this.settings, 'board-settings-status');
    status.textContent = message;
    status.hidden = message === '';
    status.classList.toggle('error', isError);
  }

  private renderSettings(): void {
    const current = this.current;
    if (!current) return;
    render(
      this.find(this.settings, 'board-settings-columns'),
      html`${current.columns.map(columnRowHtml)}`
    );
    render(
      this.find(this.settings, 'board-settings-kinds'),
      html`${current.kinds.map(kindRowHtml)}`
    );
    render(
      this.find(this.settings, 'board-settings-default'),
      columnOptionsHtml(current.columns, current.defaultColumn)
    );
    render(
      this.find(this.settings, 'board-settings-done'),
      columnOptionsHtml(current.columns, current.doneColumn)
    );
  }

  /**
   * One manifest edit, one in flight at a time. A refusal (a column that still
   * holds cards, an unpatchable shape) shows the host's message, which carries
   * what the board cannot know, and the rows snap back to the truth.
   */
  private async runEdit(edit: SharedTaskManifestEditOp): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    const res = await requestOp<TaskBoardOps, 'edit-manifest'>(this.board, {
      type: 'edit-manifest',
      edit,
    });
    this.busy = false;
    if (!res.ok) {
      this.setStatus(res.message || 'Could not change the board settings.', true);
      this.renderSettings();
      return false;
    }
    const { manifest } = res;
    this.current = {
      columns: manifest.columns,
      kinds: manifest.kinds,
      defaultColumn: manifest.defaultColumn,
      doneColumn: manifest.doneColumn,
    };
    this.renderSettings();
    this.setStatus('Saved — local until you check it in.', false);
    return true;
  }

  private wireSettings(): void {
    const columnsList = this.find(this.settings, 'board-settings-columns');
    const kindsList = this.find(this.settings, 'board-settings-kinds');

    // Inline edits: change fires on blur or Enter.
    const onListChange = (event: Event): void => {
      const input = event.target as HTMLInputElement;
      const row = input.closest<HTMLElement>('.board-settings-row');
      const id = row?.dataset.id;
      const current = this.current;
      if (!row || !id || !current) return;
      const role = input.dataset.role;
      if (columnsList.contains(row)) {
        const column = current.columns.find((candidate) => candidate.id === id);
        if (!column) return;
        if (role === 'label') {
          const label = input.value.trim();
          if (label === '' || label === column.label) return this.renderSettings();
          void this.runEdit({ op: 'update-column', id, label });
        } else if (role === 'description') {
          const description = input.value.trim();
          if (description === (column.description ?? '')) return;
          void this.runEdit({ op: 'update-column', id, description });
        }
        return;
      }
      const kind = current.kinds.find((candidate) => candidate.id === id);
      if (!kind) return;
      if (role === 'label') {
        const label = input.value.trim();
        if (label === '' || label === kind.label) return this.renderSettings();
        void this.runEdit({ op: 'update-kind', id, label });
      } else if (role === 'badge') {
        const badge = input.value.trim();
        if (badge === '' || badge === kind.badge) return this.renderSettings();
        void this.runEdit({ op: 'update-kind', id, badge });
      } else if (role === 'creatable') {
        void this.runEdit({ op: 'update-kind', id, creatable: input.checked });
      }
    };
    columnsList.addEventListener('change', onListChange);
    kindsList.addEventListener('change', onListChange);

    // Removals: the host owns the emptiness rule; its refusal names the counts.
    const onListClick = (event: Event): void => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action="remove"]');
      const row = button?.closest<HTMLElement>('.board-settings-row');
      const id = row?.dataset.id;
      if (!button || !row || !id) return;
      void this.runEdit(
        columnsList.contains(row) ? { op: 'remove-column', id } : { op: 'remove-kind', id }
      );
    };
    columnsList.addEventListener('click', onListClick);
    kindsList.addEventListener('click', onListClick);

    // Adds: the id follows the label until it is edited, then is permanent.
    const wireAdd = (
      prefix: 'column' | 'kind',
      buildEdit: (id: string, label: string) => SharedTaskManifestEditOp
    ): void => {
      const labelInput = this.find<HTMLInputElement>(
        this.settings,
        `board-settings-add-${prefix}-label`
      );
      const idInput = this.find<HTMLInputElement>(this.settings, `board-settings-add-${prefix}-id`);
      labelInput.addEventListener('input', () => {
        if (idInput.dataset.touched !== '1') idInput.value = slugifyTaskId(labelInput.value);
      });
      idInput.addEventListener('input', () => {
        idInput.dataset.touched = '1';
      });
      this.find(this.settings, `board-settings-add-${prefix}`).addEventListener('click', () => {
        const label = labelInput.value.trim();
        const id = idInput.value.trim();
        if (label === '' || id === '') {
          this.setStatus('Give the new entry a label and an id.', true);
          return;
        }
        void this.runEdit(buildEdit(id, label)).then((done) => {
          if (!done) return;
          labelInput.value = '';
          idInput.value = '';
          delete idInput.dataset.touched;
        });
      });
    };
    wireAdd('column', (id, label) => ({ op: 'add-column', id, label }));
    wireAdd('kind', (id, label) => ({ op: 'add-kind', id, label }));

    const defaultSelect = this.find<HTMLSelectElement>(this.settings, 'board-settings-default');
    const doneSelect = this.find<HTMLSelectElement>(this.settings, 'board-settings-done');
    defaultSelect.addEventListener('change', () => {
      void this.runEdit({ op: 'set-default-column', id: defaultSelect.value });
    });
    doneSelect.addEventListener('change', () => {
      void this.runEdit({ op: 'set-done-column', id: doneSelect.value });
    });

    this.find(this.settings, 'close-board-settings').addEventListener('click', () =>
      this.settings.close()
    );
  }

  // ---- New card --------------------------------------------------------------

  /** Open the new-card dialog for one creatable kind. */
  openNewCard(request: NewCardRequest): void {
    this.pendingCard = request;
    const { kind } = request;
    // One dialog serves every creatable kind, so every word of it is written
    // here rather than fixed for whichever kind came first.
    this.newCard.setAttribute('title', `New ${kind}`);
    const article = /^[aeiou]/.test(kind) ? 'an' : 'a';
    const source = request.templated
      ? `from the repository's ${kind} template`
      : 'as a minimal empty document';
    this.find(this.newCard, 'new-brief-description').textContent =
      `Creates ${article} ${kind} ${source} in this board's ${request.kindDir} folder. It stays local until you check it in.`;
    const input = this.find<HTMLInputElement>(this.newCard, 'new-brief-title');
    input.value = '';
    input.placeholder = `My new ${kind}`;
    this.syncNewCardConfirm();
    this.newCard.open();
  }

  /** A card's file name is derived from its title: nothing to create without one. */
  private syncNewCardConfirm(): void {
    const confirm = this.find<HTMLButtonElement>(this.newCard, 'confirm-new-brief');
    const disabled =
      this.find<HTMLInputElement>(this.newCard, 'new-brief-title').value.trim() === '';
    confirm.disabled = disabled;
    confirm.classList.toggle('disabled', disabled);
  }

  private wireNewCard(): void {
    const input = this.find<HTMLInputElement>(this.newCard, 'new-brief-title');
    input.addEventListener('input', () => this.syncNewCardConfirm());
    this.syncNewCardConfirm();
    this.find(this.newCard, 'cancel-new-brief').addEventListener('click', () =>
      this.newCard.close()
    );
    this.find(this.newCard, 'confirm-new-brief').addEventListener('click', () => {
      const request = this.pendingCard;
      const title = input.value.trim();
      if (!title) return;
      this.newCard.close();
      if (request === null) return;
      void (async () => {
        const res = await requestOp<TaskBoardOps, 'create-card'>(this.board, {
          type: 'create-card',
          boardPath: request.boardPath,
          title,
          kind: request.kind,
        });
        if (!res.ok) {
          reportError('Failed to create card', res);
          this.notify(res.message || `Could not create the ${request.kind}.`, 'error');
          return;
        }
        this.notify(`Created “${res.card.frontmatterTitle ?? res.card.title}”.`, 'success');
      })();
    });
  }

  // ---- Title -------------------------------------------------------------------

  /** Open the title dialog on the title the card shows. */
  openTitle(path: string, currentTitle: string): void {
    this.pendingTitlePath = path;
    const input = this.find<HTMLInputElement>(this.title, 'set-title-input');
    input.value = currentTitle;
    this.title.open();
    input.select();
  }

  private wireTitle(): void {
    const input = this.find<HTMLInputElement>(this.title, 'set-title-input');
    this.find(this.title, 'cancel-set-title').addEventListener('click', () => this.title.close());
    this.find(this.title, 'confirm-set-title').addEventListener('click', () => {
      const path = this.pendingTitlePath;
      const trimmed = input.value.trim();
      this.title.close();
      if (path === null) return;
      void (async () => {
        const res = await requestOp<TaskBoardOps, 'set-title'>(this.board, {
          type: 'set-title',
          path,
          title: trimmed === '' ? null : trimmed,
        });
        if (!res.ok) {
          reportError('Failed to set the card title', res);
          this.notify(res.message || 'Could not set the card title.', 'error');
          return;
        }
        this.notify(trimmed ? 'Title updated.' : 'Title removed.', 'success');
      })();
    });
  }

  // ---- Tags --------------------------------------------------------------------

  /** Open the tags dialog on the registry, the card's tags checked. */
  openTags(path: string, currentTags: string[], registry: string[]): void {
    this.pendingTagsPath = path;
    this.renderTagOptions(registry, new Set(currentTags.map((tag) => tag.toLowerCase())));
    this.find<HTMLInputElement>(this.tags, 'new-tag-input').value = '';
    this.tags.open();
  }

  private renderTagOptions(registry: string[], selected: Set<string>): void {
    render(this.find(this.tags, 'tag-options'), tagOptionsHtml(registry, selected));
  }

  private checkedTags(): string[] {
    return [
      ...this.find(this.tags, 'tag-options').querySelectorAll<HTMLInputElement>('input:checked'),
    ].map((input) => input.dataset.tag ?? '');
  }

  private wireTags(): void {
    const newTag = this.find<HTMLInputElement>(this.tags, 'new-tag-input');
    // A new tag goes into the registry at once; the card's tags wait for Save.
    this.find(this.tags, 'add-new-tag').addEventListener('click', () => {
      const tag = newTag.value.trim();
      if (!tag) return;
      void (async () => {
        const res = await requestOp<TaskBoardOps, 'add-tag'>(this.board, { type: 'add-tag', tag });
        if (!res.ok) {
          reportError('Failed to add the tag', res);
          this.notify(res.message || 'Could not add the tag.', 'error');
          return;
        }
        // The fresh registry, the checks kept and the new tag checked.
        const selected = new Set(this.checkedTags().map((checked) => checked.toLowerCase()));
        selected.add(tag.toLowerCase());
        this.renderTagOptions(res.tags, selected);
        newTag.value = '';
      })();
    });
    this.find(this.tags, 'cancel-set-tags').addEventListener('click', () => this.tags.close());
    this.find(this.tags, 'confirm-set-tags').addEventListener('click', () => {
      const path = this.pendingTagsPath;
      const tags = this.checkedTags();
      this.tags.close();
      if (path === null) return;
      void (async () => {
        const res = await requestOp<TaskBoardOps, 'set-tags'>(this.board, {
          type: 'set-tags',
          path,
          tags,
        });
        if (!res.ok) {
          reportError('Failed to set the card tags', res);
          this.notify(res.message || 'Could not set the card tags.', 'error');
          return;
        }
        this.notify('Tags updated.', 'success');
      })();
    });
  }
}
