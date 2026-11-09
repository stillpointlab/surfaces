// @vitest-environment jsdom
/// <reference lib="dom" />
import { answerOps, fail, ok } from '@stillpointlab/common-format/app';
import { describeAppElementContract } from '@stillpointlab/common-format/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './task-board.js';
import { BUILTIN_TASK_KINDS } from '../types.js';

import { TaskBoard } from './task-board.js';

import type { TaskBoardOps } from './task-board.js';
import type { SharedTaskBoardState, SharedTaskCard } from '../types.js';
import type { AppOp, Result } from '@stillpointlab/common-format/app';

const INSTANCE_PUBLIC_ID = 'view_board00000001';

// The board's host (ADR-0037): every op the board asks lands here. A test
// queues the answer it wants; unqueued ops stay pending, like a slow server.
const host = vi.fn<(op: AppOp<TaskBoardOps>) => Promise<Result<object>>>();

// The fixture cards by the ids the state gives them, and the paths that
// identify them on the board.
const P: Record<number, string> = {
  11: 'docs/tasks/stage1/phase1/briefs/idea.md',
  12: 'docs/tasks/stage1/phase1/specs/task_a.md',
  13: 'docs/tasks/stage1/phase1/specs/task_b.md',
  21: 'docs/tasks/unassigned/briefs/back_idea.md',
  22: 'docs/tasks/unassigned/specs/back_task.md',
  31: 'docs/tasks/stage1/phase1/specs/evil.md',
};
/** A selector for the card rendered for fixture card `id`. */
const sel = (id: number): string => `[data-path="${P[id]}"]`;
/** The fixture id of a rendered card, as a string (null when it is not one). */
const idOf = (el: Element): string | null =>
  Object.entries(P).find(([, path]) => path === el.getAttribute('data-path'))?.[0] ?? null;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const STATE: SharedTaskBoardState = {
  board: {
    path: 'docs/tasks/stage1/phase1',
    label: 'Stage 1 — Phase 1',
    paths: {
      brief: ['docs/tasks/stage1/phase1/briefs/idea.md'],
      spec: [
        'docs/tasks/stage1/phase1/specs/task_a.md',
        'docs/tasks/stage1/phase1/specs/task_b.md',
      ],
      spike: [],
      review: [],
      test: [],
    },
  },
  columns: [
    { id: 'briefed', label: 'Briefed' },
    { id: 'in-progress', label: 'In progress' },
    { id: 'done', label: 'Done' },
  ],
  cards: [
    {
      title: 'idea.md',
      path: 'docs/tasks/stage1/phase1/briefs/idea.md',
      kind: 'brief',
      column: 'briefed',
      dirty: false,
      changed: false,
      tags: ['infra'],
    },
    {
      title: 'task_a.md',
      frontmatterTitle: 'Implement login flow',
      path: 'docs/tasks/stage1/phase1/specs/task_a.md',
      kind: 'spec',
      column: 'in-progress',
      dirty: true,
      changed: true,
      versionColumn: 'briefed',
    },
    {
      title: 'task_b.md',
      frontmatterTitle: '<img src=x onerror=alert(1)>',
      path: 'docs/tasks/stage1/phase1/specs/task_b.md',
      kind: 'spec',
      column: null,
      parseError: 'frontmatter YAML parse error: bad',
      dirty: false,
      changed: false,
    },
  ],
  pool: {
    path: 'docs/tasks/unassigned',
    orderPath: 'docs/tasks/unassigned/order.yaml',
    cards: [
      {
        title: 'back_idea.md',
        path: 'docs/tasks/unassigned/briefs/back_idea.md',
        kind: 'brief',
        column: null,
        dirty: false,
        changed: false,
      },
      {
        title: 'back_task.md',
        path: 'docs/tasks/unassigned/specs/back_task.md',
        kind: 'spec',
        column: null,
        dirty: false,
        changed: true,
      },
    ],
    order: { changed: true },
  },
  tags: ['infra', 'ui'],
  doneColumn: 'done',
  defaultColumn: 'briefed',
  kinds: BUILTIN_TASK_KINDS.map((kind) =>
    kind.id === 'brief' ? { ...kind, template: 'docs/tasks/brief.template.md' } : { ...kind }
  ),
  housekeeping: [],
};

const mount = (state: SharedTaskBoardState = STATE): TaskBoard => {
  const el = document.createElement('spl-task-board') as TaskBoard;
  el.setAttribute('storage-key', INSTANCE_PUBLIC_ID);
  document.body.appendChild(el);
  el.setState(copy(state));
  return el;
};

describe('TaskBoard component', () => {
  let stopHost: () => void = () => {};
  beforeEach(() => {
    host.mockImplementation(() => new Promise(() => {}));
    stopHost = answerOps<TaskBoardOps>(document, (op) => host(op));
  });
  afterEach(() => {
    stopHost();
    document.body.innerHTML = '';
    host.mockReset();
  });

  it('exposes the state it was given via boardState, and settles', async () => {
    const el = mount();
    await el.whenReady();
    expect(el.hasAttribute('ready')).toBe(true);
    expect(el.boardState?.board.path).toBe(STATE.board.path);
    expect(el.boardState?.defaultColumn).toBe('briefed');
    expect(el.boardState?.doneColumn).toBe('done');
  });

  it('renders the pool first, then the manifest columns in order', () => {
    const el = mount();
    const ids = [...el.querySelectorAll('.board-column')].map((c) =>
      c.getAttribute('data-column-id')
    );
    expect(ids).toEqual(['__pool__', 'briefed', 'in-progress', 'done']);
    expect(el.querySelector('.board-column--pool')).not.toBeNull();
  });

  it('the pool is a sidebar flanking the board, not a column inside it', () => {
    const el = mount();
    // Sibling ahead of .task-board — the page grid places it beside the tabs
    // row (spec board_pool_sidebar); it must never sit among the columns.
    expect(el.querySelector('aside.board-pool-sidebar')).not.toBeNull();
    expect(el.querySelector('.task-board .board-column--pool')).toBeNull();
    expect(el.querySelector('.board-columns .board-column--pool')).toBeNull();
  });

  describe('pool collapse (spec board_chrome_tidy)', () => {
    const storageKey = `taskBoard.poolCollapsed.${INSTANCE_PUBLIC_ID}`;

    afterEach(() => {
      window.localStorage.clear();
    });

    it('collapses the pool to a toolbar toggle with the live count, and persists', () => {
      const el = mount();
      (el.querySelector('.pool-collapse') as HTMLElement).click();
      expect(el.querySelector('.board-column--pool')).toBeNull();
      // The manifest columns are untouched — only the pool panel goes away.
      expect([...el.querySelectorAll('.board-column')]).toHaveLength(3);
      const toggle = el.querySelector('.board-pool-toggle') as HTMLElement;
      expect(toggle.textContent).toContain('Unassigned (2)');
      expect(window.localStorage.getItem(storageKey)).toBe('1');
    });

    it('reopens from the toggle and clears the persisted state', () => {
      const el = mount();
      (el.querySelector('.pool-collapse') as HTMLElement).click();
      (el.querySelector('.board-pool-toggle') as HTMLElement).click();
      expect(el.querySelector('.board-column--pool')).not.toBeNull();
      expect(el.querySelector('.board-pool-toggle')).toBeNull();
      expect(window.localStorage.getItem(storageKey)).toBeNull();
    });

    it('mounts collapsed when the instance was collapsed before', () => {
      window.localStorage.setItem(storageKey, '1');
      const el = mount();
      expect(el.querySelector('.board-column--pool')).toBeNull();
      expect(el.querySelector('.board-pool-toggle')).not.toBeNull();
    });
  });

  it('places cards in their columns; null-column cards land in needs-attention', () => {
    const el = mount();
    const inColumn = (id: string) =>
      [...el.querySelectorAll(`[data-column-id="${id}"] .board-card`)].map((c) => idOf(c));
    expect(inColumn('briefed')).toEqual(['11']);
    expect(inColumn('in-progress')).toEqual(['12']);
    expect(inColumn('done')).toEqual([]);
    const attention = [...el.querySelectorAll('.board-attention .board-card')].map((c) => idOf(c));
    expect(attention).toEqual(['13']);
  });

  it('renders metadata badges: blocked (with reason) and pr', () => {
    const state = {
      ...STATE,
      cards: STATE.cards.map((c) =>
        c.path === 'docs/tasks/stage1/phase1/briefs/idea.md'
          ? { ...c, blocked: 'waiting on review', pr: '388' }
          : c
      ),
    };
    const el = mount(state);
    const blocked = el.querySelector(`${sel(11)} .card-badge--blocked`);
    expect(blocked?.getAttribute('title')).toBe('waiting on review');
    expect(el.querySelector(`${sel(11)} .card-badge--meta-pr`)?.textContent).toBe('#388');
  });

  it('a cached prState decorates the pr chip with a state class + title (spec task_board_refresh)', () => {
    const state = {
      ...STATE,
      cards: STATE.cards.map((c) =>
        c.path === 'docs/tasks/stage1/phase1/briefs/idea.md'
          ? { ...c, pr: '388', prState: 'merged' as const }
          : c.path === 'docs/tasks/stage1/phase1/specs/task_a.md'
            ? { ...c, pr: 'https://github.com/o/r/pull/9', prState: 'open' as const }
            : c
      ),
    };
    const el = mount(state);
    const merged = el.querySelector(`${sel(11)} .card-badge--meta-pr`)!;
    expect(merged.classList.contains('card-badge--meta-pr-merged')).toBe(true);
    expect(merged.getAttribute('title')).toBe('Pull request 388 — merged');
    const open = el.querySelector(`${sel(12)} a.card-badge--meta-pr`)!;
    expect(open.classList.contains('card-badge--meta-pr-open')).toBe(true);
    expect(open.getAttribute('title')).toBe('Pull request — open');
  });

  it('a pr chip without cached state renders exactly as before', () => {
    const state = {
      ...STATE,
      cards: STATE.cards.map((c) =>
        c.path === 'docs/tasks/stage1/phase1/briefs/idea.md' ? { ...c, pr: '388' } : c
      ),
    };
    const el = mount(state);
    const chip = el.querySelector(`${sel(11)} .card-badge--meta-pr`)!;
    expect(chip.getAttribute('title')).toBe('Pull request 388');
    expect([...chip.classList].some((cls) => cls.startsWith('card-badge--meta-pr-'))).toBe(false);
  });

  it('an in-flight check-in replaces the stale PR chip with a pending chip until cleared', () => {
    const state = {
      ...STATE,
      cards: STATE.cards.map((c) =>
        c.path === 'docs/tasks/stage1/phase1/briefs/idea.md'
          ? { ...c, checkinPrUrl: 'https://github.com/o/r/pull/7' }
          : c
      ),
    };
    const el = mount(state);
    // Before: the previous check-in's PR link renders.
    expect(el.querySelector(`${sel(11)} a.card-badge--pr`)?.getAttribute('href')).toBe(
      'https://github.com/o/r/pull/7'
    );

    // During the job: the stale link is replaced by the pending chip — only
    // for submitted cards.
    el.markCheckinInFlight([P[11]]);
    expect(el.querySelector(`${sel(11)} a.card-badge--pr`)).toBeNull();
    expect(el.querySelector(`${sel(11)} .card-badge--checkin-pending`)?.textContent).toBe('PR…');
    expect(el.querySelector(`${sel(12)} .card-badge--checkin-pending`)).toBeNull();

    // Terminal event: the chip comes back (the page then refreshes state).
    el.clearCheckinInFlight();
    expect(el.querySelector(`${sel(11)} a.card-badge--pr`)).not.toBeNull();
    expect(el.querySelector(`${sel(11)} .card-badge--checkin-pending`)).toBeNull();
  });

  it('renders tag chips on board cards and a filter bar; hiding a tag hides its cards', () => {
    const el = mount();
    expect(el.querySelector(`${sel(11)} .card-tag`)?.textContent).toBe('infra');
    const filterTags = [...el.querySelectorAll('.board-filter-tag')].map((b) =>
      b.getAttribute('data-tag')
    );
    expect(filterTags).toEqual(['infra', '(no tags)']);

    (el.querySelector('[data-action="toggle-tag"][data-tag="infra"]') as HTMLElement).click();
    expect(el.querySelector(`[data-column-id="briefed"] ${sel(11)}`)).toBeNull();
    expect(el.querySelector('[data-column-id="briefed"] .column-count')?.textContent).toBe('0');

    (el.querySelector('[data-action="toggle-tag"][data-tag="infra"]') as HTMLElement).click();
    expect(el.querySelector(`[data-column-id="briefed"] ${sel(11)}`)).not.toBeNull();
  });

  // Inclusion filter: a chip starts pressed (included) and un-presses to
  // exclude. The styling hangs off both, so the two must stay in step — they
  // were previously indistinguishable, which is what made the model read
  // backwards.
  it('filter chips mark included and excluded states in both aria and class', () => {
    const el = mount();
    const chip = (): HTMLElement =>
      el.querySelector('[data-action="toggle-tag"][data-tag="infra"]') as HTMLElement;

    expect(chip().getAttribute('aria-pressed')).toBe('true');
    expect(chip().classList.contains('is-hidden')).toBe(false);

    chip().click();
    expect(chip().getAttribute('aria-pressed')).toBe('false');
    expect(chip().classList.contains('is-hidden')).toBe(true);

    chip().click();
    expect(chip().getAttribute('aria-pressed')).toBe('true');
    expect(chip().classList.contains('is-hidden')).toBe(false);
  });

  it('renders each tag as its own chip element rather than one run of text', () => {
    const el = mount({
      ...STATE,
      cards: STATE.cards.map((card) =>
        card.path === 'docs/tasks/stage1/phase1/briefs/idea.md'
          ? { ...card, tags: ['infra', 'docs'] }
          : card
      ),
    });
    const chips = [...el.querySelectorAll(`${sel(11)} .card-tag`)].map((c) => c.textContent);
    expect(chips).toEqual(['infra', 'docs']);
  });

  it('hiding "(no tags)" hides untagged cards, pool included', () => {
    const el = mount();
    (el.querySelector('[data-action="toggle-tag"][data-tag="(no tags)"]') as HTMLElement).click();
    expect(el.querySelector(`${sel(12)}`)).toBeNull();
    expect(el.querySelectorAll('.board-card--pool').length).toBe(0);
    expect(el.querySelector(`${sel(11)}`)).not.toBeNull();
  });

  it('Tags… opens the tags dialog on the registry, the card’s tags checked', () => {
    const el = mount();
    (el.querySelector(`.card-menu-btn${sel(11)}`) as HTMLElement).click();
    el.dispatchEvent(new CustomEvent('options-menu-select', { detail: { itemId: 'set-tags' } }));

    expect(el.querySelector('#set-tags-dialog')!.hasAttribute('is-open')).toBe(true);
    const options = [...el.querySelectorAll<HTMLInputElement>('#tag-options input')];
    expect(options.map((input) => [input.dataset.tag, input.checked])).toEqual([
      ['infra', true],
      ['ui', false],
    ]);
    expect(host).not.toHaveBeenCalled();
  });

  it('renders pool cards collapsed, in order, with kind + changed badges', () => {
    const el = mount();
    const poolIds = [...el.querySelectorAll('.board-card--pool')].map((c) => idOf(c));
    expect(poolIds).toEqual(['21', '22']);
    expect(el.querySelector(`${sel(21)} .card-badge--kind`)?.textContent).toBe('b');
    expect(el.querySelector(`${sel(22)} .card-badge--dirty`)).not.toBeNull();
  });

  it('shows column counts, kind/dirty/error badges', () => {
    const el = mount();
    const poolCount = el.querySelector('[data-column-id="__pool__"] .column-count')?.textContent;
    expect(poolCount).toBe('2');
    expect(el.querySelector(`${sel(11)} .card-badge--kind-name`)).not.toBeNull();
    expect(el.querySelector(`${sel(12)} .card-badge--dirty`)).not.toBeNull();
    expect(el.querySelector(`${sel(13)} .card-badge--error`)).not.toBeNull();
  });

  it('tags each card with its kind for the accent stripe', () => {
    const el = mount();
    expect(el.querySelector(`${sel(11)}`)!.getAttribute('data-kind')).toBe('brief');
    expect(el.querySelector(`${sel(12)}`)!.getAttribute('data-kind')).toBe('spec');
    expect(el.querySelector(`${sel(13)}`)!.getAttribute('data-kind')).toBe('spec');
  });

  it('escapes untrusted card titles (repo-controlled data)', () => {
    const el = mount();
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector(`${sel(13)} .card-title`)?.textContent).toContain(
      '<img src=x onerror=alert(1)>'
    );
  });

  it('quote-escapes repo-controlled values in attribute positions', () => {
    const el = mount({
      ...STATE,
      cards: [
        {
          title: 'evil.md',
          path: 'docs/tasks/stage1/phase1/specs/evil.md',
          kind: 'spec',
          column: 'briefed',
          dirty: false,
          changed: false,
          blocked: '" data-hijacked="yes',
          pr: 'https://x" style="position:fixed',
        },
      ],
    });

    const badge = el.querySelector(`${sel(31)} .card-badge--blocked`)!;
    expect(badge.getAttribute('title')).toBe('" data-hijacked="yes');
    expect(badge.getAttribute('data-hijacked')).toBeNull();
    const link = el.querySelector(`${sel(31)} a.card-badge--meta-pr`)!;
    expect(link.getAttribute('href')).toBe('https://x" style="position:fixed');
    expect(link.getAttribute('style')).toBeNull();
  });

  it('shows the frontmatter title with the filename beneath it', () => {
    const el = mount();
    expect(el.querySelector(`${sel(12)} .card-title`)?.textContent?.trim()).toBe(
      'Implement login flow'
    );
    expect(el.querySelector(`${sel(12)} .card-path`)?.textContent).toBe('task_a.md');
  });

  it('shows just the filename when there is no frontmatter title', () => {
    const el = mount();
    expect(el.querySelector(`${sel(11)} .card-title`)?.textContent?.trim()).toBe('idea.md');
    expect(el.querySelector(`${sel(11)} .card-path`)).toBeNull();
  });

  // ADR-0023: a repo file with no digital good is a real card, rendered from
  // the tree — read-only until someone edits it (the link-on-edit slice).
  describe('tracked cards (ADR-0023)', () => {
    const TRACKED_PATH = 'docs/tasks/stage1/phase1/specs/task_c.md';
    const tracked: SharedTaskCard = {
      tracked: true,
      title: 'task_c.md',
      frontmatterTitle: 'Tracked spec',
      path: TRACKED_PATH,
      kind: 'spec',
      column: 'briefed',
      dirty: false,
      changed: false,
      tags: ['infra'],
    };
    const withTracked = (): SharedTaskBoardState => ({
      ...STATE,
      cards: [...STATE.cards, tracked],
    });
    const trackedCard = (el: TaskBoard): HTMLElement =>
      el.querySelector('.board-card--tracked') as HTMLElement;

    it('renders a tracked card in its column with a repo badge', () => {
      const el = mount(withTracked());
      const inColumn = [...el.querySelectorAll('[data-column-id="briefed"] .board-card')].map(
        (c) => (c.classList.contains('board-card--tracked') ? 'tracked' : idOf(c))
      );
      expect(inColumn).toEqual(['11', 'tracked']);
      expect(trackedCard(el).querySelector('.card-title')?.textContent).toBe('Tracked spec');
      expect(trackedCard(el).querySelector('.card-badge--tracked')).not.toBeNull();
      expect(trackedCard(el).getAttribute('data-path')).toBe(TRACKED_PATH);
    });

    it('has no card menu (no good yet — the drag or preview Edit links it)', () => {
      const el = mount(withTracked());
      expect(trackedCard(el).querySelector('.card-menu-btn')).toBeNull();
      expect(idOf(trackedCard(el))).toBeNull();
    });

    // A tracked card moves like any other: the board asks by path, and the
    // host links the file as part of answering (ADR-0023 state 1 → 2).
    it('dragging a tracked card asks for a move by path and settles on the linked card', async () => {
      const el = mount(withTracked());
      host.mockResolvedValue(
        ok({ card: { ...tracked, tracked: undefined, column: 'in-progress' } })
      );
      const column = el.querySelector('[data-column-id="in-progress"]') as HTMLElement;
      // jsdom has no layout; inject the drop target the way pointerDrag's own
      // tests do.
      const fromPoint = vi.fn().mockReturnValue(column);
      (document as { elementFromPoint?: unknown }).elementFromPoint = fromPoint;

      const pointer = (type: string, x: number): MouseEvent =>
        new MouseEvent(type, { clientX: x, clientY: 10, bubbles: true, button: 0 });
      trackedCard(el).dispatchEvent(pointer('pointerdown', 10));
      document.dispatchEvent(pointer('pointermove', 60));
      document.dispatchEvent(pointer('pointermove', 150));
      document.dispatchEvent(pointer('pointerup', 150));
      // An answer arrives through the host's promise chain: let it settle.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();

      expect(host).toHaveBeenCalledTimes(1);
      expect(host).toHaveBeenCalledWith({
        type: 'move',
        path: TRACKED_PATH,
        column: 'in-progress',
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const moved = el.querySelector(
        `[data-column-id="in-progress"] [data-path="${TRACKED_PATH}"]`
      );
      expect(moved?.classList.contains('board-card--tracked')).toBe(false);
      delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    });

    it('never joins the check-in set', () => {
      const el = mount({
        ...STATE,
        cards: [...STATE.cards, { ...tracked, changed: true }],
      });
      let detail: { cards: { path: string }[] } | null = null;
      el.addEventListener('checkin-request', (e) => {
        detail = (e as CustomEvent).detail;
      });
      (el.querySelector('[data-action="checkin"]') as HTMLElement).click();
      expect(detail!.cards.map((c) => c.path)).toEqual([P[12], P[22]]);
    });

    // Pool order is a list of PATHS, so a tracked neighbour is a legitimate
    // "insert before me" anchor rather than a hole in the ordering.
    it('keeps its place when a pool card is reordered past it', () => {
      const trackedPool: SharedTaskCard = {
        ...tracked,
        path: 'docs/tasks/unassigned/specs/tracked.md',
        column: null,
      };
      const el = mount({
        ...STATE,
        pool: { ...STATE.pool, cards: [STATE.pool.cards[0], trackedPool, STATE.pool.cards[1]] },
      });
      (el.querySelector(`.card-menu-btn${sel(22)}`) as HTMLElement).click();
      el.dispatchEvent(new CustomEvent('options-menu-select', { detail: { itemId: 'pool-up' } }));

      expect(host).toHaveBeenCalledWith({
        type: 'reorder-pool',
        paths: [
          'docs/tasks/unassigned/briefs/back_idea.md',
          'docs/tasks/unassigned/specs/back_task.md',
          'docs/tasks/unassigned/specs/tracked.md',
        ],
      });
    });

    it('opens a read-only preview with the content the host reads on click', async () => {
      host.mockResolvedValue(ok({ content: '# Tracked body' }));
      const el = mount(withTracked());

      trackedCard(el).click();
      expect(el.querySelector('.tracked-preview-loading')).not.toBeNull();
      // An answer arrives through the host's promise chain: let it settle.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(host).toHaveBeenCalledWith({ type: 'read-file', path: TRACKED_PATH });
      const preview = el.querySelector('.tracked-preview')!;
      expect(preview.querySelector('.tracked-preview-content')?.textContent).toBe('# Tracked body');
      expect(preview.querySelector('.tracked-preview-path')?.textContent).toBe(TRACKED_PATH);
      // The preview itself is read-only; "Edit in app" is the explicit link
      // moment (ADR-0023 state 1 → 2), offered once content has loaded.
      const edit = preview.querySelector('.tracked-preview-edit') as HTMLElement;
      expect(edit.dataset.path).toBe(TRACKED_PATH);

      (el.querySelector('.tracked-preview-close') as HTMLElement).click();
      expect(el.querySelector('.tracked-preview')).toBeNull();
    });

    it('Edit in app asks the host to open the card', async () => {
      host.mockResolvedValueOnce(ok({ content: '# Tracked body' }));
      const el = mount(withTracked());
      trackedCard(el).click();
      // An answer arrives through the host's promise chain: let it settle.
      await new Promise((resolve) => setTimeout(resolve, 0));

      let opened: { path: string } | null = null;
      el.addEventListener('open-card', (e) => {
        opened = (e as CustomEvent).detail;
      });
      (el.querySelector('.tracked-preview-edit') as HTMLElement).click();

      // Linking and navigating are the host's (ADR-0037).
      expect(opened).toEqual({ path: TRACKED_PATH });
      expect(host).toHaveBeenCalledTimes(1);
    });

    it('reports a failed preview load and closes the modal', async () => {
      host.mockResolvedValue(fail('REPO_FILE_UNAVAILABLE', 'nope'));
      const el = mount(withTracked());
      const notifications: string[] = [];
      el.addEventListener('notification', (e) => {
        notifications.push((e as CustomEvent).detail.message);
      });

      trackedCard(el).click();
      // An answer arrives through the host's promise chain: let it settle.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(el.querySelector('.tracked-preview')).toBeNull();
      expect(notifications).toEqual(['nope']);
    });
  });

  it('marks a card selected on click', () => {
    const el = mount();
    (el.querySelector(`${sel(12)}`) as HTMLElement).click();
    expect(el.querySelector(`${sel(12)}`)?.classList.contains('selected')).toBe(true);
  });

  it('a double-click asks the host to open the card', () => {
    const el = mount();
    let opened: { path: string } | null = null;
    el.addEventListener('open-card', (e) => {
      opened = (e as CustomEvent).detail;
    });
    (el.querySelector(sel(12)) as HTMLElement).click();
    (el.querySelector(sel(12)) as HTMLElement).click();
    expect(opened).toEqual({ path: P[12] });
  });

  describe('stage variant (ADR-0020)', () => {
    const STAGE_STATE = {
      stage: 1,
      columns: STATE.columns,
      phases: [
        {
          phase: 1,
          path: 'docs/tasks/stage1/phase1',
          label: 'Stage 1 — Phase 1',
          cards: STATE.cards,
        },
        {
          phase: 2,
          path: 'docs/tasks/stage1/phase2',
          label: 'Stage 1 — Phase 2',
          cards: [],
        },
      ],
      pool: STATE.pool,
      tags: ['infra', 'ui'],
    };

    const mountStage = (): TaskBoard => {
      const el = document.createElement('spl-task-board') as TaskBoard;
      el.setAttribute('storage-key', INSTANCE_PUBLIC_ID);
      el.setAttribute('variant', 'stage');
      document.body.appendChild(el);
      el.setStageState(copy(STAGE_STATE) as never);
      return el;
    };

    it('a stale slow refresh cannot clobber a newer one (walk §2C PR-chip lag)', async () => {
      const el = mountStage();
      const cardWithPr = (prUrl: string) => ({
        ...STAGE_STATE,
        phases: [
          {
            ...STAGE_STATE.phases[0],
            cards: [{ ...STATE.cards[1], checkinPrUrl: prUrl }],
          },
          STAGE_STATE.phases[1],
        ],
      });
      // The FIRST (older) refresh resolves LAST — with the stale PR.
      let resolveStale: (value: Result<object>) => void = () => {};
      host.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveStale = resolve;
        })
      );
      const first = (el as unknown as { refreshStage(): Promise<void> }).refreshStage();

      host.mockResolvedValueOnce(ok({ stage: cardWithPr('https://pr/16') }));
      await (el as unknown as { refreshStage(): Promise<void> }).refreshStage();
      expect(el.querySelector('.card-badge--pr')?.getAttribute('href')).toBe('https://pr/16');
      expect(host).toHaveBeenCalledWith({ type: 'refresh-stage', stage: 1 });

      resolveStale(ok({ stage: cardWithPr('https://pr/15') }));
      await first;

      // The superseded response is dropped; the chip stays on the new PR.
      expect(el.querySelector('.card-badge--pr')?.getAttribute('href')).toBe('https://pr/16');
    });

    it('renders the pool rail plus one row per phase, empty phases collapsed', () => {
      const el = mountStage();
      expect(el.querySelector('.board-column--pool')).not.toBeNull();
      const rows = [...el.querySelectorAll('.stage-row')];
      expect(rows).toHaveLength(2);
      expect(rows[1].classList.contains('stage-row--empty')).toBe(true);
      // Columns in a populated row carry their board path for cross-row drops.
      expect(
        el.querySelector('.stage-row [data-column-id="briefed"]')?.getAttribute('data-board-path')
      ).toBe('docs/tasks/stage1/phase1');
    });

    it('checkin-request carries the stage for stage-scoped check-ins', () => {
      const el = mountStage();
      let detail: { stage: number | null; cards: { path: string }[] } | null = null;
      el.addEventListener('checkin-request', (e) => {
        detail = (e as CustomEvent).detail;
      });
      (el.querySelector('.board-checkin') as HTMLElement).click();
      expect(detail!.stage).toBe(1);
      expect(detail!.cards.map((c) => c.path)).toEqual([P[12], P[22]]);
    });

    it('board-card menus offer other phases as file-move targets', () => {
      const el = mountStage();
      let items: { id: string }[] = [];
      el.addEventListener('open-options-menu', (e) => {
        items = ((e as CustomEvent).detail as { items: { id: string }[] }).items;
      });
      (el.querySelector(`.card-menu-btn${sel(12)}`) as HTMLElement).click();
      expect(items.map((i) => i.id)).toContain('move-row:docs/tasks/stage1/phase2');
    });

    it('the pool rail collapses to the toolbar toggle here too', () => {
      const el = mountStage();
      (el.querySelector('.pool-collapse') as HTMLElement).click();
      expect(el.querySelector('.board-column--pool')).toBeNull();
      expect(el.querySelector('.board-pool-toggle')).not.toBeNull();
      window.localStorage.clear();
    });
  });

  it('renders a failure message, and stays pending, until it has state', () => {
    const el = document.createElement('spl-task-board') as TaskBoard;
    document.body.appendChild(el);
    expect(el.querySelector('.board-empty')).not.toBeNull();
    expect(el.hasAttribute('ready')).toBe(false);
  });

  describe('moving cards', () => {
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    const openMoveMenu = (el: TaskBoard, id: number) => {
      let detail: { items: { id: string; label: string }[] } | null = null;
      el.addEventListener('open-options-menu', (e) => {
        detail = (e as CustomEvent).detail;
      });
      (el.querySelector(`.card-menu-btn${sel(id)}`) as HTMLElement).click();
      return detail!;
    };

    const selectMenuItem = (el: TaskBoard, itemId: string) => {
      el.dispatchEvent(new CustomEvent('options-menu-select', { detail: { itemId } }));
    };

    it('offers column targets plus the pool file-move, then Set title', () => {
      const el = mount();
      const detail = openMoveMenu(el, 12); // card in in-progress
      expect(detail.items.map((i) => i.id)).toEqual([
        'move:briefed',
        'move:done',
        'move-file:pool',
        'set-title',
        'set-tags',
      ]);
    });

    it('pool cards offer reorder plus per-column file-moves', () => {
      const el = mount();
      const detail = openMoveMenu(el, 21);
      expect(detail.items.map((i) => i.id)).toEqual([
        'pool-up',
        'pool-down',
        'move-file:briefed',
        'move-file:in-progress',
        'move-file:done',
        'set-title',
        'set-tags',
      ]);
    });

    it('a metadata-diverged card offers both resolutions, rebase enabled', () => {
      const state = {
        ...STATE,
        cards: STATE.cards.map((c) =>
          c.path === 'docs/tasks/stage1/phase1/specs/task_a.md'
            ? { ...c, diverged: 'metadata' as const }
            : c
        ),
      };
      const el = mount(state);
      const detail = openMoveMenu(el, 12);
      const rebase = detail.items.find((i) => i.id === 'resolve-rebase') as {
        id: string;
        disabled?: boolean;
      };
      expect(rebase).toBeDefined();
      expect(rebase.disabled).toBeUndefined();
      expect(detail.items.map((i) => i.id)).toContain('resolve-take-latest');
    });

    it('a content-diverged card disables rebase with the reason on its tooltip (drift doctrine)', () => {
      const state = {
        ...STATE,
        cards: STATE.cards.map((c) =>
          c.path === 'docs/tasks/stage1/phase1/specs/task_a.md'
            ? { ...c, diverged: 'content' as const }
            : c
        ),
      };
      const el = mount(state);
      const detail = openMoveMenu(el, 12);
      const rebase = detail.items.find((i) => i.id === 'resolve-rebase') as {
        id: string;
        disabled?: boolean;
        title?: string;
      };
      expect(rebase.disabled).toBe(true);
      expect(rebase.title).toContain('edits the body');
      // Take latest stays available.
      const takeLatest = detail.items.find((i) => i.id === 'resolve-take-latest') as {
        disabled?: boolean;
      };
      expect(takeLatest.disabled).toBeUndefined();
      // The badge tooltip says WHY it diverges.
      const badge = el.querySelector(`.board-card${sel(12)} .card-badge--diverged`);
      expect(badge?.getAttribute('title')).toContain('body-edited');
    });

    it('selecting Set title opens the title dialog on the current title', () => {
      const el = mount();

      openMoveMenu(el, 12);
      selectMenuItem(el, 'set-title');

      expect(el.querySelector('#set-title-dialog')!.hasAttribute('is-open')).toBe(true);
      expect(el.querySelector<HTMLInputElement>('#set-title-input')!.value).toBe(
        'Implement login flow'
      );
      expect(host).not.toHaveBeenCalled();
    });

    // A card with no frontmatter title displays its filename, so that is what
    // the dialog must open on — seeding '' made renaming a retype rather than
    // an edit.
    it('the title dialog opens on the displayed filename for a card without a title', () => {
      const el = mount();

      openMoveMenu(el, 11);
      selectMenuItem(el, 'set-title');

      expect(el.querySelector<HTMLInputElement>('#set-title-input')!.value).toBe('idea.md');
    });

    it('moves optimistically, asks for the move, and settles on the host card', async () => {
      const el = mount();
      const serverCard = {
        title: 'task_a.md',
        path: 'docs/tasks/stage1/phase1/specs/task_a.md',
        kind: 'spec',
        column: 'done',
        dirty: true,
      };
      let resolveFetch: (v: Result<object>) => void = () => {};
      host.mockReturnValue(new Promise((r) => (resolveFetch = r)));

      openMoveMenu(el, 12);
      selectMenuItem(el, 'move:done');

      // Optimistic: the card is already rendered in 'done' before the response.
      expect(el.querySelector(`[data-column-id="done"] ${sel(12)}`)).not.toBeNull();
      expect(host).toHaveBeenCalledWith({ type: 'move', path: P[12], column: 'done' });

      resolveFetch(ok({ card: serverCard }));
      await flush();
      expect(
        el.querySelector(`[data-column-id="done"] ${sel(12)} .card-badge--dirty`)
      ).not.toBeNull();
    });

    it('drops a second drag on a card whose move is still in flight (review M11)', async () => {
      const el = mount();
      let resolveFetch: (v: Result<object>) => void = () => {};
      host.mockReturnValue(new Promise((r) => (resolveFetch = r)));
      const notifications: string[] = [];
      el.addEventListener('notification', (e) =>
        notifications.push((e as CustomEvent).detail.message as string)
      );

      openMoveMenu(el, 12);
      selectMenuItem(el, 'move:done');
      // Second drag while the first POST is in flight: dropped with feedback.
      openMoveMenu(el, 12);
      selectMenuItem(el, 'move:briefed');

      expect(host).toHaveBeenCalledTimes(1);
      expect(notifications.some((m) => m.includes('in flight'))).toBe(true);

      resolveFetch(ok({ card: { ...STATE.cards[1], column: 'done', dirty: true } }));
      await flush();
      // Settled on the server state — no stale-snapshot rollback.
      expect(el.querySelector(`[data-column-id="done"] ${sel(12)}`)).not.toBeNull();
    });

    it('notifies when a refresh shows a card whose check-in PR was replaced (review L14)', () => {
      const withPr: SharedTaskBoardState = {
        ...STATE,
        cards: STATE.cards.map((card) =>
          card.path === 'docs/tasks/stage1/phase1/specs/task_a.md'
            ? { ...card, checkinPrUrl: 'https://github.com/o/r/pull/8' }
            : card
        ),
      };
      const el = mount(withPr);
      const notifications: string[] = [];
      el.addEventListener('notification', (e) =>
        notifications.push((e as CustomEvent).detail.message as string)
      );

      el.setState({
        ...withPr,
        cards: withPr.cards.map((card) =>
          card.path === 'docs/tasks/stage1/phase1/specs/task_a.md'
            ? { ...card, checkinPrUrl: 'https://github.com/o/r/pull/9' }
            : card
        ),
      });

      expect(notifications.some((m) => m.includes('superseded'))).toBe(true);
      // An unchanged refresh does not re-notify.
      notifications.length = 0;
      el.setState({
        ...withPr,
        cards: withPr.cards.map((card) =>
          card.path === 'docs/tasks/stage1/phase1/specs/task_a.md'
            ? { ...card, checkinPrUrl: 'https://github.com/o/r/pull/9' }
            : card
        ),
      });
      expect(notifications).toEqual([]);
    });

    it('opens check-in on the first click after the first pending change appears', () => {
      const cleanState: SharedTaskBoardState = {
        ...STATE,
        cards: STATE.cards.map((card) => ({
          ...card,
          dirty: false,
          changed: false,
          versionColumn: undefined,
        })),
        pool: {
          ...STATE.pool,
          cards: STATE.pool.cards.map((card) => ({ ...card, changed: false })),
          order: { changed: false },
        },
      };
      const el = mount(cleanState);

      openMoveMenu(el, 11);
      selectMenuItem(el, 'move:done');

      expect(el.querySelector('.board-dirty-summary')?.textContent).toContain(
        '1 uncommitted change'
      );
      let detail: { cards: { path: string; versionColumn?: string | null }[] } | null = null;
      el.addEventListener('checkin-request', (e) => {
        detail = (e as CustomEvent).detail;
      });

      (el.querySelector('.board-checkin') as HTMLElement).click();

      expect(detail).not.toBeNull();
      expect(detail!.cards.map((card) => card.path)).toEqual([P[11]]);
      expect(detail!.cards[0].versionColumn).toBe('briefed');
    });

    it('rolls back and emits a notification when the move fails', async () => {
      const el = mount();
      host.mockResolvedValue(fail('DRAFT_SAVE_IN_PROGRESS', 'locked'));
      const notifications: string[] = [];
      el.addEventListener('notification', (e) => {
        notifications.push(((e as CustomEvent).detail as { message: string }).message);
      });

      openMoveMenu(el, 12);
      selectMenuItem(el, 'move:done');
      await flush();

      // Rolled back to its original column.
      expect(el.querySelector(`[data-column-id="in-progress"] ${sel(12)}`)).not.toBeNull();
      expect(el.querySelector(`[data-column-id="done"] ${sel(12)}`)).toBeNull();
      expect(notifications[0]).toContain('being edited');
    });

    it('moving to the pool is a FILE move: optimistic across lists, asks move-file', async () => {
      const el = mount();

      openMoveMenu(el, 12);
      selectMenuItem(el, 'move-file:pool');

      // Optimistic: the card renders collapsed in the pool immediately.
      expect(el.querySelector(`.board-column--pool ${sel(12)}`)).not.toBeNull();
      expect(el.querySelector(`[data-column-id="in-progress"] ${sel(12)}`)).toBeNull();
      expect(host).toHaveBeenCalledWith({ type: 'move-file', path: P[12], target: { pool: true } });
    });

    it('a pool card moves to a column as a FILE move with the board path', async () => {
      const el = mount();

      openMoveMenu(el, 21);
      selectMenuItem(el, 'move-file:briefed');

      expect(el.querySelector(`[data-column-id="briefed"] ${sel(21)}`)).not.toBeNull();
      expect(host).toHaveBeenCalledWith({
        type: 'move-file',
        path: P[21],
        target: { boardPath: 'docs/tasks/stage1/phase1', column: 'briefed' },
      });
    });

    it('Move up/down reorders the pool through the reorder op', async () => {
      const el = mount();

      openMoveMenu(el, 22);
      selectMenuItem(el, 'pool-up');

      const poolIds = [...el.querySelectorAll('.board-card--pool')].map((c) => idOf(c));
      expect(poolIds).toEqual(['22', '21']);
      expect(host).toHaveBeenCalledWith({
        type: 'reorder-pool',
        paths: [
          'docs/tasks/unassigned/specs/back_task.md',
          'docs/tasks/unassigned/briefs/back_idea.md',
        ],
      });
    });

    it('rolls back a pool reorder and surfaces a lazy-link text refusal', async () => {
      const el = mount();
      host.mockResolvedValue(
        fail(
          'REPO_TEXT_NOT_EDITABLE',
          'This file cannot be linked because it is no longer safe editable text'
        )
      );
      const notifications: string[] = [];
      el.addEventListener('notification', (event) => {
        notifications.push(((event as CustomEvent).detail as { message: string }).message);
      });

      openMoveMenu(el, 22);
      selectMenuItem(el, 'pool-up');
      await flush();

      const poolIds = [...el.querySelectorAll('.board-card--pool')].map((card) => idOf(card));
      expect(poolIds).toEqual(['21', '22']);
      expect(notifications).toEqual([
        'This file cannot be linked because it is no longer safe editable text',
      ]);
    });

    it('shows the uncommitted-changes summary with an enabled check-in button', () => {
      // Card 12 + pool card 22 changed, plus the pool order draft — the
      // count covers everything the check-in can carry, not just cards.
      const el = mount();
      expect(el.querySelector('.board-dirty-summary')?.textContent).toContain(
        '3 uncommitted changes'
      );
      const checkin = el.querySelector('.board-checkin') as HTMLButtonElement;
      expect(checkin.disabled).toBe(false);
    });

    it('offers a button for every creatable kind — template or not', () => {
      const el = mount();
      const buttons = [...el.querySelectorAll<HTMLButtonElement>('.board-new-card')];
      // The built-in registry minus spec (creatable: false); folders and
      // templates no longer gate the buttons (stubs cover template-less kinds).
      expect(buttons.map((b) => b.dataset.kind)).toEqual(['spike', 'brief', 'review', 'test']);
      expect(buttons.map((b) => b.dataset.kindTemplated)).toEqual(['', '1', '', '']);
    });

    it('opens the new-card dialog from the New brief button, worded for a templated brief', () => {
      const el = mount();

      (el.querySelector('.board-new-card[data-kind="brief"]') as HTMLElement).click();

      const dialog = el.querySelector('#new-brief-dialog')!;
      expect(dialog.hasAttribute('is-open')).toBe(true);
      expect(dialog.getAttribute('title')).toBe('New brief');
      expect(el.querySelector('#new-brief-description')!.textContent).toBe(
        "Creates a brief from the repository's brief template in this board's briefs folder. It stays local until you check it in."
      );
      expect(host).not.toHaveBeenCalled();
    });

    it('dispatches checkin-request with the changed cards and board path', () => {
      const el = mount();
      let detail: { boardPath: string; cards: { path: string }[] } | null = null;
      el.addEventListener('checkin-request', (e) => {
        detail = (e as CustomEvent).detail;
      });

      (el.querySelector('.board-checkin') as HTMLElement).click();

      expect(detail).not.toBeNull();
      expect(detail!.boardPath).toBe('docs/tasks/stage1/phase1');
      // Changed board card + changed pool card; the changed order file rides along.
      expect(detail!.cards.map((c) => c.path)).toEqual([P[12], P[22]]);
      // The order file by path: its good is the host's to look up.
      expect((detail as unknown as { orderFile: { path: string } | null })!.orderFile).toEqual({
        path: 'docs/tasks/unassigned/order.yaml',
      });
    });

    it('renders PR chips from checkinPrUrl', () => {
      const state = {
        ...STATE,
        cards: STATE.cards.map((c) =>
          c.path === 'docs/tasks/stage1/phase1/briefs/idea.md'
            ? { ...c, checkinPrUrl: 'https://github.com/o/r/pull/9' }
            : c
        ),
      };
      const el = mount(state);
      const chip = el.querySelector('.card-badge--pr') as HTMLAnchorElement;
      expect(chip?.getAttribute('href')).toBe('https://github.com/o/r/pull/9');
      expect(el.querySelector('.board-pr')).not.toBeNull();
    });
  });
});

describeAppElementContract<SharedTaskBoardState, TaskBoard>('spl-task-board', {
  state: copy(STATE),
  trigger: (el) => {
    (el.querySelector(`.card-menu-btn${sel(12)}`) as HTMLElement).click();
    el.dispatchEvent(new CustomEvent('options-menu-select', { detail: { itemId: 'move:done' } }));
  },
});
