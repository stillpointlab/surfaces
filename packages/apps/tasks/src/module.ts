/**
 * The tasks app as a host runs it (the app contract's `AppModule`): the
 * lifecycle and the core, which of the board's and the strip's ops are the
 * core's, the elements' replies, and how a host treats each refusal.
 */
import { fail, ok } from '@stillpointlab/common-format/app';

import { tasksCore } from './core.js';
import { tasksLifecycle } from './lifecycle.js';
import { projectResolvedCard, resolveTasks } from './projection.js';

import type { TasksCoreOps, TasksViews } from './core.js';
import type { CreateTasksInput } from './create.js';
import type { TaskBoardOps, TasksNavOps } from './elementOps.js';
import type { TasksHostFacts, TasksSnapshot } from './projection.js';
import type { AppCoreOp, AppModule, Result, RefusalClass } from '@stillpointlab/common-format/app';

/** The board's ops and the strip's, which one host answers. */
export type TasksElementOps = TaskBoardOps & TasksNavOps;

/**
 * How a host treats each refusal: the statuses Context Manager's endpoints
 * have always sent. Anything unlisted is `invalid`.
 */
const REFUSAL_CLASS: Readonly<Record<string, RefusalClass>> = {
  TASKS_MANIFEST_NOT_FOUND: 'not-found',
  TASKS_CARD_NOT_FOUND: 'not-found',
  TASKS_BOARD_NOT_FOUND: 'not-found',
  TASKS_COLUMN_NOT_FOUND: 'not-found',
  TASKS_KIND_NOT_FOUND: 'not-found',
  TASKS_STAGE_NOT_FOUND: 'not-found',
  TASKS_CARD_NEEDS_ATTENTION: 'conflict',
  TASKS_CARD_CONTENT_UNAVAILABLE: 'conflict',
  TASKS_TEMPLATE_UNAVAILABLE: 'conflict',
  TASKS_CHECKIN_IN_FLIGHT: 'conflict',
  TASKS_MOVE_TARGET_EXISTS: 'conflict',
  TASKS_BRIEF_EXISTS: 'conflict',
  TASKS_PATH_EXISTS: 'conflict',
  TASKS_COLUMN_ID_EXISTS: 'conflict',
  TASKS_KIND_ID_EXISTS: 'conflict',
  TASKS_KIND_DIR_EXISTS: 'conflict',
  TASKS_COLUMN_REFERENCED: 'conflict',
  TASKS_COLUMN_NOT_EMPTY: 'conflict',
  TASKS_KIND_NOT_EMPTY: 'conflict',
  TASKS_NO_CURRENT_POINTER: 'conflict',
  TASKS_CLOSE_NEEDS_ATTENTION: 'conflict',
};

/** A settings edit the rewriter will not make is a conflict with the file as it is. */
const MANIFEST_PATCH_REFUSALS = new Set(['TASKS_MANIFEST_UNPATCHABLE', 'TASKS_ID_IMMUTABLE']);

/** A tag the rewriter cannot add is the op's own fault. */
const TAG_REWRITE_REFUSALS = new Set([
  'TASKS_TAG_EMPTY',
  'TASKS_TAGS_UNPARSEABLE',
  'TASKS_MANIFEST_UNPATCHABLE',
]);

/** One card as it stands after the op, for the board to settle on. */
function withCard(snapshot: TasksSnapshot, facts: TasksHostFacts, path: string): Result<object> {
  const resolved = resolveTasks(snapshot);
  if (!resolved?.ok) return resolved ?? fail('TASKS_MANIFEST_NOT_FOUND', 'tasks.yaml is gone');
  const card = projectResolvedCard(snapshot, resolved.tasks, path, facts);
  return card ? ok({ card }) : fail('TASKS_CARD_NOT_FOUND', `No card at ${path}`);
}

/** The applied op's own result, without its changes. */
function resultOf(applied: Record<string, unknown>): Result<object> {
  const { ok: _ok, changes: _changes, ...rest } = applied;
  return ok(rest);
}

export const tasksModule: AppModule<
  TasksViews,
  TasksCoreOps,
  TasksHostFacts,
  CreateTasksInput,
  TasksSnapshot,
  TasksElementOps
> = {
  id: 'tasks',
  lifecycle: tasksLifecycle,
  core: tasksCore,
  coreOps: [
    'move',
    'move-file',
    'reorder-pool',
    'set-title',
    'set-tags',
    'create-card',
    'fix-references',
    'add-tag',
    'edit-manifest',
    'create-stage-phase',
    'set-current',
    'close',
  ],
  hostOps: ['resolve', 'scan-references', 'read-file', 'refresh-stage', 'close-candidates'],
  // The core reads no clock: a new card is stamped with the host's time.
  toCoreOp: (op, host) =>
    (op.type === 'create-card' ? { ...op, now: host.now } : op) as AppCoreOp<TasksCoreOps>,
  reply: (op, applied, { snapshot, facts, view }) => {
    switch (op.type) {
      case 'move':
        return withCard(snapshot, facts, op.path);
      case 'move-file':
      case 'create-card':
        return withCard(snapshot, facts, applied.path as string);
      case 'reorder-pool': {
        // The pool of whatever the page shows: a board, or a stage's phases.
        const state =
          view?.type === 'stage'
            ? tasksCore.project(snapshot, view, facts)
            : view?.type === 'board'
              ? tasksCore.project(snapshot, view, facts)
              : null;
        return state?.pool ? ok({ pool: state.pool }) : fail('TASKS_BOARD_NOT_FOUND', 'No pool');
      }
      case 'create-stage-phase':
        return ok({ stage: applied.stage, phase: applied.phase });
      case 'close': {
        const target = applied.target as { stage: number; phase: number };
        return ok({
          target: { stage: target.stage, phase: target.phase },
          moved: applied.moved,
          ...(applied.created !== undefined ? { created: applied.created } : {}),
        });
      }
      default:
        return resultOf(applied);
    }
  },
  refusalClass: (code, op) => {
    if (op === 'edit-manifest' && MANIFEST_PATCH_REFUSALS.has(code)) return 'conflict';
    if (op === 'add-tag' && TAG_REWRITE_REFUSALS.has(code)) return 'invalid';
    return REFUSAL_CLASS[code] ?? 'invalid';
  },
};
