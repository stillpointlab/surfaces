/**
 * The tasks core as the app contract's `AppCore` (phase 7, tasks-rules): the
 * projections of `projection.ts`, the ops of `cardOps.ts` and the create plan
 * of `create.ts` behind `project`, `apply` and `seed`. A host may call either:
 * the contract when it is generic (the harness), the named functions when it is
 * not (Context Manager).
 */
import { fail } from '@stillpointlab/common-format/app';

import {
  createTaskCard,
  fixTaskReferences,
  moveTaskCard,
  moveTaskCardFile,
  reorderTaskPool,
  setTaskCardTags,
  setTaskCardTitle,
} from './cardOps.js';
import { planTasksCreate } from './create.js';
import { projectTasksBoard, projectTasksNav, projectTasksStage } from './projection.js';

import type { CardMoveTarget } from './cardOps.js';
import type { CreateTasksInput } from './create.js';
import type { TasksHostFacts, TasksNavProjection, TasksSnapshot } from './projection.js';
import type { SharedTaskBoardState, SharedTaskStageState } from './types.js';
import type { AppApplyResult, AppCore, AppCoreOp, Result } from '@stillpointlab/common-format/app';

/** The states the tasks elements render. */
export type TasksViews = {
  /** One board, by path, for `<spl-task-board>`. */
  board: { params: { path: string }; state: SharedTaskBoardState };
  /** One stage's phases as rows, for `<spl-task-board>`'s stage view. */
  stage: { params: { stage: number }; state: SharedTaskStageState };
  /** The nav, for `<spl-tasks-nav>` (the page adds its selection). */
  nav: { params: object; state: TasksNavProjection };
};

/** The ops, named and shaped as the board asks for them. */
export type TasksCoreOps = {
  move: { op: { path: string; column: string | null }; result: object };
  'move-file': {
    op: { path: string; target: CardMoveTarget; coMoving?: Readonly<Record<string, string>> };
    result: { path: string; location: 'board' | 'pool' };
  };
  'reorder-pool': { op: { paths: readonly string[] }; result: object };
  'set-title': { op: { path: string; title: string | null }; result: object };
  'set-tags': { op: { path: string; tags: readonly string[] }; result: object };
  /** `now` is the creation time the card is stamped with: the core reads no clock. */
  'create-card': {
    op: { boardPath: string; title: string; kind: string; now: string };
    result: { path: string };
  };
  'fix-references': {
    op: { path: string; referencingPaths: readonly string[] };
    result: { fixed: number };
  };
};

/** One op, narrowed by its type, to the named function that answers it. */
function applyOp(snapshot: TasksSnapshot, op: AppCoreOp<TasksCoreOps>): Result<object> {
  switch (op.type) {
    case 'move':
      return moveTaskCard(snapshot, op);
    case 'move-file':
      return moveTaskCardFile(snapshot, op);
    case 'reorder-pool':
      return reorderTaskPool(snapshot, op);
    case 'set-title':
      return setTaskCardTitle(snapshot, op);
    case 'set-tags':
      return setTaskCardTags(snapshot, op);
    case 'create-card':
      return createTaskCard(snapshot, op);
    case 'fix-references':
      return fixTaskReferences(snapshot, op);
    default:
      return fail('TASKS_UNKNOWN_OP', `The tasks app has no "${(op as { type: string }).type}" op`);
  }
}

export const tasksCore: AppCore<
  TasksViews,
  TasksCoreOps,
  TasksHostFacts,
  CreateTasksInput,
  TasksSnapshot
> = {
  project: (snapshot, view, facts) => {
    const asked = view as { type: string; path?: string; stage?: number };
    // Each view's own state; the contract's per-type signature is one
    // TypeScript cannot follow through a switch.
    type Projected = ReturnType<
      AppCore<TasksViews, TasksCoreOps, TasksHostFacts, CreateTasksInput, TasksSnapshot>['project']
    >;
    switch (asked.type) {
      case 'board':
        return projectTasksBoard(snapshot, asked.path!, facts) as Projected;
      case 'stage':
        return projectTasksStage(snapshot, asked.stage!, facts) as Projected;
      default:
        return projectTasksNav(snapshot) as Projected;
    }
  },
  apply: <K extends keyof TasksCoreOps & string>(
    snapshot: TasksSnapshot,
    op: { type: K } & TasksCoreOps[K]['op']
  ) => applyOp(snapshot, op as AppCoreOp<TasksCoreOps>) as AppApplyResult<TasksCoreOps, K>,
  seed: planTasksCreate,
};
