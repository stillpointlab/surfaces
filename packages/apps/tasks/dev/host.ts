// The harness's tasks host: a workspace's files in memory, with the board's
// and the strip's ops answered through the tasks module by the harness's one
// memory host, as Context Manager's board service answers them over drafts.
// What only a host does is done here: the host ops (resolving a divergence by
// dropping it, scanning references, reading a file, a stage's phases, the close
// dialog's candidates) and showing the board a change lands on. The controls
// switch the host off (every op unhandled, so the optimistic render rolls back)
// or make it refuse the next op.
import { answerOps, fail, ok } from '@stillpointlab/common-format/app';

import { memoryAnswer } from '../../../../tooling/harness/memory-host';
import { projectResolvedCard, referencesTo, resolveTasks, tasksModule } from '../src/index.js';

import { boardOf, factsOf, navOf, stageOf, write } from './workspace.js';

import type { Workspace } from './workspace.js';
import type {
  TaskBoard,
  TaskBoardOps,
  TasksNav,
  TasksNavOps,
  TasksNavState,
} from '../src/element/index.js';
import type { SharedTaskCard } from '../src/index.js';
import type { AppOp, Result } from '@stillpointlab/common-format/app';

/** What the board shows: one board by path, or one stage's phases. */
export type HarnessView = { board: string } | { stage: number };

export interface HarnessHost {
  /** Show a workspace's view on the board and the strip. */
  show(ws: Workspace, view: HarnessView): void;
  /** Answer ops (true) or leave them unclaimed (false). */
  setAnswering(on: boolean): void;
  /** Refuse the next op, once. */
  failNext(): void;
}

/** The strip's state: the nav projected, with the view the page is on. */
export function navState(ws: Workspace, view: HarnessView): TasksNavState | null {
  const projected = navOf(ws);
  if (!projected) return null;
  if ('stage' in view) {
    return {
      ...projected,
      current: { stage: view.stage, phase: null, other: false, boardPath: '' },
    };
  }
  const entry = projected.nav.stages
    .flatMap((stage) => stage.phases.map((phase) => ({ stage: stage.stage, phase })))
    .find((candidate) => candidate.phase.path === view.board);
  return {
    ...projected,
    current: {
      stage: entry?.stage ?? null,
      phase: entry?.phase.phase ?? null,
      other: entry === undefined,
      boardPath: view.board,
    },
  };
}

export function attachHost(board: TaskBoard, nav: TasksNav): HarnessHost {
  let ws: Workspace | null = null;
  let view: HarnessView = { board: '' };
  let stops: (() => void)[] = [];
  let failOnce = false;

  /** The view, projected afresh onto the board and the strip, as a host's refresh hands it back. */
  const refresh = (): void => {
    if (!ws) return;
    if ('stage' in view) {
      const stage = stageOf(ws, view.stage);
      if (stage) board.setStageState(stage);
    } else {
      const state = boardOf(ws, view.board);
      if (state) board.setState(state);
    }
    const strip = navState(ws, view);
    if (strip) nav.setState(strip);
  };

  /** One card as it stands after an op. */
  const cardAt = (path: string): SharedTaskCard | null => {
    if (!ws) return null;
    const resolved = resolveTasks(ws.snapshot);
    return resolved?.ok
      ? projectResolvedCard(ws.snapshot, resolved.tasks, path, factsOf(ws))
      : null;
  };
  const withCard = (path: string): Result<object> => {
    const card = cardAt(path);
    return card ? ok({ card }) : fail('NOT_FOUND', `No card at ${path}`);
  };

  const refused = (): Result<object> | null => {
    if (failOnce) {
      failOnce = false;
      return fail('HARNESS_REFUSED', 'The harness refused this op');
    }
    return null;
  };

  const inMemory = memoryAnswer({
    module: tasksModule,
    workspace: () =>
      ws && {
        snapshot: ws.snapshot,
        facts: () => factsOf(ws!),
        write: (changes) => write(ws!, changes),
      },
    view: () =>
      'stage' in view ? { type: 'stage', stage: view.stage } : { type: 'board', path: view.board },
    hostOps: {
      // A host's own: a resolve keeps one side of a divergence; here, the facts drop it.
      resolve: (op) => {
        const path = op.path as string;
        if (ws) delete ws.fixed[path]?.diverged;
        return withCard(path);
      },
      'scan-references': (op) =>
        ws
          ? ok({ references: referencesTo(ws.snapshot, op.path as string) })
          : fail('HARNESS_NO_FILES', 'The harness has no files to read.'),
      'read-file': (op) => {
        const content = ws?.snapshot.files[op.path as string];
        return typeof content === 'string'
          ? ok({ content })
          : fail('NOT_FOUND', `No file at ${op.path as string}`);
      },
      'refresh-stage': (op) => {
        const stage = ws && stageOf(ws, op.stage as number);
        return stage ? ok({ stage }) : fail('NOT_FOUND', `No stage ${op.stage as number}`);
      },
      'close-candidates': (op) => {
        const state = ws && boardOf(ws, op.path as string);
        return ok({
          cards: (state?.cards ?? []).map((card) => ({
            path: card.path,
            title: card.frontmatterTitle ?? card.title,
            column: card.column,
          })),
        });
      },
    },
  });

  /** Ops whose change shows beyond the card the element settles on: the page refreshes. */
  const REFRESHES = new Set([
    'create-card',
    'set-title',
    'set-tags',
    'add-tag',
    'edit-manifest',
    'fix-references',
    'set-current',
  ]);

  const answer = (op: { type: string } & Record<string, unknown>): Result<object> => {
    const refusal = refused();
    if (refusal) return refusal;
    const result = inMemory(op);
    if (!result.ok || !ws) return result;
    if (op.type === 'create-stage-phase' || op.type === 'close') {
      // A host's page goes to the phase the op made current.
      view = { board: navOf(ws)?.currentPointerPath ?? ('board' in view ? view.board : '') };
      refresh();
    } else if (REFRESHES.has(op.type)) {
      refresh();
    }
    return result;
  };

  const answerBoard = (op: AppOp<TaskBoardOps>): Result<object> => answer(op);
  const answerNav = (op: AppOp<TasksNavOps>): Result<object> => answer(op);

  const setAnswering = (on: boolean): void => {
    for (const stop of stops) stop();
    stops = on
      ? [answerOps<TaskBoardOps>(board, answerBoard), answerOps<TasksNavOps>(nav, answerNav)]
      : [];
  };
  setAnswering(true);
  return {
    show: (next, nextView) => {
      ws = next;
      view = nextView;
      refresh();
    },
    setAnswering,
    failNext: () => (failOnce = true),
  };
}
