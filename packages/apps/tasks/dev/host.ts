// An in-memory host for the harness: answers the board's ops against the state
// the board holds, so drags, moves and reorders settle without a server. It
// does nothing a real host's server does (no drafts, no files written); it only
// lets the optimistic render settle or roll back.
import { answerOps, fail, ok } from '@stillpointlab/common-format/app';

import { orderPoolCards } from '../src/pool.js';
import { taskKindById } from '../src/types.js';

import type { TaskBoard, TaskBoardOps } from '../src/element/index.js';
import type { SharedTaskCard, SharedTaskStageState } from '../src/types.js';
import type { AppOp, Result } from '@stillpointlab/common-format/app';

export interface HarnessHost {
  /** Answer ops (true) or leave them unclaimed (false). */
  setAnswering(on: boolean): void;
  /** Refuse the next op, once. */
  failNext(): void;
}

export function attachHost(
  board: TaskBoard,
  files: Readonly<Record<string, string>>,
  stage: () => SharedTaskStageState | null
): HarnessHost {
  let stop: (() => void) | null = null;
  let failOnce = false;

  const cards = (): SharedTaskCard[] => {
    const state = board.boardState;
    const stageState = stage();
    return [
      ...(state?.cards ?? []),
      ...(state?.pool.cards ?? []),
      ...(stageState?.phases.flatMap((phase) => phase.cards) ?? []),
      ...(stageState?.pool.cards ?? []),
    ];
  };
  const find = (path: string): SharedTaskCard | undefined =>
    cards().find((card) => card.path === path);
  // Answering links a tracked card, as a real host does on its first edit.
  const linked = (card: SharedTaskCard, changes: Partial<SharedTaskCard>): SharedTaskCard => {
    const next: SharedTaskCard = { ...card, goodId: card.goodId ?? 1, ...changes };
    delete next.tracked;
    return next;
  };

  const answer = (op: AppOp<TaskBoardOps>): Result<object> => {
    if (failOnce) {
      failOnce = false;
      return fail('HARNESS_REFUSED', 'The harness refused this op');
    }
    switch (op.type) {
      case 'move': {
        const card = find(op.path);
        if (!card) return fail('NOT_FOUND', `No card at ${op.path}`);
        return ok({ card: linked(card, { column: op.column, dirty: true, changed: true }) });
      }
      case 'move-file': {
        const card = find(op.path);
        const pool = board.boardState?.pool ?? stage()?.pool;
        const kinds = board.boardState?.kinds ?? stage()?.kinds ?? [];
        if (!card || !pool) return fail('NOT_FOUND', `No card at ${op.path}`);
        const dir = taskKindById(kinds, card.kind)?.dir ?? `${card.kind}s`;
        const name = card.path.slice(card.path.lastIndexOf('/') + 1);
        const root = 'pool' in op.target ? pool.path : op.target.boardPath;
        return ok({
          card: linked(card, {
            path: `${root}/${dir}/${name}`,
            column: 'pool' in op.target ? null : op.target.column,
            movedFrom: card.path,
            changed: true,
          }),
        });
      }
      case 'reorder-pool': {
        const pool = board.boardState?.pool ?? stage()?.pool;
        if (!pool) return fail('NOT_FOUND', 'No pool');
        return ok({
          pool: {
            ...pool,
            cards: orderPoolCards(pool.cards, op.paths),
            order: { goodId: 1, changed: true },
          },
        });
      }
      case 'resolve': {
        const card = find(op.path);
        if (!card) return fail('NOT_FOUND', `No card at ${op.path}`);
        const next = { ...card };
        delete next.diverged;
        return ok({ card: next });
      }
      case 'scan-references':
        return ok({ references: [] });
      case 'fix-references':
        return ok({ fixed: 0 });
      case 'read-file':
        return ok({ content: files[op.path] ?? `# ${op.path}\n\n(no fixture text for this file)` });
      case 'refresh-stage': {
        const current = stage();
        return current ? ok({ stage: current }) : fail('NOT_FOUND', 'No stage');
      }
    }
  };

  const setAnswering = (on: boolean): void => {
    stop?.();
    stop = on ? answerOps<TaskBoardOps>(board, answer) : null;
  };
  setAnswering(true);
  return { setAnswering, failNext: () => (failOnce = true) };
}
