/// <reference lib="dom" />

// The tasks app's elements: `<spl-task-board>`, which takes a board (or stage)
// state and asks its host for ops by path, and `<spl-tasks-nav>`, the
// stage/phase tab strip (see the README's Element section). The create form is
// its own entry, `./create-element`, so a page that only shows a board does not
// load it.
export { TaskBoard } from './task-board.js';
export type { TaskBoardCheckinRequest, TaskBoardOps } from './task-board.js';
export { NAVIGATE_EVENT, RELOAD_REQUEST_EVENT, TasksNav } from './tasks-nav.js';
export type {
  TasksNavCloseCandidate,
  TasksNavCurrent,
  TasksNavLinks,
  TasksNavOps,
  TasksNavState,
} from './tasks-nav.js';
