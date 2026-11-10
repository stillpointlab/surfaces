// The task board in the surfaces harness (`npm run dev`), with its tab strip,
// <spl-tasks-nav>, above it. Every fixture runs on the tasks core: an in-memory
// host holds a workspace's files, answers both elements' ops with the core's
// rules and re-projects, so an edit shows on every fixture over the same files
// until the page reloads. The workshop is a hand-built folder with every card
// state; "This repository" is this repository's own docs/tasks/. The controls
// switch the host off (every op unhandled, so the optimistic render rolls back)
// or make it refuse the next op. Requests the elements raise show in the event
// log. The "Dialog:" fixtures open each of the board's dialogs on the
// workshop. The strip's links are `#` anchors: where a phase lives is a host's.
import '../src/element/index.js';

import { attachHost } from './host.js';
import { repoWorkspace } from './repo.js';
import { emptyWorkshop, WORKSHOP_BOARD, workshop } from './workshop.js';
import { navOf } from './workspace.js';

import type { HarnessHost, HarnessView } from './host.js';
import type { Workspace } from './workspace.js';
import type { HarnessElements, HarnessFormat } from '../../../../tooling/harness/types';
import type { TaskBoard, TasksNav, TasksNavLinks } from '../src/element/index.js';

const TAG = 'spl-task-board';
const NAV_TAG = 'spl-tasks-nav';
const NAV_LINKS: TasksNavLinks = {
  stage: (stage) => `#stage/${stage}`,
  phase: (stage, phase) => `#stage/${stage}/phase/${phase}`,
  board: (path) => `#board/${path}`,
};

/** The workspaces, kept for the page's life so edits carry across fixtures. */
const WORKSPACES = {
  workshop: workshop(),
  unpointed: workshop({ pointer: false }),
  empty: emptyWorkshop(),
  repo: repoWorkspace(),
};

let host: HarnessHost | null = null;
let answering = true;

/**
 * The board and the strip, with the host attached once. A host page makes the
 * board `display: contents` and lays its pool sidebar and board out in a grid
 * (Context Manager's task board page does), so the harness pane does the same,
 * at full height.
 */
function elementsOf(elements: HarnessElements): TaskBoard {
  const board = elements.extras[TAG] as TaskBoard;
  const nav = elements.extras[NAV_TAG] as TasksNav;
  board.setAttribute('storage-key', 'harness');
  board.style.display = 'contents';
  const pane = board.parentElement;
  if (pane) {
    Object.assign(pane.style, {
      height: 'auto',
      display: 'grid',
      gridTemplateColumns: 'auto minmax(0, 1fr)',
      alignItems: 'start',
      gap: '12px',
    });
  }
  nav.links = NAV_LINKS;
  if (nav.parentElement) nav.parentElement.style.height = 'auto';
  host ??= attachHost(board, nav);
  host.setAnswering(answering);
  return board;
}

/** The board reads its variant on connect, so a variant change reconnects it. */
function variant(el: TaskBoard, value: 'board' | 'stage'): void {
  if ((el.getAttribute('variant') ?? 'board') === value) return;
  el.setAttribute('variant', value);
  const parent = el.parentElement;
  el.remove();
  parent?.append(el);
}

/** Show a workspace's view; the board defaults to the phase `current:` points at. */
function show(elements: HarnessElements, ws: Workspace, view?: HarnessView): TaskBoard {
  const board = elementsOf(elements);
  const shown: HarnessView = view ?? { board: navOf(ws)?.currentPointerPath ?? WORKSHOP_BOARD };
  variant(board, 'stage' in shown ? 'stage' : 'board');
  host!.show(ws, shown);
  return board;
}

const fixture = (ws: () => Workspace, view?: HarnessView) => ({
  content: '',
  apply: (elements: HarnessElements) => void show(elements, ws(), view),
});

/** The workshop with one of the board's dialogs open. */
const dialogFixture = (open: (el: TaskBoard) => void) => ({
  content: '',
  apply: (elements: HarnessElements) =>
    open(show(elements, WORKSPACES.workshop, { board: WORKSHOP_BOARD })),
});

/** Pick an item from a linked card's ⋯ menu, as the host page's options menu does. */
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
      },
    },
    {
      kind: 'toggle',
      label: 'Refuse the next op',
      apply: (_elements, on) => {
        if (on) host?.failNext();
      },
    },
  ],
  fixtures: {
    'Every card state': fixture(() => WORKSPACES.workshop, { board: WORKSHOP_BOARD }),
    'This repository': fixture(() => WORKSPACES.repo),
    'Empty board': fixture(() => WORKSPACES.empty, { board: WORKSHOP_BOARD }),
    'Dialog: board settings': dialogFixture((el) => el.openSettings()),
    'Dialog: new card': dialogFixture((el) =>
      el.querySelector<HTMLElement>('.board-new-card[data-kind="brief"]')?.click()
    ),
    'Dialog: card title': dialogFixture((el) => menuItem(el, 'set-title')),
    'Dialog: card tags': dialogFixture((el) => menuItem(el, 'set-tags')),
    'Stage view': fixture(() => WORKSPACES.workshop, { stage: 1 }),
    'Nav: a phase that is not current': fixture(() => WORKSPACES.workshop, {
      board: 'docs/tasks/stage1/phase2',
    }),
    'Nav: a board outside the stages': fixture(() => WORKSPACES.workshop, {
      board: 'docs/tasks/research',
    }),
    'Nav: no current pointer': fixture(() => WORKSPACES.unpointed, { board: WORKSHOP_BOARD }),
    'Nav: close phase': {
      content: '',
      apply: (elements) => {
        show(elements, WORKSPACES.workshop, { board: WORKSHOP_BOARD });
        // The host's options menu answers Close… on the strip.
        elements.extras[NAV_TAG]!.dispatchEvent(
          new CustomEvent('options-menu-select', { detail: { itemId: 'close-phase' } })
        );
      },
    },
  },
} satisfies HarnessFormat;
