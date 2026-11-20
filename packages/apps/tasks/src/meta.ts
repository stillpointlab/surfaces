/**
 * What a host shows for the tasks app before a board is open (the app
 * contract's `AppMeta`): its name and icon in the host's tree, and the create
 * form's copy, with the consent a create at the root asks for. The `./meta`
 * entry: it imports `./paths` alone, so a host page that lists the apps loads
 * none of the core (and no zod).
 */
import { TASKS_DEFAULT_FOLDER } from './paths.js';

import type { AppMeta } from '@stillpointlab/common-format/app';

export const tasksMeta: AppMeta = {
  label: 'Tasks',
  icon: 'task',
  create: {
    noun: 'a task project',
    subject: 'Task project',
    defaultFolder: TASKS_DEFAULT_FOLDER,
    folderExample: '“tasks” or “docs/tasks”',
    folderHelp:
      "Where tasks.yaml lives in the repository. A folder keeps the board's files together — and leaves room for other apps beside it.",
    // A manifest at the root claims the whole repository for this one app.
    rootConsent: {
      warning:
        'Creating at the repository root means this repository can only ever hold this one app view — no inventory or second board can be added later unless the manifest is moved into a folder.',
      confirm: 'I understand — make the whole repository this task project',
    },
  },
};
