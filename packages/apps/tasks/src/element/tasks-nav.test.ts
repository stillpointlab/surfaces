// @vitest-environment jsdom
/// <reference lib="dom" />
import { answerOps, fail, ok, setErrorHandler } from '@stillpointlab/common-format/app';
import { describeAppElementContract } from '@stillpointlab/common-format/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './tasks-nav.js';

import type { TasksNav, TasksNavLinks, TasksNavOps, TasksNavState } from './tasks-nav.js';
import type { AppOp, Result } from '@stillpointlab/common-format/app';

// The strip's rules (moved from Context Manager's renderTasksNavStrip and
// tasksNav.ts) and every control's op or request.

const host = vi.fn<(op: AppOp<TasksNavOps>) => Promise<Result<object>>>();
const notified = vi.fn();
const navigated = vi.fn();
const reloads = vi.fn();
const reported = vi.fn();

const BASE = '/tasks/view_1';
const LINKS: TasksNavLinks = {
  stage: (stage) => `${BASE}/stage/${stage}`,
  phase: (stage, phase) => `${BASE}/stage/${stage}/phase/${phase}`,
  board: (path) => `${BASE}?path=${encodeURIComponent(path)}`,
};

const NAV = {
  stages: [
    {
      stage: 2,
      phases: [{ phase: 1, path: 'docs/tasks/stage2/phase1', label: 'Phase 1' }],
    },
    {
      stage: 3,
      phases: [
        { phase: 6, path: 'docs/tasks/stage3/phase6', label: 'Phase 6' },
        { phase: 7, path: 'docs/tasks/stage3/phase7', label: 'Phase 7' },
      ],
    },
  ],
  other: [{ path: 'docs/other/board', label: 'Other <board>' }],
};

const state = (overrides: Partial<TasksNavState> = {}): TasksNavState => ({
  nav: NAV,
  current: { stage: 3, phase: 6, other: false, boardPath: 'docs/tasks/stage3/phase6' },
  currentPointer: { stage: 3, phase: 6 },
  currentPointerPath: 'docs/tasks/stage3/phase6',
  doneColumn: 'done',
  ...overrides,
});

const mount = (next: TasksNavState = state(), links: TasksNavLinks | null = LINKS): TasksNav => {
  const el = document.createElement('spl-tasks-nav') as TasksNav;
  el.links = links;
  document.body.appendChild(el);
  el.addEventListener('notification', (event) => notified((event as CustomEvent).detail));
  el.addEventListener('navigate', (event) => navigated((event as CustomEvent).detail.href));
  el.addEventListener('reload-request', () => reloads());
  el.setState(next);
  return el;
};

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const answerNext = (result: Result<object>): void => {
  host.mockImplementationOnce(() => Promise.resolve(result));
};
const change = (select: HTMLSelectElement, value: string): void => {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
};
const selectClose = (el: TasksNav, itemId: 'close-phase' | 'close-stage'): void => {
  el.dispatchEvent(new CustomEvent('options-menu-select', { detail: { itemId } }));
};

let stopHost: () => void = () => {};
beforeEach(() => {
  host.mockImplementation(() => new Promise(() => {}));
  stopHost = answerOps<TasksNavOps>(document, (op) => host(op));
  setErrorHandler((message) => reported(message));
});
afterEach(() => {
  stopHost();
  document.body.innerHTML = '';
  for (const mock of [host, notified, navigated, reloads, reported]) mock.mockReset();
});

describe('the strip', () => {
  it('renders a tab per stage, the active one holding its phase select, then + stage', async () => {
    const el = mount();
    await el.whenReady();
    const tabs = [...el.querySelectorAll('.tasks-tab:not(.tasks-tab--other)')];
    expect(tabs.map((tab) => tab.querySelector('.tasks-tab-link')!.textContent)).toEqual([
      'Stage 2',
      'Stage 3',
    ]);
    expect(tabs.map((tab) => tab.classList.contains('is-active'))).toEqual([false, true]);
    expect(tabs[0]!.querySelector('select')).toBeNull();
    expect(el.querySelector('.tasks-tab-link')!.getAttribute('href')).toBe(`${BASE}/stage/2`);
    const options = [...el.querySelectorAll<HTMLOptionElement>('.tasks-tab-filter option')];
    expect(options.map((option) => [option.value, option.textContent, option.selected])).toEqual([
      ['', 'All', false],
      ['6', 'Phase 6 ★', true],
      ['7', 'Phase 7', false],
      ['__new__', '+ New phase', false],
    ]);
    expect(el.querySelector<HTMLSelectElement>('.tasks-tab-filter')!.dataset.stage).toBe('3');
    expect(el.querySelector('.tasks-new-stage')!.textContent).toBe('+ stage');
  });

  it('marks the pointer phase ★ current, and offers Set current on another listed phase', () => {
    let el = mount();
    expect(el.querySelector('.tasks-current-marker')!.textContent).toBe('★ current');
    expect(el.querySelector('.tasks-set-current')).toBeNull();

    el.remove();
    el = mount(state({ current: { stage: 3, phase: 7, other: false, boardPath: '' } }));
    expect(el.querySelector('.tasks-current-marker')).toBeNull();
    const button = el.querySelector<HTMLButtonElement>('.tasks-set-current')!;
    expect([button.dataset.stage, button.dataset.phase]).toEqual(['3', '7']);
  });

  it('a gap phase (not in the nav) gets neither Set current nor the marker', () => {
    const el = mount(state({ current: { stage: 3, phase: 9, other: false, boardPath: '' } }));
    expect(el.querySelector('.tasks-set-current')).toBeNull();
    expect(el.querySelector('.tasks-current-marker')).toBeNull();
  });

  it('the stage view selects All and offers no pointer control', () => {
    const el = mount(state({ current: { stage: 3, phase: null, other: false, boardPath: '' } }));
    expect(el.querySelector<HTMLSelectElement>('.tasks-tab-filter')!.value).toBe('');
    expect(el.querySelector('.tasks-set-current, .tasks-current-marker')).toBeNull();
  });

  it('puts boards outside the stages in a Boards… bucket, escaped', () => {
    const el = mount(
      state({ current: { stage: null, phase: null, other: true, boardPath: 'docs/other/board' } })
    );
    const bucket = el.querySelector('.tasks-tab--other')!;
    expect(bucket.classList.contains('is-active')).toBe(true);
    const options = [...bucket.querySelectorAll<HTMLOptionElement>('option')];
    expect(options.map((option) => [option.value, option.textContent, option.selected])).toEqual([
      ['', 'Boards…', false],
      ['docs/other/board', 'Other <board>', true],
    ]);
    expect(el.querySelector('.tasks-tab.is-active:not(.tasks-tab--other)')).toBeNull();
  });

  it('has no bucket without other boards, and no Close… without a pointer', () => {
    const el = mount(
      state({ nav: { ...NAV, other: [] }, currentPointer: null, currentPointerPath: null })
    );
    expect(el.querySelector('.tasks-tab--other')).toBeNull();
    expect(el.querySelector('.tasks-close')).toBeNull();
    expect(el.querySelector('.tasks-current-marker')).toBeNull();
  });

  it('without links, renders stage names as text', () => {
    const el = mount(state(), null);
    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('.tasks-tab-link')!.textContent).toBe('Stage 2');
  });

  it('a new state re-renders the strip and keeps the close dialog attached', () => {
    const el = mount();
    const dialog = el.querySelector('#close-dialog');
    el.setState(state({ currentPointer: { stage: 3, phase: 7 } }));
    expect(el.querySelector('#close-dialog')).toBe(dialog);
    expect(el.lastElementChild!.classList.contains('tasks-nav-dialogs')).toBe(true);
    expect(el.querySelector('.tasks-set-current')).not.toBeNull();
  });
});

describe('navigation', () => {
  it('choosing a phase, or All, asks to go to its link', () => {
    const el = mount();
    const select = el.querySelector<HTMLSelectElement>('.tasks-tab-filter')!;
    change(select, '7');
    change(el.querySelector<HTMLSelectElement>('.tasks-tab-filter')!, '');
    expect(navigated.mock.calls).toEqual([[`${BASE}/stage/3/phase/7`], [`${BASE}/stage/3`]]);
    expect(host).not.toHaveBeenCalled();
  });

  it('choosing a board from the bucket asks to go to its link', () => {
    const el = mount();
    change(el.querySelector<HTMLSelectElement>('.tasks-other-select')!, 'docs/other/board');
    expect(navigated).toHaveBeenCalledWith(`${BASE}?path=docs%2Fother%2Fboard`);
  });
});

describe('creating a stage or phase', () => {
  it('+ stage asks create-stage-phase, announces it, and goes to the new phase', async () => {
    const el = mount();
    answerNext(ok({ stage: 4, phase: 1 }));
    el.querySelector<HTMLButtonElement>('.tasks-new-stage')!.click();
    await flush();

    expect(host.mock.calls[0]![0]).toEqual({ type: 'create-stage-phase', kind: 'stage' });
    expect(notified).toHaveBeenCalledWith({
      message: 'Created stage 4 / phase 1 — local until check-in.',
      type: 'success',
    });
    expect(navigated).toHaveBeenCalledWith(`${BASE}/stage/4/phase/1`);
  });

  it('+ New phase snaps the select back and asks for the stage’s next phase', async () => {
    const el = mount();
    answerNext(ok({ stage: 3, phase: 8 }));
    const select = el.querySelector<HTMLSelectElement>('.tasks-tab-filter')!;
    change(select, '__new__');

    expect(select.value).toBe('6');
    await flush();
    expect(host.mock.calls[0]![0]).toEqual({ type: 'create-stage-phase', kind: 'phase', stage: 3 });
    expect(navigated).toHaveBeenCalledWith(`${BASE}/stage/3/phase/8`);
  });

  it('a refusal is reported and notified, and goes nowhere', async () => {
    const el = mount();
    answerNext(fail('NOT_FOUND', 'Task stage with id 3 not found'));
    el.querySelector<HTMLButtonElement>('.tasks-new-stage')!.click();
    await flush();

    expect(notified).toHaveBeenCalledWith({
      message: 'Task stage with id 3 not found',
      type: 'error',
    });
    expect(reported).toHaveBeenCalledWith('Failed to create the stage/phase');
    expect(navigated).not.toHaveBeenCalled();
  });
});

describe('Set current', () => {
  const mountOnPhase7 = (): TasksNav =>
    mount(state({ current: { stage: 3, phase: 7, other: false, boardPath: '' } }));

  it('asks set-current, announces it, and asks for a reload', async () => {
    const el = mountOnPhase7();
    answerNext(ok());
    el.querySelector<HTMLButtonElement>('.tasks-set-current')!.click();
    await flush();

    expect(host.mock.calls[0]![0]).toEqual({ type: 'set-current', stage: 3, phase: 7 });
    expect(notified).toHaveBeenCalledWith({
      message: 'Current phase updated — local until check-in.',
      type: 'success',
    });
    expect(reloads).toHaveBeenCalledOnce();
  });

  it('a refusal notifies and asks for no reload', async () => {
    const el = mountOnPhase7();
    answerNext(fail('API_ERROR', ''));
    el.querySelector<HTMLButtonElement>('.tasks-set-current')!.click();
    await flush();

    expect(notified).toHaveBeenCalledWith({
      message: 'Could not set the current phase.',
      type: 'error',
    });
    expect(reloads).not.toHaveBeenCalled();
  });
});

describe('closing a phase or stage', () => {
  const CARDS = [
    { path: 'docs/tasks/stage3/phase6/specs/a.md', title: 'a.md', column: 'doing' },
    { path: 'docs/tasks/stage3/phase6/specs/b.md', title: 'b.md', column: 'done' },
    { path: 'docs/tasks/stage3/phase6/specs/c.md', title: 'c.md', column: null },
  ];
  const isOpen = (el: TasksNav): boolean =>
    el.querySelector('#close-dialog')!.hasAttribute('is-open');

  it('Close… raises the host’s options menu with phase and stage', () => {
    const el = mount();
    let detail: { items: { id: string }[]; anchor: Element } | null = null;
    el.addEventListener('open-options-menu', (event) => {
      detail = (event as CustomEvent).detail;
    });
    el.querySelector<HTMLButtonElement>('.tasks-close')!.click();

    expect(detail!.items.map((item) => item.id)).toEqual(['close-phase', 'close-stage']);
    expect(detail!.anchor).toBe(el.querySelector('.tasks-close'));
  });

  it('offers the pointer phase’s unfinished cards, all checked', async () => {
    const el = mount();
    answerNext(ok({ cards: CARDS }));
    selectClose(el, 'close-phase');
    await flush();

    expect(host.mock.calls[0]![0]).toEqual({
      type: 'close-candidates',
      path: 'docs/tasks/stage3/phase6',
    });
    expect(isOpen(el)).toBe(true);
    expect(el.querySelector('#close-dialog')!.getAttribute('title')).toBe('Close phase');
    expect(el.querySelector('#close-summary')!.textContent).toBe(
      "Closes stage 3 / phase 6: the current pointer advances to stage 3 / next phase (created if it doesn't exist yet)."
    );
    const rows = [...el.querySelectorAll<HTMLInputElement>('#close-cards input')];
    expect(rows.map((input) => [input.dataset.path, input.checked])).toEqual([
      [CARDS[0]!.path, true],
      [CARDS[2]!.path, true],
    ]);
    expect(el.querySelector('#close-cards')!.textContent).toContain('needs attention');
  });

  it('a stage close names the next stage; a clean phase says so', async () => {
    const el = mount();
    answerNext(ok({ cards: [CARDS[1]] }));
    selectClose(el, 'close-stage');
    await flush();

    expect(el.querySelector('#close-dialog')!.getAttribute('title')).toBe('Close stage');
    expect(el.querySelector('#close-summary')!.textContent).toContain('stage 4 / phase 1');
    expect(el.querySelector('#close-cards')!.textContent!.trim()).toBe(
      'No unfinished cards — clean close.'
    );
  });

  it('a candidates refusal shows in the list', async () => {
    const el = mount();
    answerNext(fail('NOT_FOUND', 'gone'));
    selectClose(el, 'close-phase');
    await flush();

    expect(el.querySelector('#close-cards')!.textContent!.trim()).toBe(
      'Could not load the phase board.'
    );
  });

  it('confirm closes with the checked paths, announces it and goes to the target', async () => {
    const el = mount();
    answerNext(ok({ cards: CARDS }));
    selectClose(el, 'close-phase');
    await flush();
    el.querySelector<HTMLInputElement>(
      `#close-cards input[data-path="${CARDS[2]!.path}"]`
    )!.checked = false;
    answerNext(ok({ target: { stage: 3, phase: 7 }, moved: 1, created: true }));

    el.querySelector<HTMLButtonElement>('#confirm-close')!.click();
    expect(isOpen(el)).toBe(false);
    await flush();

    expect(host.mock.calls[1]![0]).toEqual({
      type: 'close',
      kind: 'phase',
      paths: [CARDS[0]!.path],
    });
    expect(notified).toHaveBeenCalledWith({
      message:
        'Closed — pointer now at stage 3 / phase 7 (created), 1 card(s) moved. Local until check-in.',
      type: 'success',
    });
    expect(navigated).toHaveBeenCalledWith(`${BASE}/stage/3/phase/7`);
  });

  it('a close refusal notifies and goes nowhere; Cancel asks nothing', async () => {
    const el = mount();
    answerNext(ok({ cards: [] }));
    selectClose(el, 'close-phase');
    await flush();
    el.querySelector<HTMLButtonElement>('#cancel-close')!.click();
    expect(isOpen(el)).toBe(false);
    expect(host).toHaveBeenCalledOnce();

    answerNext(ok({ cards: [] }));
    selectClose(el, 'close-phase');
    await flush();
    answerNext(fail('TASKS_NO_CURRENT_POINTER', 'tasks.yaml has no current: pointer'));
    el.querySelector<HTMLButtonElement>('#confirm-close')!.click();
    await flush();

    expect(notified).toHaveBeenCalledWith({
      message: 'tasks.yaml has no current: pointer',
      type: 'error',
    });
    expect(navigated).not.toHaveBeenCalled();
  });

  it('without a pointer, a close selection opens nothing', async () => {
    const el = mount(state({ currentPointer: null, currentPointerPath: null }));
    selectClose(el, 'close-phase');
    await flush();
    expect(isOpen(el)).toBe(false);
    expect(host).not.toHaveBeenCalled();
  });
});

describeAppElementContract<TasksNavState, TasksNav>('spl-tasks-nav', {
  state: state(),
  trigger: (el) => el.querySelector<HTMLButtonElement>('.tasks-new-stage')!.click(),
});
