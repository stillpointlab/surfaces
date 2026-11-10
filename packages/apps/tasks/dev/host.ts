// An in-memory host for the harness: it holds a workspace's files, answers the
// board's and the strip's ops with the tasks core's `apply` (the app
// contract's), writes the changes back and re-projects with its `project`, as
// Context Manager's board service does over drafts. What only a host does is
// done here by hand: the creation time a new card is stamped with, resolving a
// divergence (dropping it), reading a file, and showing the board a change
// lands on. The controls switch the host off (every op unhandled, so the
// optimistic render rolls back) or make it refuse the next op.
import { answerOps, fail, ok } from '@stillpointlab/common-format/app';

import { projectResolvedCard, referencesTo, resolveTasks, tasksCore } from '../src/index.js';

import { boardOf, factsOf, navOf, stageOf, write } from './workspace.js';

import type { Workspace } from './workspace.js';
import type {
  TaskBoard,
  TaskBoardOps,
  TasksNav,
  TasksNavOps,
  TasksNavState,
} from '../src/element/index.js';
import type { SharedTaskCard, TasksCoreOps } from '../src/index.js';
import type { AppApplyResult, AppOp, Result } from '@stillpointlab/common-format/app';

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

  /** A core op: applied, written, and answered as the element asks. */
  const applied = <K extends keyof TasksCoreOps & string>(
    current: Workspace,
    op: { type: K } & TasksCoreOps[K]['op']
  ): AppApplyResult<TasksCoreOps, K> => {
    const result = tasksCore.apply(current.snapshot, op);
    if (result.ok) write(current, result.changes);
    return result;
  };

  const refused = (): Result<object> | null => {
    if (failOnce) {
      failOnce = false;
      return fail('HARNESS_REFUSED', 'The harness refused this op');
    }
    return ws ? null : fail('HARNESS_NO_FILES', 'The harness has no files to change.');
  };

  const answerBoard = (op: AppOp<TaskBoardOps>): Result<object> => {
    const refusal = refused();
    if (refusal || !ws) return refusal!;
    switch (op.type) {
      // A host's own: a resolve keeps one side of a divergence; here, the facts drop it.
      case 'resolve':
        delete ws.fixed[op.path]?.diverged;
        return withCard(op.path);
      case 'scan-references':
        return ok({ references: referencesTo(ws.snapshot, op.path) });
      case 'read-file': {
        const content = ws.snapshot.files[op.path];
        return typeof content === 'string'
          ? ok({ content })
          : fail('NOT_FOUND', `No file at ${op.path}`);
      }
      case 'refresh-stage': {
        const stage = stageOf(ws, op.stage);
        return stage ? ok({ stage }) : fail('NOT_FOUND', `No stage ${op.stage}`);
      }
      case 'move': {
        const result = applied(ws, op);
        return result.ok ? withCard(op.path) : result;
      }
      case 'move-file': {
        const result = applied(ws, op);
        return result.ok ? withCard(result.path) : result;
      }
      case 'reorder-pool': {
        const result = applied(ws, op);
        if (!result.ok) return result;
        const pool =
          'stage' in view ? stageOf(ws, view.stage)?.pool : boardOf(ws, view.board)?.pool;
        return pool ? ok({ pool }) : fail('NOT_FOUND', 'No pool');
      }
      case 'create-card': {
        // The core reads no clock: the host stamps the creation time.
        const result = applied(ws, { ...op, now: new Date().toISOString() });
        if (!result.ok) return result;
        refresh();
        return withCard(result.path);
      }
      case 'set-title':
      case 'set-tags':
      case 'add-tag':
      case 'edit-manifest':
      case 'fix-references': {
        // These ops are the core's as the element asks them; the reply is the
        // core's result without its changes.
        const result = applied(
          ws,
          op as { type: typeof op.type } & TasksCoreOps[typeof op.type]['op']
        );
        if (!result.ok) return result;
        refresh();
        const { changes: _changes, ok: _ok, ...reply } = result as { ok: true; changes: unknown };
        return ok(reply);
      }
    }
  };

  const answerNav = (op: AppOp<TasksNavOps>): Result<object> => {
    const refusal = refused();
    if (refusal || !ws) return refusal!;
    switch (op.type) {
      case 'close-candidates': {
        const state = boardOf(ws, op.path);
        return ok({
          cards: (state?.cards ?? []).map((card) => ({
            path: card.path,
            title: card.frontmatterTitle ?? card.title,
            column: card.column,
          })),
        });
      }
      case 'create-stage-phase': {
        const result = applied(ws, op);
        if (!result.ok) return result;
        // A host's page goes to the new phase.
        view = { board: result.path };
        refresh();
        return ok({ stage: result.stage, phase: result.phase });
      }
      case 'set-current': {
        const result = applied(ws, op);
        if (!result.ok) return result;
        refresh();
        return ok();
      }
      case 'close': {
        const result = applied(ws, op);
        if (!result.ok) return result;
        view = { board: result.target.path };
        refresh();
        return ok({
          target: { stage: result.target.stage, phase: result.target.phase },
          moved: result.moved,
          created: result.created,
        });
      }
    }
  };

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
