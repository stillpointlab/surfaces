// What a check-in would take, from a state alone: the one rule for the board,
// which counts it, offers Check in and raises `checkin-request` with it, and for
// the shell, which opens its review on it. No DOM.

import type {
  SharedTaskBoardState,
  SharedTaskCard,
  SharedTaskHousekeepingFile,
  SharedTaskStageState,
} from './types.js';

/** The `checkin-request` event's detail: everything with an uncommitted change. */
export interface TaskBoardCheckinRequest {
  boardPath: string;
  boardLabel: string;
  /** Set on the stage view: check-in scope is every phase of the stage. */
  stage: number | null;
  /** Changed cards as the state carries them (never tracked ones: they have no local work). */
  cards: SharedTaskCard[];
  /** The pool's order file when its draft changed (ADR-0020). */
  orderFile: { path: string } | null;
  /** Changed non-card repo files (manifest pointer/tags, repo-view new folders). */
  housekeeping: SharedTaskHousekeepingFile[];
}

/**
 * Whether a card has an uncommitted change: moved to another column, moved to
 * another phase, edited, or new. A tracked card never has: it has no local work
 * to check in (ADR-0023). The board's dirty mark and the check-in set both ask this.
 */
export function hasUncommittedChange(card: SharedTaskCard): boolean {
  return Boolean(card.changed) && !card.tracked;
}

/**
 * The check-in set of a view's state: the changed cards on the board (or in
 * every phase of the stage) and in the pool, the pool's order file when it
 * changed, and the housekeeping files.
 */
export function checkinRequestOf(
  state: SharedTaskBoardState | SharedTaskStageState,
  view: 'board' | 'stage'
): TaskBoardCheckinRequest {
  const stage = view === 'stage' ? (state as SharedTaskStageState) : null;
  const board = view === 'board' ? (state as SharedTaskBoardState) : null;
  const pool = state.pool;
  const cards = [
    ...(stage ? stage.phases.flatMap((phase) => phase.cards) : (board?.cards ?? [])),
    ...(pool?.cards ?? []),
  ].filter(hasUncommittedChange);
  return {
    boardPath: board?.board.path ?? '',
    boardLabel: board?.board.label ?? `Stage ${stage?.stage}`,
    stage: stage?.stage ?? null,
    cards,
    orderFile: pool?.order?.changed === true ? { path: pool.orderPath } : null,
    housekeeping: state.housekeeping ?? [],
  };
}

/** How many things a check-in would take: the count beside the board's Check in. */
export function checkinCountOf(request: TaskBoardCheckinRequest): number {
  return request.cards.length + request.housekeeping.length + (request.orderFile ? 1 : 0);
}
