// @vitest-environment jsdom
/// <reference lib="dom" />
import {
  APP_OP_EVENT,
  answerOps,
  fail,
  isCoreOp,
  matchAppPage,
  ok,
  requestOp,
} from '@stillpointlab/common-format/app';
import {
  describeAppElementContract,
  expectNoHostileMarkup,
  hostile,
} from '@stillpointlab/common-format/testing';
import { afterEach, describe, expect, it } from 'vitest';

import './index.js';
import { tasksCore } from '../core.js';
import { TASKS_SHELL_OPS } from '../elementOps.js';
import { tasksModule } from '../module.js';
import { tasksPages } from '../pages.js';

import { TASKS_CHECKIN_WORDS } from './checkin.js';

import type { TasksApp } from './tasks-app.js';
import type { TaskBoard } from '../element/task-board.js';
import type { TasksNav } from '../element/tasks-nav.js';
import type { TasksElementOps } from '../module.js';
import type { TasksNavProjection, TasksSnapshot } from '../projection.js';
import type { SharedTaskBoardState, SharedTaskStageState } from '../types.js';
import type { CheckinReview } from '@stillpointlab/checkin-review-component';
import type {
  AppOp,
  AppOpDetail,
  AppShellInput,
  AppShellOps,
  AppView,
  FileChange,
  Result,
} from '@stillpointlab/common-format/app';

const MANIFEST = 'docs/tasks/tasks.yaml';
const PATH_BASE = '/project/p/repos/r/tasks/view_1';
const FRAGMENT_BASE = '#/app/docs/tasks/tasks.yaml';
const BOARD = 'docs/tasks/stage1/phase1';
const OTHER = 'docs/tasks/research';

/** The discriminants the elements switch on, kept intact in hostile states. */
const HOSTILE_EXCEPT = ['type'];

const card = (front: string[], body: string): string =>
  ['---', ...front, '---', '', body, ''].join('\n');

/** A small tasks folder: two phases and a stage after them, a board outside the stages, a pool. */
const FILES: Readonly<Record<string, string>> = {
  [MANIFEST]: [
    'version: 1',
    'columns:',
    '  - id: todo',
    '    label: Todo',
    '  - id: done',
    '    label: Done',
    'defaultColumn: todo',
    'doneColumn: done',
    'kinds:',
    '  - id: brief',
    '  - id: spec',
    'current:',
    '  stage: 1',
    '  phase: 1',
    '',
  ].join('\n'),
  [`${BOARD}/briefs/onboarding.md`]: card(['column: todo', 'title: Onboarding'], '# Onboarding'),
  [`${BOARD}/specs/login.md`]: card(['column: done', 'title: Login'], '# Login'),
  'docs/tasks/stage1/phase2/briefs/.gitkeep': '',
  'docs/tasks/stage2/phase1/briefs/.gitkeep': '',
  [`${OTHER}/briefs/question.md`]: card(['column: todo'], '# A question'),
  'docs/tasks/unassigned/briefs/idea.md': card(['title: An idea'], '# Idea'),
};

type Snapshot = TasksSnapshot & {
  paths: string[];
  files: Record<string, string | null>;
  moves: Record<string, string[]>;
};

const snapshotOf = (files: Readonly<Record<string, string>> = FILES): Snapshot => ({
  manifestPath: MANIFEST,
  paths: Object.keys(files),
  files: { ...files },
  moves: {},
});

const projectIn = (snapshot: Snapshot, view: unknown): Result<{ state: object | null }> => {
  const checked = tasksModule.bounds.view(view);
  if (!checked.ok) return checked;
  return ok({ state: tasksCore.project(snapshot, checked.view, {}) as object | null });
};

const SNAPSHOT = snapshotOf();
const NAV = tasksCore.project(SNAPSHOT, { type: 'nav' }, {}) as TasksNavProjection;
const BOARD_STATE = tasksCore.project(
  SNAPSHOT,
  { type: 'board', path: BOARD },
  {}
) as SharedTaskBoardState;
const STAGE_STATE = tasksCore.project(
  SNAPSHOT,
  { type: 'stage', stage: 1 },
  {}
) as SharedTaskStageState;

const extrasFor = (
  current: { stage: number | null; phase: number | null; other?: boolean; boardPath?: string },
  docsRoot = 'docs/tasks'
): Record<string, unknown> => ({
  nav: {
    ...NAV,
    current: {
      other: false,
      boardPath: '',
      ...current,
    },
  },
  docsRoot,
});

const boardInput = (overrides: Partial<AppShellInput> = {}): AppShellInput => ({
  base: PATH_BASE,
  back: { href: '/project/p', label: 'Back to project' },
  location: 'stillpointlab/surfaces',
  view: { type: 'board', path: BOARD },
  state: BOARD_STATE,
  extras: extrasFor({ stage: 1, phase: 1, boardPath: BOARD }),
  ...overrides,
});

const stageInput = (overrides: Partial<AppShellInput> = {}): AppShellInput =>
  boardInput({
    view: { type: 'stage', stage: 1 },
    state: STAGE_STATE,
    extras: extrasFor({ stage: 1, phase: null }),
    ...overrides,
  });

const emptyInput = (overrides: Partial<AppShellInput> = {}): AppShellInput =>
  boardInput({
    view: null,
    state: null,
    extras: extrasFor({ stage: null, phase: null }),
    ...overrides,
  });

function mountShell(input: AppShellInput, before?: (el: TasksApp) => void): TasksApp {
  const el = document.createElement('spl-tasks-app');
  before?.(el);
  document.body.append(el);
  el.setState(input);
  return el;
}

const boardOf = (el: HTMLElement): TaskBoard => el.querySelector('spl-task-board')!;
const stripOf = (el: HTMLElement): TasksNav => el.querySelector('spl-tasks-nav')!;
const cardTitles = (el: HTMLElement): string[] =>
  [...boardOf(el).querySelectorAll('.task-board .board-card .card-title')].map(
    (node) => node.textContent?.trim() ?? ''
  );

/** Fill the new-card dialog's title, as typing does, and confirm it. */
function confirmNewCard(el: HTMLElement, title: string): void {
  const input = el.querySelector<HTMLInputElement>('#new-brief-title')!;
  input.value = title;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  el.querySelector<HTMLElement>('#confirm-new-brief')!.click();
}

const reviewOf = (el: HTMLElement): CheckinReview => el.querySelector('checkin-review')!;

const reviewRows = (el: HTMLElement) =>
  [...reviewOf(el).querySelectorAll<HTMLElement>('.checkin-review-row')].map((row) => ({
    checked: row.querySelector<HTMLInputElement>('input')!.checked,
    path: row.querySelector('.checkin-review-path')!.textContent,
    label: row.querySelector('.checkin-review-label')!.textContent,
    group:
      row.closest('.checkin-review-group')?.querySelector('.checkin-review-group-name')
        ?.textContent ?? null,
  }));

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** What a host's client half does: answers the shell's ops from the files, learning each core reply. */
function attachHost(
  el: TasksApp,
  snapshot: Snapshot,
  options: {
    refresh?: () => Result<object> | Promise<Result<object>>;
    project?: (view: unknown) => Result<object> | undefined;
  } = {}
): AppOp<TasksElementOps & AppShellOps>[] {
  const asked: AppOp<TasksElementOps & AppShellOps>[] = [];
  answerOps<TasksElementOps & AppShellOps>(el, (op) => {
    asked.push(op);
    if (op.type === 'project') return options.project?.(op.view) ?? projectIn(snapshot, op.view);
    if (op.type === 'refresh') return options.refresh?.() ?? ok();
    if (op.type === 'checkin' || !isCoreOp(tasksModule, op.type)) {
      return fail('TEST_HOST_OP', `Not answered: ${op.type}`);
    }
    const applied = tasksModule.core.apply(
      snapshot,
      tasksModule.toCoreOp(op, { now: '2026-11-14T12:00:00Z' })
    );
    if (!applied.ok) return applied;
    write(snapshot, applied.changes);
    const reply = tasksModule.reply(op, applied, {
      snapshot,
      facts: {},
      view: el.opView(op) as AppView<never> | undefined,
    });
    if (reply.ok) el.learn(op, reply);
    return reply;
  });
  return asked;
}

function write(snapshot: Snapshot, changes: readonly FileChange[]): void {
  for (const change of changes) {
    if (change.kind === 'move') {
      delete snapshot.files[change.from];
      snapshot.paths = snapshot.paths.filter((path) => path !== change.from);
    }
    snapshot.files[change.path] = change.content;
    if (!snapshot.paths.includes(change.path)) snapshot.paths.push(change.path);
  }
}

/** The events of `types` raised under `document` from now on. */
function collect(types: readonly string[]): { events: Event[]; stop(): void } {
  const events: Event[] = [];
  const record = (event: Event): void => {
    events.push(event);
  };
  for (const type of types) document.addEventListener(type, record);
  return {
    events,
    stop: () => {
      for (const type of types) document.removeEventListener(type, record);
    },
  };
}

const change = (select: HTMLSelectElement, value: string): void => {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

const click = (target: Element, init: MouseEventInit = {}): MouseEvent => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  target.dispatchEvent(event);
  return event;
};

afterEach(() => {
  document.body.replaceChildren();
  delete (globalThis as { __hostile?: unknown }).__hostile;
});

describe('<spl-tasks-app> views', () => {
  it('lays out a phase board: the top bar, the strip beside the board', async () => {
    const el = mountShell(boardInput());
    await el.whenReady();

    const bar = el.querySelector(':scope > .tasks-topbar')!;
    const back = bar.querySelector<HTMLAnchorElement>('a.back-button')!;
    expect(back.getAttribute('href')).toBe('/project/p');
    expect(back.getAttribute('aria-label')).toBe('Back to project');
    expect(bar.querySelector('spl-icon[icon-name="task"]')).not.toBeNull();
    expect(bar.querySelector('.task-board-repo')?.textContent).toBe('stillpointlab/surfaces');
    expect(bar.querySelector('button.tasks-nav-button.tasks-refresh')?.textContent).toBe(
      '⟳ Refresh'
    );
    expect(bar.querySelector('button.tasks-nav-button.tasks-board-settings')).not.toBeNull();

    const layout = el.querySelector(':scope > .board-layout')!;
    expect(layout.querySelector(':scope > nav.tasks-nav > spl-tasks-nav')).not.toBeNull();
    const board = layout.querySelector<TaskBoard>(':scope > spl-task-board')!;
    expect(board.getAttribute('variant')).toBe('board');
    expect(board.getAttribute('storage-key')).toBe(PATH_BASE);
    expect(cardTitles(el).sort()).toEqual(['Login', 'Onboarding']);
    expect(stripOf(el).querySelector('.tasks-tab.is-active')?.textContent).toContain('Stage 1');
  });

  it('lays out a stage’s swimlanes, without Settings', () => {
    const el = mountShell(stageInput());
    expect(boardOf(el).getAttribute('variant')).toBe('stage');
    expect(boardOf(el).querySelectorAll('.stage-row').length).toBeGreaterThan(0);
    expect(el.querySelector('.tasks-board-settings')).toBeNull();
    expect(el.querySelector('.tasks-refresh')).not.toBeNull();
  });

  it('shows the empty state in the board’s place, naming the folder, with the strip', () => {
    const el = mountShell(emptyInput());
    expect(el.querySelector('spl-task-board')).toBeNull();
    expect(el.querySelector('.tasks-board-settings')).toBeNull();
    const empty = el.querySelector('.board-layout > .task-board-empty')!;
    expect(empty.querySelector('h2')?.textContent).toBe('No boards yet');
    expect(empty.textContent).toContain('docs/tasks/');
    expect(stripOf(el).querySelector('.tasks-new-stage')).not.toBeNull();

    el.setState(emptyInput({ extras: extrasFor({ stage: null, phase: null }, '') }));
    expect(el.querySelector('.task-board-empty')?.textContent).toContain('the repository root');
  });

  it('says so for a view it does not know, and links to the landing', () => {
    const el = mountShell(boardInput({ view: { type: 'calendar' }, state: null }));
    const missing = el.querySelector('.tasks-app-missing')!;
    expect(missing.textContent).toContain('nothing to show');
    expect(missing.querySelector('a')?.getAttribute('href')).toBe(PATH_BASE);
    expect(el.querySelector('spl-task-board')).toBeNull();
  });

  it('lets the board say it could not load a board with no state', () => {
    const el = mountShell(boardInput({ state: null }));
    expect(boardOf(el).querySelector('.board-empty')?.textContent).toContain('Could not load');
  });

  it('has no back link without the host’s back, and no location without one', () => {
    const el = mountShell(boardInput({ back: undefined, location: undefined }));
    expect(el.querySelector('.back-button')).toBeNull();
    expect(el.querySelector('.task-board-repo')).toBeNull();
    expect(el.querySelector('.tasks-refresh')).not.toBeNull();
  });

  it('keeps its board across states of one view, and makes a new one for another view', () => {
    const el = mountShell(boardInput());
    const board = boardOf(el);
    const renamed = structuredClone(BOARD_STATE);
    renamed.cards[0]!.title = 'Renamed';
    renamed.cards[0]!.frontmatterTitle = 'Renamed';
    el.setState(boardInput({ state: renamed }));
    expect(boardOf(el)).toBe(board);
    expect(cardTitles(el)).toContain('Renamed');

    el.setState(boardInput({ view: { type: 'board', path: OTHER }, state: BOARD_STATE }));
    expect(boardOf(el)).not.toBe(board);
    el.setState(stageInput());
    expect(boardOf(el).getAttribute('variant')).toBe('stage');
  });

  it('renders what tasks’ pages resolve, under a fragment base', async () => {
    const matched = matchAppPage(tasksPages, '/stage/1/phase/1')!;
    const resolved = await matched.page.resolve({
      params: matched.params,
      query: {},
      base: FRAGMENT_BASE,
      manifestPath: MANIFEST,
      project: async (view) => tasksCore.project(SNAPSHOT, view as never, {}),
    });
    if (!('view' in resolved) || resolved.view === null) throw new Error('no view');
    const el = mountShell({
      base: FRAGMENT_BASE,
      view: resolved.view,
      state: tasksCore.project(SNAPSHOT, resolved.view as never, {}) as object,
      extras: resolved.extras,
    });
    expect(cardTitles(el).sort()).toEqual(['Login', 'Onboarding']);
    expect(stripOf(el).querySelector('.tasks-current-marker')).not.toBeNull();
  });
});

describe('<spl-tasks-app> links', () => {
  it.each([
    ['a path base', PATH_BASE],
    ['a fragment base', FRAGMENT_BASE],
  ])('links the strip under %s, joined as text', (_name, base) => {
    const el = mountShell(boardInput({ base }));
    const strip = stripOf(el);
    expect(
      [...strip.querySelectorAll('a.tasks-tab-link')].map((a) => a.getAttribute('href'))
    ).toEqual([`${base}/stage/1`, `${base}/stage/2`]);

    const seen = collect(['navigate']);
    change(strip.querySelector<HTMLSelectElement>('.tasks-tab-filter')!, '2');
    change(stripOf(el).querySelector<HTMLSelectElement>('.tasks-other-select')!, OTHER);
    seen.stop();
    expect(
      seen.events.map((event) => (event as CustomEvent<{ href: string }>).detail.href)
    ).toEqual([`${base}/stage/1/phase/2`, `${base}?path=${encodeURIComponent(OTHER)}`]);
  });

  it('links pages the module’s pages read back', () => {
    const el = mountShell(boardInput({ base: FRAGMENT_BASE }));
    const { links } = stripOf(el);
    const subPath = (href: string): string => href.slice(FRAGMENT_BASE.length).split('?')[0]!;
    expect(matchAppPage(tasksPages, subPath(links!.stage(2)))?.params).toEqual({ stage: '2' });
    expect(matchAppPage(tasksPages, subPath(links!.phase(1, 2)))?.params).toEqual({
      stage: '1',
      phase: '2',
    });
    expect(matchAppPage(tasksPages, subPath(links!.board(OTHER)))?.page.path).toBe('');
  });

  it('follows a new base on the next state', () => {
    const el = mountShell(boardInput());
    el.setState(boardInput({ base: FRAGMENT_BASE }));
    expect(stripOf(el).querySelector('a.tasks-tab-link')?.getAttribute('href')).toBe(
      `${FRAGMENT_BASE}/stage/1`
    );
  });
});

describe('<spl-tasks-app> learn and opView', () => {
  it.each(['create-card', 'set-title', 'set-tags', 'move-file', 'fix-references', 'add-tag'])(
    'reads the board again after %s',
    async (type) => {
      const el = mountShell(boardInput());
      const renamed = structuredClone(BOARD_STATE);
      renamed.cards[0]!.frontmatterTitle = `After ${type}`;
      renamed.cards[0]!.title = `After ${type}`;
      const asked = attachHost(el, snapshotOf(), { project: () => ok({ state: renamed }) });

      el.learn({ type }, ok({}));
      await tick();
      expect(asked).toEqual([{ type: 'project', view: { type: 'board', path: BOARD } }]);
      expect(cardTitles(el)).toContain(`After ${type}`);
    }
  );

  it('reads the board and the strip again after edit-manifest, on a board and on a stage', async () => {
    const el = mountShell(boardInput());
    const asked = attachHost(el, snapshotOf());
    el.learn({ type: 'edit-manifest' }, ok({}));
    await tick();
    expect(asked).toEqual([
      { type: 'project', view: { type: 'nav' } },
      { type: 'project', view: { type: 'board', path: BOARD } },
    ]);
    // A stage's cards come with the host's next state; its strip is read here.
    const stage = mountShell(stageInput());
    const stageAsked = attachHost(stage, snapshotOf());
    stage.learn({ type: 'edit-manifest' }, ok({}));
    await tick();
    expect(stageAsked).toEqual([{ type: 'project', view: { type: 'nav' } }]);
  });

  it.each(['move', 'reorder-pool', 'set-current'])('reads nothing again after %s', async (type) => {
    const el = mountShell(boardInput());
    const asked = attachHost(el, snapshotOf());
    el.learn({ type }, ok({}));
    await tick();
    expect(asked).toEqual([]);
  });

  it('reads nothing again on a stage, or with no board', async () => {
    for (const input of [stageInput(), emptyInput()]) {
      const el = mountShell(input);
      const asked = attachHost(el, snapshotOf());
      el.learn({ type: 'create-card' }, ok({}));
      await tick();
      expect(asked).toEqual([]);
    }
  });

  it('shows a card created through the board’s dialog, read again from the host', async () => {
    const snapshot = snapshotOf();
    const el = mountShell(boardInput());
    const asked = attachHost(el, snapshot);

    boardOf(el).querySelector<HTMLElement>('.board-new-card[data-kind="brief"]')!.click();
    confirmNewCard(el, 'Write the shell');
    await tick();
    await tick();

    expect(asked.map((op) => op.type)).toEqual(['create-card', 'project']);
    expect(cardTitles(el)).toContain('Write the shell');
  });

  it('answers the view on screen for a pool reorder, and nothing for any other op', () => {
    const board = mountShell(boardInput());
    expect(board.opView({ type: 'reorder-pool' })).toEqual({ type: 'board', path: BOARD });
    const stage = mountShell(stageInput());
    expect(stage.opView({ type: 'reorder-pool' })).toEqual({ type: 'stage', stage: 1 });
    expect(mountShell(emptyInput()).opView({ type: 'reorder-pool' })).toBeUndefined();
    for (const type of [...tasksModule.coreOps, ...tasksModule.hostOps, ...TASKS_SHELL_OPS]) {
      if (type !== 'reorder-pool') expect(board.opView({ type })).toBeUndefined();
    }
  });
});

describe('<spl-tasks-app> claims two ops', () => {
  it('answers refresh-stage through project, and the host never sees it', async () => {
    const el = mountShell(stageInput());
    const asked = attachHost(el, snapshotOf());
    const seen = collect([APP_OP_EVENT]);

    const reply = await requestOp<TasksElementOps, 'refresh-stage'>(boardOf(el), {
      type: 'refresh-stage',
      stage: 1,
    });
    seen.stop();
    expect(reply).toEqual(ok({ stage: STAGE_STATE }));
    expect(asked).toEqual([{ type: 'project', view: { type: 'stage', stage: 1 } }]);
    expect(
      seen.events.map(
        (event) => (event as CustomEvent<AppOpDetail<{ type: string }>>).detail.op.type
      )
    ).toEqual(['project']);
  });

  it('answers close-candidates through project, with each card’s path, title and column', async () => {
    const el = mountShell(boardInput());
    const asked = attachHost(el, snapshotOf());

    const reply = await requestOp<TasksElementOps, 'close-candidates'>(stripOf(el), {
      type: 'close-candidates',
      path: BOARD,
    });
    expect(asked).toEqual([{ type: 'project', view: { type: 'board', path: BOARD } }]);
    expect(reply.ok && [...reply.cards].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: `${BOARD}/briefs/onboarding.md`, title: 'Onboarding', column: 'todo' },
      { path: `${BOARD}/specs/login.md`, title: 'Login', column: 'done' },
    ]);
  });

  it('fills the strip’s close dialog with the unfinished cards', async () => {
    const el = mountShell(boardInput());
    attachHost(el, snapshotOf());
    stripOf(el).dispatchEvent(
      new CustomEvent('options-menu-select', { detail: { itemId: 'close-phase' } })
    );
    await tick();
    await tick();
    const rows = [...el.querySelectorAll<HTMLInputElement>('#close-cards input')];
    expect(rows.map((input) => input.dataset.path)).toEqual([`${BOARD}/briefs/onboarding.md`]);
  });

  it('claims them ahead of a host that listens on the shell itself', async () => {
    const asked: string[] = [];
    const el = mountShell(stageInput(), (shell) =>
      answerOps<TasksElementOps & AppShellOps>(shell, (op) => {
        asked.push(op.type);
        return op.type === 'project' ? projectIn(SNAPSHOT, op.view) : fail('NO', 'no');
      })
    );
    const reply = await requestOp<TasksElementOps, 'refresh-stage'>(boardOf(el), {
      type: 'refresh-stage',
      stage: 1,
    });
    expect(reply.ok).toBe(true);
    expect(asked).toEqual(['project']);
  });

  it('passes a refused read on, and refuses a view that is gone', async () => {
    const el = mountShell(boardInput());
    attachHost(el, snapshotOf(), {
      project: (view) =>
        (view as { type: string }).type === 'stage'
          ? ok({ state: null })
          : fail('READ_FAILED', 'No'),
    });
    expect(
      await requestOp<TasksElementOps, 'close-candidates'>(stripOf(el), {
        type: 'close-candidates',
        path: BOARD,
      })
    ).toMatchObject({ ok: false, code: 'READ_FAILED' });
    expect(
      await requestOp<TasksElementOps, 'refresh-stage'>(boardOf(el), {
        type: 'refresh-stage',
        stage: 9,
      })
    ).toMatchObject({ ok: false, code: 'TASKS_STAGE_NOT_FOUND' });
  });

  it('answers OP_UNHANDLED through project when no host answers', async () => {
    const el = mountShell(boardInput());
    expect(
      await requestOp<TasksElementOps, 'close-candidates'>(stripOf(el), {
        type: 'close-candidates',
        path: BOARD,
      })
    ).toMatchObject({ ok: false, code: 'OP_UNHANDLED' });
  });
});

describe('<spl-tasks-app> Refresh', () => {
  it('asks refresh, then reads the nav and the board again, keeping the strip’s selection', async () => {
    const snapshot = snapshotOf();
    const el = mountShell(boardInput());
    let release: () => void = () => undefined;
    const asked = attachHost(el, snapshot, {
      refresh: () =>
        new Promise((resolve) => {
          release = () => resolve(ok());
        }),
    });

    el.querySelector<HTMLButtonElement>('.tasks-refresh')!.click();
    await tick();
    const busy = el.querySelector<HTMLButtonElement>('.tasks-refresh')!;
    expect(busy.disabled).toBe(true);
    expect(busy.textContent).toBe('Refreshing…');
    expect(busy.getAttribute('aria-busy')).toBe('true');

    // Upstream moved on: a new phase, and a new card on the board.
    write(snapshot, [
      { kind: 'create', path: 'docs/tasks/stage1/phase3/briefs/.gitkeep', content: '' },
      {
        kind: 'create',
        path: `${BOARD}/briefs/arrived.md`,
        content: card(['column: todo', 'title: Arrived upstream'], '# Arrived'),
      },
    ]);
    release();
    await tick();
    await tick();

    expect(asked).toEqual([
      { type: 'refresh' },
      { type: 'project', view: { type: 'nav' } },
      { type: 'project', view: { type: 'board', path: BOARD } },
    ]);
    expect(cardTitles(el)).toContain('Arrived upstream');
    const phases = [
      ...stripOf(el).querySelectorAll<HTMLOptionElement>('.tasks-tab-filter option'),
    ].map((option) => option.value);
    expect(phases).toContain('3');
    expect(stripOf(el).navState?.current).toMatchObject({ stage: 1, phase: 1 });
    const idle = el.querySelector<HTMLButtonElement>('.tasks-refresh')!;
    expect(idle.disabled).toBe(false);
    expect(idle.textContent).toBe('⟳ Refresh');
  });

  it('says so when the host refuses, and reads nothing', async () => {
    const el = mountShell(boardInput());
    const asked = attachHost(el, snapshotOf(), { refresh: () => fail('NO_SYNC', 'Offline') });
    const seen = collect(['notification']);
    el.querySelector<HTMLButtonElement>('.tasks-refresh')!.click();
    await tick();
    seen.stop();
    expect(asked.map((op) => op.type)).toEqual(['refresh']);
    expect((seen.events[0] as CustomEvent).detail).toEqual({ message: 'Offline', type: 'error' });
    expect(el.querySelector<HTMLButtonElement>('.tasks-refresh')!.disabled).toBe(false);
  });

  it('goes to the landing from the empty state, which a refresh may have filled', async () => {
    const el = mountShell(emptyInput());
    const asked = attachHost(el, snapshotOf());
    const seen = collect(['navigate']);
    el.querySelector<HTMLButtonElement>('.tasks-refresh')!.click();
    await tick();
    await tick();
    seen.stop();
    expect(asked.map((op) => op.type)).toEqual(['refresh', 'project']);
    expect(seen.events.map((event) => (event as CustomEvent).detail.href)).toEqual([PATH_BASE]);
    expect(seen.events[0]!.cancelable).toBe(true);
  });

  it('goes to the landing from a stage the nav no longer has', async () => {
    const el = mountShell(stageInput({ view: { type: 'stage', stage: 7 } }));
    attachHost(el, snapshotOf());
    const seen = collect(['navigate']);
    el.querySelector<HTMLButtonElement>('.tasks-refresh')!.click();
    await tick();
    await tick();
    seen.stop();
    expect(seen.events.map((event) => (event as CustomEvent).detail.href)).toEqual([PATH_BASE]);
  });
});

describe('<spl-tasks-app> Settings', () => {
  it('opens the board’s settings dialog', () => {
    const el = mountShell(boardInput());
    el.querySelector<HTMLButtonElement>('.tasks-board-settings')!.click();
    expect(el.querySelector('#board-settings-dialog')?.hasAttribute('is-open')).toBe(true);
  });

  it('says it is unavailable when the board has no state to edit', () => {
    const el = mountShell(boardInput({ state: null }));
    el.querySelector<HTMLButtonElement>('.tasks-board-settings')!.click();
    const button = el.querySelector<HTMLButtonElement>('.tasks-board-settings')!;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('unavailable');
  });
});

describe('<spl-tasks-app> requests', () => {
  it('raises navigate for a followed link, and the click stays the host’s to claim', () => {
    const el = mountShell(boardInput());
    const seen: string[] = [];
    const claim = (event: Event): void => {
      seen.push((event as CustomEvent<{ href: string }>).detail.href);
      event.preventDefault();
    };
    document.addEventListener('navigate', claim);
    const followed = click(el.querySelector('a.tasks-tab-link')!);
    document.removeEventListener('navigate', claim);

    expect(seen).toEqual([`${PATH_BASE}/stage/1`]);
    expect(followed.defaultPrevented).toBe(true);
  });

  it('leaves the click alone when no host claims navigate, or for a modified click', () => {
    const el = mountShell(boardInput());
    const seen = collect(['navigate']);
    // Last in line, note whether anything claimed the click, then stop jsdom following the link.
    const claimed: boolean[] = [];
    const stop = (event: Event): void => {
      claimed.push(event.defaultPrevented);
      event.preventDefault();
    };
    window.addEventListener('click', stop);
    click(el.querySelector('a.back-button')!);
    click(el.querySelector('a.tasks-tab-link')!, { ctrlKey: true });
    window.removeEventListener('click', stop);
    seen.stop();
    expect(claimed).toEqual([false, false]);
    expect(seen.events.map((event) => (event as CustomEvent).detail.href)).toEqual(['/project/p']);
  });

  it('lets the strip’s navigate through, cancelable, for a host to claim', () => {
    const el = mountShell(boardInput());
    const seen = collect(['navigate']);
    change(stripOf(el).querySelector<HTMLSelectElement>('.tasks-tab-filter')!, '');
    seen.stop();
    expect(seen.events).toHaveLength(1);
    expect(seen.events[0]!.bubbles && seen.events[0]!.cancelable).toBe(true);
  });

  it('lets the board’s requests through, bubbling, except check-in, which it takes', async () => {
    const changed = structuredClone(BOARD_STATE);
    changed.cards[0]!.changed = true;
    const el = mountShell(boardInput({ state: changed }));
    const seen = collect(['open-card', 'checkin-request', 'open-options-menu', 'notification']);
    const onShell: string[] = [];
    el.addEventListener('checkin-request', (event) => onShell.push(event.type));
    attachHost(el, snapshotOf(), {});

    const cardEl = boardOf(el).querySelector<HTMLElement>('.task-board .board-card')!;
    cardEl.click();
    boardOf(el).querySelector<HTMLElement>('.task-board .board-card')!.click();
    boardOf(el).querySelector<HTMLElement>('.board-checkin')!.click();
    expect(reviewOf(el).isOpen).toBe(true);
    reviewOf(el).close();
    boardOf(el).querySelector<HTMLElement>('.task-board .card-menu-btn')!.click();
    // A move the host refuses: the board says so.
    boardOf(el).dispatchEvent(
      new CustomEvent('options-menu-select', { detail: { itemId: 'move:nowhere' } })
    );
    await tick();
    seen.stop();
    expect(seen.events.map((event) => event.type)).toEqual([
      'open-card',
      'open-options-menu',
      'notification',
    ]);
    expect(onShell).toEqual([]);
  });

  it('lets the strip’s requests through, bubbling', async () => {
    const el = mountShell(
      boardInput({
        view: { type: 'board', path: 'docs/tasks/stage1/phase2' },
        extras: extrasFor({ stage: 1, phase: 2, boardPath: 'docs/tasks/stage1/phase2' }),
      })
    );
    attachHost(el, snapshotOf());
    const seen = collect(['open-options-menu', 'notification', 'reload-request']);
    stripOf(el).querySelector<HTMLElement>('.tasks-close')!.click();
    stripOf(el).querySelector<HTMLElement>('.tasks-set-current')!.click();
    await tick();
    seen.stop();
    expect(seen.events.map((event) => event.type)).toEqual([
      'open-options-menu',
      'notification',
      'reload-request',
    ]);
  });
});

describe('<spl-tasks-app> check-in', () => {
  const ONBOARDING = `${BOARD}/briefs/onboarding.md`;
  const LOGIN = `${BOARD}/specs/login.md`;

  /** A board with a column move, an edit, a moved pool card, the order file and housekeeping. */
  function changedBoard(): SharedTaskBoardState {
    const state = structuredClone(BOARD_STATE);
    const [onboarding, login] = state.cards;
    Object.assign(onboarding!, {
      changed: true,
      dirty: true,
      versionColumn: 'todo',
      column: 'done',
    });
    Object.assign(login!, { changed: true, dirty: false });
    state.pool.cards = state.pool.cards.map((card) => ({
      ...card,
      changed: true,
      movedFrom: 'docs/tasks/unassigned/briefs/old-idea.md',
    }));
    state.pool.order = { changed: true };
    state.housekeeping = [
      { path: MANIFEST, kind: 'manifest' },
      { path: 'docs/tasks/stage1/phase2/specs/.gitkeep', kind: 'scaffold' },
    ];
    return state;
  }

  function changedStage(): SharedTaskStageState {
    const board = changedBoard();
    const state = structuredClone(STAGE_STATE);
    state.phases[0]!.cards = board.cards;
    state.pool = board.pool;
    state.housekeeping = board.housekeeping;
    return state;
  }

  const checkIn = (el: TasksApp): void =>
    boardOf(el).querySelector<HTMLElement>('.board-checkin')!.click();

  it('opens its review on the request’s cards, order file and housekeeping, in its own words', () => {
    const state = changedBoard();
    const el = mountShell(boardInput({ state }));
    checkIn(el);
    const review = reviewOf(el);
    expect(review.isOpen).toBe(true);
    expect(reviewRows(el)).toEqual([
      { checked: true, path: ONBOARDING, label: 'todo → done', group: null },
      { checked: true, path: LOGIN, label: 'content edited', group: null },
      {
        checked: true,
        path: 'docs/tasks/unassigned/briefs/old-idea.md → docs/tasks/unassigned/briefs/idea.md',
        label: 'moved',
        group: null,
      },
      { checked: true, path: state.pool.orderPath, label: 'backlog priority', group: null },
      { checked: true, path: MANIFEST, label: 'pointer / tags', group: null },
      {
        checked: true,
        path: 'docs/tasks/stage1/phase2/specs/.gitkeep',
        label: 'new folder',
        group: null,
      },
    ]);
    expect(review.querySelector<HTMLInputElement>('.checkin-review-title')!.value).toBe(
      `Tasks check-in: ${state.board.label}`
    );
    const shown = review.textContent!.toLowerCase();
    expect(shown).toContain('check in');
    expect(shown).not.toContain('commit');
    expect(shown).not.toContain('pull request');
  });

  it('groups a stage’s rows by phase, the pool and config apart', () => {
    const el = mountShell(stageInput({ state: changedStage() }));
    checkIn(el);
    expect(reviewRows(el).map((row) => [row.group, row.label])).toEqual([
      ['Phase 1', 'todo → done'],
      ['Phase 1', 'content edited'],
      // A folder made for a phase sits under it, the phases in order and the pool last.
      ['Phase 2', 'new folder'],
      ['Pool & config', 'moved'],
      ['Pool & config', 'backlog priority'],
      ['Pool & config', 'pointer / tags'],
    ]);
    expect(reviewOf(el).querySelector<HTMLInputElement>('.checkin-review-title')!.value).toBe(
      'Tasks check-in: Stage 1'
    );
  });

  it('asks `checkin` by path, a moved card’s old path too, with the board and stage as context', async () => {
    const state = changedBoard();
    const el = mountShell(boardInput({ state }));
    const asked: AppOp<TasksElementOps & AppShellOps>[] = [];
    answerOps<TasksElementOps & AppShellOps>(el, (op) => {
      asked.push(op);
      return ok({ status: 'done' });
    });
    checkIn(el);
    const review = reviewOf(el);
    for (const path of [LOGIN, state.pool.orderPath, MANIFEST]) {
      review.querySelector<HTMLInputElement>(`[data-path="${path}"]`)!.click();
    }
    review.querySelector<HTMLButtonElement>('[data-answer="confirm"]')!.click();
    await tick();
    expect(asked).toEqual([
      {
        type: 'checkin',
        paths: [
          ONBOARDING,
          'docs/tasks/unassigned/briefs/idea.md',
          'docs/tasks/unassigned/briefs/old-idea.md',
          'docs/tasks/stage1/phase2/specs/.gitkeep',
        ],
        title: `Tasks check-in: ${state.board.label}`,
        context: { boardPath: BOARD, stage: null },
      },
    ]);
    expect(review.isOpen).toBe(false);
    // `done`: nothing is left in flight.
    expect(boardOf(el).querySelector('.card-badge--checkin-pending')).toBeNull();
  });

  it('after `started`, marks the paths in flight until the host says it settled', async () => {
    const el = mountShell(boardInput({ state: changedBoard() }));
    answerOps<AppShellOps>(el, () => ok({ status: 'started', message: 'Checking in…' }));
    checkIn(el);
    const review = reviewOf(el);
    review.querySelector<HTMLInputElement>(`[data-path="${LOGIN}"]`)!.click();
    review.querySelector<HTMLButtonElement>('[data-answer="confirm"]')!.click();
    await tick();
    const pending = (): string[] =>
      [...boardOf(el).querySelectorAll('.card-badge--checkin-pending')].map(
        (badge) => badge.closest<HTMLElement>('[data-path]')!.dataset.path!
      );
    expect(pending().sort()).toEqual([ONBOARDING, 'docs/tasks/unassigned/briefs/idea.md']);
    expect(pending()).not.toContain(LOGIN);
    el.checkinSettled();
    expect(pending()).toEqual([]);
  });

  it('follows the state set again while it is open, keeping the checks', () => {
    const state = changedBoard();
    const el = mountShell(boardInput({ state }));
    checkIn(el);
    reviewOf(el).querySelector<HTMLInputElement>(`[data-path="${ONBOARDING}"]`)!.click();
    const next = structuredClone(state);
    next.housekeeping = [];
    next.pool.order = { changed: false };
    el.setState(boardInput({ state: next }));
    expect(reviewRows(el).map((row) => [row.path, row.checked])).toEqual([
      [ONBOARDING, false],
      [LOGIN, true],
      ['docs/tasks/unassigned/briefs/old-idea.md → docs/tasks/unassigned/briefs/idea.md', true],
    ]);
  });

  it('takes the host’s words and branch', () => {
    const words = { ...TASKS_CHECKIN_WORDS, heading: 'Commit', confirm: 'Commit' };
    const el = mountShell(
      boardInput({
        state: changedBoard(),
        checkin: { words, branch: { current: null, offerNew: true } },
      })
    );
    checkIn(el);
    const review = reviewOf(el);
    expect(review.querySelector('[data-answer="confirm"]')!.textContent).toBe('Commit');
    expect(review.querySelector('.checkin-review-detached')).not.toBeNull();
  });
});

describe('<spl-tasks-app> hostile input', () => {
  it.each([
    ['a board', boardInput()],
    ['a stage', stageInput()],
    ['the empty state', emptyInput()],
    ['a view it does not know', boardInput({ view: { type: 'calendar' }, state: null })],
  ])('escapes every string of %s', async (_name, input) => {
    const el = mountShell(hostile(input, { except: HOSTILE_EXCEPT }));
    await el.whenReady();
    expectNoHostileMarkup(el);
  });
});

describeAppElementContract<AppShellInput, TasksApp>('spl-tasks-app', {
  state: hostile(boardInput(), { except: HOSTILE_EXCEPT }),
  trigger: (el) => {
    el.querySelector<HTMLElement>('.board-new-card')!.click();
    confirmNewCard(el, 'A card');
  },
});
