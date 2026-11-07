/// <reference lib="dom" />

// The tasks app's element: `<spl-task-board>`, which takes a board (or stage)
// state and asks its host for ops by path (see the README's Element section).
export { TaskBoard } from './task-board.js';
export type { TaskBoardCheckinRequest, TaskBoardOps } from './task-board.js';
