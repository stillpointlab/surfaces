// What the tasks shell shows in its check-in review: a row for each changed
// card, the pool's order file and each housekeeping file, labelled as Context
// Manager's check-in dialog labels them (a moved card, a column move as
// "old → new", "content edited", "backlog priority", "pointer / tags", "new
// folder"); on a stage view the rows sit under their phase, or "Pool & config".
// And its own words for a host that gives none, which say "check in" and never
// "commit" or "pull request".

import type { TaskBoardCheckinRequest } from '../element/task-board.js';
import type { SharedTaskBoardState, SharedTaskCard, SharedTaskStageState } from '../types.js';
import type { CheckinFile } from '@stillpointlab/checkin-review-component';
import type { CheckinWords } from '@stillpointlab/common-format/app';

/** The shell's words for its review, when its host gives none. */
export const TASKS_CHECKIN_WORDS: CheckinWords = {
  heading: 'Check in board changes',
  help: 'Choose the files to include in this check-in.',
  title: 'Title',
  body: 'Description (optional)',
  confirm: 'Check in',
  cancel: 'Cancel',
  busy: 'Checking in…',
  noFiles: 'Choose at least one file to check in.',
  nothing: 'Nothing has changed since the last check-in.',
};

/** The review's title to start with. */
export const tasksCheckinTitle = (boardLabel: string): string => `Tasks check-in: ${boardLabel}`;

/** The group of a row on a stage view: its phase, by the path's `stageN/phaseM/`, or the pool and config. */
export function phaseGroupOf(path: string): string {
  const match = /stage(\d+)\/phase(\d+)\//.exec(path);
  return match ? `Phase ${match[2]}` : 'Pool & config';
}

const columnName = (id: string | null | undefined): string =>
  id === null || id === undefined ? 'needs attention' : id;

function cardLabel(card: SharedTaskCard): string {
  if (card.movedFrom !== undefined) return 'moved';
  if (card.dirty) return `${columnName(card.versionColumn)} → ${columnName(card.column)}`;
  return 'content edited';
}

/**
 * The rows for a request: the cards (by path, under their phase, on a stage
 * view), then the order file, then the housekeeping files. A moved card's old
 * path is its row's `from`, so a check-in takes both halves.
 */
export function tasksCheckinFiles(request: TaskBoardCheckinRequest): CheckinFile[] {
  const onStage = request.stage !== null;
  const group = (path: string): { group?: string } =>
    onStage ? { group: phaseGroupOf(path) } : {};
  const cards = onStage
    ? [...request.cards].sort((a, b) => a.path.localeCompare(b.path))
    : request.cards;
  return [
    ...cards.map((card) => ({
      path: card.path,
      ...(card.movedFrom !== undefined ? { from: card.movedFrom } : {}),
      label: cardLabel(card),
      ...group(card.path),
    })),
    ...(request.orderFile
      ? [
          {
            path: request.orderFile.path,
            label: 'backlog priority',
            ...group(request.orderFile.path),
          },
        ]
      : []),
    ...request.housekeeping.map((file) => ({
      path: file.path,
      label: file.kind === 'manifest' ? 'pointer / tags' : 'new folder',
      ...group(file.path),
    })),
  ];
}

/** What the board's `checkin-request` carries, from a state alone, as the board builds it. */
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
  ].filter((card) => card.changed && !card.tracked);
  return {
    boardPath: board?.board.path ?? '',
    boardLabel: board?.board.label ?? `Stage ${stage?.stage}`,
    stage: stage?.stage ?? null,
    cards,
    orderFile: pool?.order?.changed === true ? { path: pool.orderPath } : null,
    housekeeping: state.housekeeping ?? [],
  };
}

/** The context the shell sends with its op: the board's path and the stage. */
export function checkinContextOf(request: TaskBoardCheckinRequest): Record<string, unknown> {
  return { boardPath: request.boardPath, stage: request.stage };
}
