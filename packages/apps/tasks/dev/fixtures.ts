// The task board in the surfaces harness (`npm run dev`). A fixture hands the
// board a state; an in-memory host answers its ops, and the controls switch that
// host off (every op unhandled, so the optimistic render rolls back) or make it
// refuse the next op. Requests the board raises show in the event log. The
// "Dialog:" fixtures open each of the board's dialogs on the every-card state;
// "Refuse the next op" shows a dialog's refusal. The tab strip, <spl-tasks-nav>,
// sits above the board with its own in-memory host: each fixture sets it, and
// the "Nav:" fixtures show its cases. Its links are `#` anchors: where a phase
// lives is a host's.
import '../src/element/index.js';

import { attachHost } from './host.js';
import { attachNavHost, handNav, navWithoutPointer, repoNav } from './nav.js';
import { repoBoard, repoFiles } from './repo.js';
import { emptyBoard, everyCardState, stageView } from './states.js';

import type { HarnessHost } from './host.js';
import type { NavHost } from './nav.js';
import type { HarnessElements, HarnessFormat } from '../../../../tooling/harness/types';
import type { TaskBoard, TasksNav, TasksNavLinks, TasksNavState } from '../src/element/index.js';
import type { SharedTaskStageState } from '../src/types.js';

const TAG = 'spl-task-board';
const NAV_TAG = 'spl-tasks-nav';
const NAV_LINKS: TasksNavLinks = {
  stage: (stage) => `#stage/${stage}`,
  phase: (stage, phase) => `#stage/${stage}/phase/${phase}`,
  board: (path) => `#board/${path}`,
};
let host: HarnessHost | null = null;
let navHost: NavHost | null = null;
let stage: SharedTaskStageState | null = null;
let answering = true;

/**
 * The board, with the harness host attached once. A host page makes the board
 * `display: contents` and lays its pool sidebar and board out in a grid (Context
 * Manager's task board page does), so the harness pane does the same, at full
 * height.
 */
function board(elements: HarnessElements): TaskBoard {
  const el = elements.extras[TAG] as TaskBoard;
  el.setAttribute('storage-key', 'harness');
  el.style.display = 'contents';
  const pane = el.parentElement;
  if (pane) {
    Object.assign(pane.style, {
      height: 'auto',
      display: 'grid',
      gridTemplateColumns: 'auto minmax(0, 1fr)',
      alignItems: 'start',
      gap: '12px',
    });
  }
  host ??= attachHost(el, repoFiles, () => stage);
  host.setAnswering(answering);
  return el;
}

/** Set the strip, with its host attached once. */
function nav(elements: HarnessElements, state: TasksNavState | null): void {
  const el = elements.extras[NAV_TAG] as TasksNav;
  el.links = NAV_LINKS;
  const pane = el.parentElement;
  if (pane) pane.style.height = 'auto';
  navHost ??= attachNavHost(el, elements.extras[TAG] as TaskBoard);
  navHost.setAnswering(answering);
  if (state) el.setState(state);
}

/** The board reads its variant on connect, so a variant change reconnects it. */
function variant(el: TaskBoard, value: 'board' | 'stage'): void {
  if ((el.getAttribute('variant') ?? 'board') === value) return;
  el.setAttribute('variant', value);
  const parent = el.parentElement;
  el.remove();
  parent?.append(el);
}

const boardFixture = (
  state: () => ReturnType<typeof everyCardState> | null,
  navState: () => TasksNavState | null = () => handNav()
) => ({
  content: '',
  apply: (elements: HarnessElements) => {
    const el = board(elements);
    variant(el, 'board');
    stage = null;
    const next = state();
    if (next) el.setState(next);
    nav(elements, navState());
  },
});

/** The every-card state with one of the board's dialogs open. */
const dialogFixture = (open: (el: TaskBoard) => void) => ({
  content: '',
  apply: (elements: HarnessElements) => {
    const el = board(elements);
    variant(el, 'board');
    stage = null;
    el.setState(everyCardState());
    nav(elements, handNav());
    open(el);
  },
});

/** Pick an item from a card's ⋯ menu, as the host page's options menu does. */
function menuItem(el: TaskBoard, itemId: string): void {
  const card = el.boardState?.cards.find((candidate) => !candidate.tracked);
  const button = card && el.querySelector<HTMLElement>(`.card-menu-btn[data-path="${card.path}"]`);
  if (!button) return;
  button.click();
  el.dispatchEvent(new CustomEvent('options-menu-select', { detail: { itemId } }));
}

export default {
  elements: { extra: [NAV_TAG, TAG] },
  controls: [
    {
      kind: 'toggle',
      label: 'Host answers ops',
      initial: true,
      apply: (_elements, on) => {
        answering = on;
        host?.setAnswering(on);
        navHost?.setAnswering(on);
      },
    },
    {
      kind: 'toggle',
      label: 'Refuse the next op',
      apply: (_elements, on) => {
        if (on) {
          host?.failNext();
          navHost?.failNext();
        }
      },
    },
  ],
  fixtures: {
    'Every card state': boardFixture(everyCardState),
    'This repository (files only)': boardFixture(repoBoard, repoNav),
    'Empty board': boardFixture(emptyBoard),
    'Dialog: board settings': dialogFixture((el) => el.openSettings()),
    'Dialog: new card': dialogFixture((el) =>
      el.querySelector<HTMLElement>('.board-new-card[data-kind="brief"]')?.click()
    ),
    'Dialog: card title': dialogFixture((el) => menuItem(el, 'set-title')),
    'Dialog: card tags': dialogFixture((el) => menuItem(el, 'set-tags')),
    'Stage view': {
      content: '',
      apply: (elements) => {
        const el = board(elements);
        variant(el, 'stage');
        stage = stageView();
        el.setStageState(stage);
        nav(elements, handNav({ stage: 1, phase: null }));
      },
    },
    'Nav: a phase that is not current': boardFixture(everyCardState, () =>
      handNav({ stage: 1, phase: 2 })
    ),
    'Nav: no current pointer': boardFixture(everyCardState, navWithoutPointer),
    'Nav: close phase': {
      content: '',
      apply: (elements) => {
        boardFixture(everyCardState).apply(elements);
        // The host's options menu answers Close… on the strip.
        elements.extras[NAV_TAG]!.dispatchEvent(
          new CustomEvent('options-menu-select', { detail: { itemId: 'close-phase' } })
        );
      },
    },
  },
} satisfies HarnessFormat;
