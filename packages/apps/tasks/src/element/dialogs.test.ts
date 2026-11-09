// @vitest-environment jsdom
/// <reference lib="dom" />
import { answerOps, fail, ok, setErrorHandler } from '@stillpointlab/common-format/app';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './task-board.js';
import { BUILTIN_TASK_KINDS } from '../types.js';

import type { TaskBoard, TaskBoardOps } from './task-board.js';
import type { SharedTaskBoardState, SharedTaskStageState, SharedTasksManifest } from '../types.js';
import type { AppOp, Result } from '@stillpointlab/common-format/app';

// The board's dialogs (spec board-dialogs). The settings cases moved from
// Context Manager's boardSettings.test.ts, answering ops where they mocked
// apiFetch; new card, title and tags are tested here for the first time.

const host = vi.fn<(op: AppOp<TaskBoardOps>) => Promise<Result<object>>>();
const reported = vi.fn();
const notified = vi.fn();

const BOARD = 'docs/tasks/stage1/phase1';
const CARD = `${BOARD}/specs/login.md`;

const STATE: SharedTaskBoardState = {
  board: { path: BOARD, label: 'Stage 1 — Phase 1', paths: {} },
  columns: [
    { id: 'todo', label: 'Todo' },
    { id: 'doing', label: 'Doing', description: 'Underway.' },
  ],
  cards: [
    {
      goodId: 1,
      goodPublicId: null,
      title: 'login.md',
      frontmatterTitle: 'Login flow',
      path: CARD,
      kind: 'spec',
      column: 'todo',
      dirty: false,
      changed: false,
      tags: ['infra'],
    },
  ],
  pool: { path: 'docs/tasks/unassigned', orderPath: 'docs/tasks/unassigned/order.yaml', cards: [] },
  housekeeping: [],
  tags: ['infra', 'ui'],
  defaultColumn: 'todo',
  doneColumn: 'doing',
  kinds: [
    { id: 'spike', label: 'Spike', badge: 's', dir: 'spikes', creatable: true },
    ...BUILTIN_TASK_KINDS.filter((kind) => kind.id !== 'spike').map((kind) =>
      kind.id === 'brief' ? { ...kind, template: 'docs/tasks/brief.template.md' } : { ...kind }
    ),
  ],
};

/** A manifest as an edit's reply carries it, from the state with `overrides`. */
const manifest = (overrides: Partial<SharedTasksManifest> = {}): SharedTasksManifest => ({
  version: 1,
  frontmatterKey: 'column',
  columns: STATE.columns,
  kinds: STATE.kinds,
  defaultColumn: STATE.defaultColumn,
  doneColumn: STATE.doneColumn,
  tags: STATE.tags,
  ...overrides,
});

const mount = (variant: 'board' | 'stage' = 'board'): TaskBoard => {
  const el = document.createElement('spl-task-board') as TaskBoard;
  el.setAttribute('storage-key', 'dialogs-test');
  if (variant === 'stage') el.setAttribute('variant', 'stage');
  document.body.appendChild(el);
  el.addEventListener('notification', (event) => notified((event as CustomEvent).detail));
  if (variant === 'board') el.setState(structuredClone(STATE));
  return el;
};

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const $ = <T extends HTMLElement>(el: TaskBoard, selector: string): T =>
  el.querySelector<T>(selector)!;
const isOpen = (el: TaskBoard, id: string): boolean => $(el, `#${id}`).hasAttribute('is-open');

/** Answer the next op with `result`. */
const answerNext = (result: Result<object>): void => {
  host.mockImplementationOnce(() => Promise.resolve(result));
};

const opsOf = (type: string): unknown[] =>
  host.mock.calls.map(([op]) => op).filter((op) => op.type === type);

beforeEach(() => {
  host.mockImplementation(() => new Promise(() => {}));
  setErrorHandler((message) => reported(message));
});

let stopHost: () => void = () => {};
beforeEach(() => {
  stopHost = answerOps<TaskBoardOps>(document, (op) => host(op));
});

afterEach(() => {
  stopHost();
  document.body.innerHTML = '';
  host.mockReset();
  reported.mockReset();
  notified.mockReset();
});

describe('board settings', () => {
  const columnRow = (el: TaskBoard, id: string): HTMLElement =>
    $(el, `#board-settings-columns .board-settings-row[data-id="${id}"]`);
  const kindRow = (el: TaskBoard, id: string): HTMLElement =>
    $(el, `#board-settings-kinds .board-settings-row[data-id="${id}"]`);
  const changeInput = (row: HTMLElement, role: string, value: string): void => {
    const input = row.querySelector<HTMLInputElement>(`[data-role="${role}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const status = (el: TaskBoard): HTMLElement => $(el, '#board-settings-status');

  it('opens rendering rows from the board — ids read-only, fields editable', () => {
    const el = mount();
    expect(el.openSettings()).toBe(true);

    expect(isOpen(el, 'board-settings-dialog')).toBe(true);
    expect(columnRow(el, 'doing').querySelector('.board-settings-id')!.textContent).toBe('doing');
    expect(
      columnRow(el, 'doing').querySelector<HTMLInputElement>('[data-role="label"]')!.value
    ).toBe('Doing');
    expect(
      columnRow(el, 'doing').querySelector<HTMLInputElement>('[data-role="description"]')!.value
    ).toBe('Underway.');
    expect(
      kindRow(el, 'spike').querySelector<HTMLInputElement>('[data-role="creatable"]')!.checked
    ).toBe(true);
    expect($<HTMLSelectElement>(el, '#board-settings-default').value).toBe('todo');
    expect($<HTMLSelectElement>(el, '#board-settings-done').value).toBe('doing');
  });

  it('a changed label asks one edit-manifest op and re-renders from the reply', async () => {
    const el = mount();
    el.openSettings();
    answerNext(
      ok({
        manifest: manifest({
          columns: [
            { id: 'todo', label: 'Backlog' },
            { id: 'doing', label: 'Doing', description: 'Underway.' },
          ],
        }),
        warnings: [],
      })
    );

    changeInput(columnRow(el, 'todo'), 'label', ' Backlog ');
    await flush();

    expect(host).toHaveBeenCalledOnce();
    expect(host.mock.calls[0]![0]).toEqual({
      type: 'edit-manifest',
      edit: { op: 'update-column', id: 'todo', label: 'Backlog' },
    });
    expect(
      columnRow(el, 'todo').querySelector<HTMLInputElement>('[data-role="label"]')!.value
    ).toBe('Backlog');
    expect(status(el).textContent).toContain('local until you check it in');
  });

  it('an unchanged blur asks nothing', async () => {
    const el = mount();
    el.openSettings();

    changeInput(columnRow(el, 'doing'), 'label', 'Doing');
    changeInput(columnRow(el, 'doing'), 'description', 'Underway.');
    await flush();

    expect(host).not.toHaveBeenCalled();
  });

  it('unchecking creatable asks update-kind; clearing a description sends the empty string', async () => {
    const el = mount();
    el.openSettings();
    host.mockImplementation(() => Promise.resolve(ok({ manifest: manifest(), warnings: [] })));

    const checkbox = kindRow(el, 'spike').querySelector<HTMLInputElement>(
      '[data-role="creatable"]'
    )!;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(opsOf('edit-manifest').at(-1)).toEqual({
      type: 'edit-manifest',
      edit: { op: 'update-kind', id: 'spike', creatable: false },
    });

    changeInput(columnRow(el, 'doing'), 'description', '');
    await flush();
    expect(opsOf('edit-manifest').at(-1)).toEqual({
      type: 'edit-manifest',
      edit: { op: 'update-column', id: 'doing', description: '' },
    });
  });

  it('a refusal shows the host’s message and snaps the dialog back', async () => {
    const el = mount();
    el.openSettings();
    answerNext(
      fail(
        'TASKS_COLUMN_NOT_EMPTY',
        '2 cards still carry “doing” (docs/tasks/stage1/phase1) — move them, then remove the column'
      )
    );

    $(el, '#board-settings-columns [data-id="doing"] [data-action="remove"]').click();
    await flush();

    expect(status(el).hidden).toBe(false);
    expect(status(el).classList.contains('error')).toBe(true);
    expect(status(el).textContent).toContain('2 cards still carry');
    expect(columnRow(el, 'doing')).toBeTruthy();
    // A refusal is the user's to act on, not an incident.
    expect(reported).not.toHaveBeenCalled();
  });

  it('asks one change at a time', async () => {
    const el = mount();
    el.openSettings();

    changeInput(columnRow(el, 'todo'), 'label', 'Queued');
    changeInput(columnRow(el, 'doing'), 'label', 'Working');
    await flush();

    expect(host).toHaveBeenCalledOnce();
  });

  it('adding a kind derives the id from the label and clears the inputs on success', async () => {
    const el = mount();
    el.openSettings();
    const label = $<HTMLInputElement>(el, '#board-settings-add-kind-label');
    const id = $<HTMLInputElement>(el, '#board-settings-add-kind-id');
    label.value = 'Design RFC';
    label.dispatchEvent(new Event('input', { bubbles: true }));
    expect(id.value).toBe('design-rfc');

    answerNext(
      ok({
        manifest: manifest({
          kinds: [
            ...STATE.kinds,
            {
              id: 'design-rfc',
              label: 'Design RFC',
              badge: 'd',
              dir: 'design-rfcs',
              creatable: true,
            },
          ],
        }),
        warnings: [],
      })
    );
    $(el, '#board-settings-add-kind').click();
    await flush();

    expect(host.mock.calls[0]![0]).toEqual({
      type: 'edit-manifest',
      edit: { op: 'add-kind', id: 'design-rfc', label: 'Design RFC' },
    });
    expect(kindRow(el, 'design-rfc')).toBeTruthy();
    expect(label.value).toBe('');
    expect(id.value).toBe('');
  });

  it('an add without a label or id asks nothing and says why', async () => {
    const el = mount();
    el.openSettings();

    $(el, '#board-settings-add-column').click();
    await flush();

    expect(host).not.toHaveBeenCalled();
    expect(status(el).textContent).toBe('Give the new entry a label and an id.');
  });

  it('the default/done pickers ask their ops on change', async () => {
    const el = mount();
    el.openSettings();
    answerNext(ok({ manifest: manifest({ doneColumn: 'todo' }), warnings: [] }));

    const done = $<HTMLSelectElement>(el, '#board-settings-done');
    done.value = 'todo';
    done.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    expect(host.mock.calls[0]![0]).toEqual({
      type: 'edit-manifest',
      edit: { op: 'set-done-column', id: 'todo' },
    });
  });

  it('without a board state it opens nothing and reports, leaving the host’s button to the host', () => {
    const el = mount('stage');
    el.setStageState({
      stage: 1,
      columns: STATE.columns,
      kinds: STATE.kinds,
      phases: [],
      pool: STATE.pool,
      housekeeping: [],
      tags: [],
    } as SharedTaskStageState);

    expect(el.openSettings()).toBe(false);
    expect(isOpen(el, 'board-settings-dialog')).toBe(false);
    expect(reported).toHaveBeenCalledWith('Board settings opened without a manifest snapshot');
  });

  it('stays open, its typing kept, while the board repaints behind it', () => {
    const el = mount();
    el.openSettings();
    const label = $<HTMLInputElement>(el, '#board-settings-add-column-label');
    label.value = 'Blocked';

    el.setState(
      structuredClone({ ...STATE, columns: [...STATE.columns, { id: 'x', label: 'X' }] })
    );

    expect(isOpen(el, 'board-settings-dialog')).toBe(true);
    expect($<HTMLInputElement>(el, '#board-settings-add-column-label')).toBe(label);
    expect(label.value).toBe('Blocked');
    expect(el.lastElementChild!.classList.contains('board-dialogs')).toBe(true);
  });

  it('Done closes the dialog', () => {
    const el = mount();
    el.openSettings();
    $(el, '#close-board-settings').click();
    expect(isOpen(el, 'board-settings-dialog')).toBe(false);
  });
});

describe('new card', () => {
  const open = (el: TaskBoard, kind: string): void =>
    $(el, `.board-new-card[data-kind="${kind}"]`).click();
  const title = (el: TaskBoard): HTMLInputElement => $(el, '#new-brief-title');
  const confirm = (el: TaskBoard): HTMLButtonElement => $(el, '#confirm-new-brief');

  it('is worded for a template-less kind, and creates nothing without a title', () => {
    const el = mount();
    open(el, 'spike');

    expect($(el, '#new-brief-dialog').getAttribute('title')).toBe('New spike');
    expect($(el, '#new-brief-description').textContent).toBe(
      "Creates a spike as a minimal empty document in this board's spikes folder. It stays local until you check it in."
    );
    expect(title(el).placeholder).toBe('My new spike');
    expect(confirm(el).disabled).toBe(true);

    title(el).value = 'Cache warmup';
    title(el).dispatchEvent(new Event('input', { bubbles: true }));
    expect(confirm(el).disabled).toBe(false);
  });

  it('closes, asks create-card, and announces the card', async () => {
    const el = mount();
    open(el, 'spike');
    title(el).value = '  Cache warmup ';
    title(el).dispatchEvent(new Event('input', { bubbles: true }));
    answerNext(
      ok({
        card: {
          ...STATE.cards[0]!,
          path: `${BOARD}/spikes/cache_warmup.md`,
          frontmatterTitle: 'Cache warmup',
        },
      })
    );

    confirm(el).click();
    expect(isOpen(el, 'new-brief-dialog')).toBe(false);
    await flush();

    expect(host.mock.calls[0]![0]).toEqual({
      type: 'create-card',
      boardPath: BOARD,
      title: 'Cache warmup',
      kind: 'spike',
    });
    expect(notified).toHaveBeenCalledWith({ message: 'Created “Cache warmup”.', type: 'success' });
  });

  it('a refusal is a notification with the host’s message, or the fallback', async () => {
    const el = mount();
    open(el, 'brief');
    title(el).value = 'Idea';
    title(el).dispatchEvent(new Event('input', { bubbles: true }));
    answerNext(fail('TASKS_BRIEF_EXISTS', '“idea.md” already exists here'));
    confirm(el).click();
    await flush();
    expect(notified).toHaveBeenLastCalledWith({
      message: '“idea.md” already exists here',
      type: 'error',
    });

    open(el, 'brief');
    title(el).value = 'Idea';
    title(el).dispatchEvent(new Event('input', { bubbles: true }));
    answerNext(fail('API_ERROR', ''));
    confirm(el).click();
    await flush();
    expect(notified).toHaveBeenLastCalledWith({
      message: 'Could not create the brief.',
      type: 'error',
    });
  });

  it('a reopened dialog starts empty', () => {
    const el = mount();
    open(el, 'spike');
    title(el).value = 'Left over';
    $(el, '#cancel-new-brief').click();
    open(el, 'review');
    expect(title(el).value).toBe('');
  });
});

describe('card title', () => {
  const openTitle = (el: TaskBoard): void => {
    $(el, `.card-menu-btn[data-path="${CARD}"]`).click();
    el.dispatchEvent(new CustomEvent('options-menu-select', { detail: { itemId: 'set-title' } }));
  };

  it('saves a new title through set-title', async () => {
    const el = mount();
    openTitle(el);
    $<HTMLInputElement>(el, '#set-title-input').value = ' Sign-in flow ';
    answerNext(ok());

    $(el, '#confirm-set-title').click();
    expect(isOpen(el, 'set-title-dialog')).toBe(false);
    await flush();

    expect(host.mock.calls[0]![0]).toEqual({
      type: 'set-title',
      path: CARD,
      title: 'Sign-in flow',
    });
    expect(notified).toHaveBeenCalledWith({ message: 'Title updated.', type: 'success' });
  });

  it('a blank title removes it', async () => {
    const el = mount();
    openTitle(el);
    $<HTMLInputElement>(el, '#set-title-input').value = '   ';
    answerNext(ok());

    $(el, '#confirm-set-title').click();
    await flush();

    expect(host.mock.calls[0]![0]).toEqual({ type: 'set-title', path: CARD, title: null });
    expect(notified).toHaveBeenCalledWith({ message: 'Title removed.', type: 'success' });
  });

  it('a refusal is a notification with the host’s message', async () => {
    const el = mount();
    openTitle(el);
    answerNext(
      fail('DRAFT_SAVE_IN_PROGRESS', 'That file is being edited right now — try again in a moment.')
    );

    $(el, '#confirm-set-title').click();
    await flush();

    expect(notified).toHaveBeenCalledWith({
      message: 'That file is being edited right now — try again in a moment.',
      type: 'error',
    });
  });

  it('Cancel asks nothing', async () => {
    const el = mount();
    openTitle(el);
    $(el, '#cancel-set-title').click();
    await flush();
    expect(isOpen(el, 'set-title-dialog')).toBe(false);
    expect(host).not.toHaveBeenCalled();
  });
});

describe('card tags', () => {
  const openTags = (el: TaskBoard): void => {
    $(el, `.card-menu-btn[data-path="${CARD}"]`).click();
    el.dispatchEvent(new CustomEvent('options-menu-select', { detail: { itemId: 'set-tags' } }));
  };
  const checked = (el: TaskBoard): string[] =>
    [...el.querySelectorAll<HTMLInputElement>('#tag-options input:checked')].map(
      (input) => input.dataset.tag!
    );

  it('saves the checked tags through set-tags', async () => {
    const el = mount();
    openTags(el);
    const ui = $<HTMLInputElement>(el, '#tag-options input[data-tag="ui"]');
    ui.checked = true;
    answerNext(ok());

    $(el, '#confirm-set-tags').click();
    expect(isOpen(el, 'set-tags-dialog')).toBe(false);
    await flush();

    expect(host.mock.calls[0]![0]).toEqual({ type: 'set-tags', path: CARD, tags: ['infra', 'ui'] });
    expect(notified).toHaveBeenCalledWith({ message: 'Tags updated.', type: 'success' });
  });

  it('adds a tag to the registry at once, checked, keeping the other checks', async () => {
    const el = mount();
    openTags(el);
    $<HTMLInputElement>(el, '#new-tag-input').value = ' Perf ';
    answerNext(ok({ tags: ['infra', 'ui', 'Perf'] }));

    $(el, '#add-new-tag').click();
    await flush();

    expect(host.mock.calls[0]![0]).toEqual({ type: 'add-tag', tag: 'Perf' });
    expect(checked(el)).toEqual(['infra', 'Perf']);
    expect($<HTMLInputElement>(el, '#new-tag-input').value).toBe('');
    // A board repaint behind the dialog keeps the new tag and the checks.
    el.setState(structuredClone(STATE));
    expect(checked(el)).toEqual(['infra', 'Perf']);
  });

  it('a refused add is a notification; the options stay as they were', async () => {
    const el = mount();
    openTags(el);
    $<HTMLInputElement>(el, '#new-tag-input').value = 'x';
    answerNext(fail('VALIDATION_ERROR', 'tasks.yaml tags cannot be patched'));

    $(el, '#add-new-tag').click();
    await flush();

    expect(notified).toHaveBeenCalledWith({
      message: 'tasks.yaml tags cannot be patched',
      type: 'error',
    });
    expect(checked(el)).toEqual(['infra']);
  });

  it('a refused save is a notification', async () => {
    const el = mount();
    openTags(el);
    answerNext(fail('API_ERROR', ''));

    $(el, '#confirm-set-tags').click();
    await flush();

    expect(notified).toHaveBeenCalledWith({
      message: 'Could not set the card tags.',
      type: 'error',
    });
  });
});

describe('the stage view', () => {
  const stage = (): SharedTaskStageState =>
    ({
      stage: 1,
      columns: STATE.columns,
      kinds: STATE.kinds,
      phases: [{ phase: 1, path: BOARD, label: 'Phase 1', cards: structuredClone(STATE.cards) }],
      pool: STATE.pool,
      housekeeping: [],
      tags: STATE.tags,
    }) as SharedTaskStageState;

  it('offers no new card, and Set title / Tags open nothing', () => {
    const el = mount('stage');
    el.setStageState(stage());

    expect(el.querySelector('.board-new-card')).toBeNull();
    for (const itemId of ['set-title', 'set-tags']) {
      $(el, `.card-menu-btn[data-path="${CARD}"]`).click();
      el.dispatchEvent(new CustomEvent('options-menu-select', { detail: { itemId } }));
    }
    expect(isOpen(el, 'set-title-dialog')).toBe(false);
    expect(isOpen(el, 'set-tags-dialog')).toBe(false);
    expect(host).not.toHaveBeenCalled();
  });
});
