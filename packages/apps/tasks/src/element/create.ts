/// <reference lib="dom" />
// `./create-element`: `<spl-tasks-create>`, a tasks manifest's create form (see
// the README's "The create form"). Its own entry, apart from `./element`, so a
// host loads it only where it creates a tasks manifest.

export { CREATE_VALIDITY_EVENT, TasksCreate } from './tasks-create.js';
export type { TasksCreateOps, TasksCreateState } from './tasks-create.js';
