/// <reference lib="dom" />
// The tasks app's shell: `<spl-tasks-app>`, the page around the board and the
// tab strip (the app contract's `AppShellElement`; see the README's Shell
// section). It registers the two elements it lays out.

export { NAVIGATE_EVENT, TasksApp } from './tasks-app.js';
export type { TasksNavigate } from './tasks-app.js';
export { RELOAD_REQUEST_EVENT } from '../element/tasks-nav.js';
export type { TaskBoardCheckinRequest, TaskBoardOps } from '../element/task-board.js';
export type { TasksNavOps } from '../element/tasks-nav.js';
export type { TasksPageExtras } from '../pages.js';
