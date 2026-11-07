// Hand-built states for the harness. They stand in for what a host's board
// service sends: files projected, with the host's overlay (goods, drafts,
// check-ins, drift) already applied. One board shows every card state.
import { BUILTIN_TASK_KINDS } from '../src/types.js';

import type { SharedTaskBoardState, SharedTaskCard, SharedTaskStageState } from '../src/types.js';

const BOARD = 'docs/tasks/stage1/phase1';
const POOL = 'docs/tasks/unassigned';

const card = (
  path: string,
  kind: string,
  column: string | null,
  extra: Partial<SharedTaskCard> = {}
): SharedTaskCard => ({
  goodId: 1,
  goodPublicId: 'dg_fixture',
  title: path.slice(path.lastIndexOf('/') + 1),
  path,
  kind,
  column,
  dirty: false,
  changed: false,
  ...extra,
});

const columns = [
  { id: 'todo', label: 'Todo' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

const kinds = BUILTIN_TASK_KINDS.map((kind) =>
  kind.id === 'brief' ? { ...kind, template: 'docs/tasks/brief.template.md' } : { ...kind }
);

/** Every card state a board renders. */
export function everyCardState(): SharedTaskBoardState {
  return {
    board: {
      path: BOARD,
      label: 'Stage 1 — Phase 1',
      paths: { brief: [], spec: [], spike: [], review: [], test: [] },
      stage: 1,
      phase: 1,
    },
    columns,
    cards: [
      card(`${BOARD}/briefs/onboarding.md`, 'brief', 'todo', {
        frontmatterTitle: 'Onboarding brief',
        tags: ['docs'],
      }),
      card(`${BOARD}/specs/login_flow.md`, 'spec', 'in-progress', {
        frontmatterTitle: 'Implement login flow',
        dirty: true,
        changed: true,
        versionColumn: 'todo',
        tags: ['code', 'auth'],
      }),
      card(`${BOARD}/specs/sync_drift.md`, 'spec', 'in-progress', {
        frontmatterTitle: 'Drifted under a draft',
        changed: true,
        diverged: 'metadata',
      }),
      card(`${BOARD}/specs/checked_in.md`, 'spec', 'done', {
        frontmatterTitle: 'Checked in, PR open',
        checkinPrUrl: 'https://github.com/stillpointlab/surfaces/pull/1',
        pr: '42',
        prState: 'open',
        completed: '2026-11-01',
      }),
      card(`${BOARD}/specs/blocked.md`, 'spec', 'todo', { blocked: 'waiting on review' }),
      card(`${BOARD}/spikes/tracked.md`, 'spike', 'todo', {
        goodId: null,
        goodPublicId: null,
        tracked: true,
        frontmatterTitle: 'Tracked from the repository',
      }),
      card(`${BOARD}/specs/broken.md`, 'spec', null, {
        parseError: 'frontmatter YAML parse error: bad indentation',
      }),
      card(`${BOARD}/specs/undeclared.md`, 'spec', null, {
        warning: "'backlog' is not a column declared in tasks.yaml",
      }),
    ],
    pool: {
      path: POOL,
      orderPath: `${POOL}/order.yaml`,
      cards: [
        card(`${POOL}/seeds/idea.md`, 'seed', null, { frontmatterTitle: 'A loose idea' }),
        card(`${POOL}/specs/next_up.md`, 'spec', null, { changed: true, tags: ['code'] }),
        card(`${POOL}/briefs/later.md`, 'brief', null, {
          goodId: null,
          goodPublicId: null,
          tracked: true,
        }),
      ],
      order: { goodId: 1, changed: true },
    },
    tags: ['code', 'docs', 'auth'],
    doneColumn: 'done',
    defaultColumn: 'todo',
    kinds,
    housekeeping: [],
  };
}

/** A board with no cards at all. */
export function emptyBoard(): SharedTaskBoardState {
  const state = everyCardState();
  return {
    ...state,
    cards: [],
    pool: { path: POOL, orderPath: `${POOL}/order.yaml`, cards: [] },
    tags: [],
  };
}

/** The stage view: a populated phase and an empty one. */
export function stageView(): SharedTaskStageState {
  const board = everyCardState();
  return {
    stage: 1,
    columns,
    kinds,
    phases: [
      { phase: 1, path: BOARD, label: 'Stage 1 — Phase 1', cards: board.cards },
      { phase: 2, path: 'docs/tasks/stage1/phase2', label: 'Stage 1 — Phase 2', cards: [] },
    ],
    pool: board.pool,
    housekeeping: [],
    tags: board.tags,
  };
}
