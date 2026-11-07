// The task board in the surfaces harness (`npm run dev`). A fixture hands the
// board a state; an in-memory host answers its ops, and the controls switch that
// host off (every op unhandled, so the optimistic render rolls back) or make it
// refuse the next op. Requests the board raises show in the event log.
import '../src/element/index.js';

import { attachHost } from './host.js';
import { repoBoard, repoFiles } from './repo.js';
import { emptyBoard, everyCardState, stageView } from './states.js';

import type { HarnessHost } from './host.js';
import type { HarnessElements, HarnessFormat } from '../../../../tooling/harness/types';
import type { TaskBoard } from '../src/element/index.js';
import type { SharedTaskStageState } from '../src/types.js';

const TAG = 'spl-task-board';
let host: HarnessHost | null = null;
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

/** The board reads its variant on connect, so a variant change reconnects it. */
function variant(el: TaskBoard, value: 'board' | 'stage'): void {
  if ((el.getAttribute('variant') ?? 'board') === value) return;
  el.setAttribute('variant', value);
  const parent = el.parentElement;
  el.remove();
  parent?.append(el);
}

const boardFixture = (state: () => ReturnType<typeof everyCardState> | null) => ({
  content: '',
  apply: (elements: HarnessElements) => {
    const el = board(elements);
    variant(el, 'board');
    stage = null;
    const next = state();
    if (next) el.setState(next);
  },
});

export default {
  elements: { extra: [TAG] },
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
    'Every card state': boardFixture(everyCardState),
    'This repository (files only)': boardFixture(repoBoard),
    'Empty board': boardFixture(emptyBoard),
    'Stage view': {
      content: '',
      apply: (elements) => {
        const el = board(elements);
        variant(el, 'stage');
        stage = stageView();
        el.setStageState(stage);
      },
    },
  },
} satisfies HarnessFormat;
