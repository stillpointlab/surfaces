/// <reference lib="dom" />

// The tasks app's elements: `<spl-task-board>`, which takes a board (or stage)
// state and asks its host for ops by path, `<spl-tasks-nav>`, the stage/phase
// tab strip, and `<spl-tasks-create>`, the create form (see the README's
// Element section).
export { TaskBoard } from './task-board.js';
export { CREATE_VALIDITY_EVENT, TasksCreate } from './tasks-create.js';
export type { TasksCreateOps, TasksCreateState } from './tasks-create.js';
export type { TaskBoardCheckinRequest, TaskBoardOps } from './task-board.js';
export { NAVIGATE_EVENT, TasksNav } from './tasks-nav.js';
export type {
  TasksNavCloseCandidate,
  TasksNavCurrent,
  TasksNavLinks,
  TasksNavOps,
  TasksNavState,
} from './tasks-nav.js';
