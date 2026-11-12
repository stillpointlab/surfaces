/**
 * The checks a new tasks manifest's columns and kinds must pass (spec
 * create-from-the-app), shared by `<spl-tasks-create>`, which shows the first
 * problem before anything is sent, and `planTasksCreate`, which refuses the
 * same input at the host. The `./create` entry: DOM-free and zod-free, so the
 * form carries none of the core.
 *
 * The folder and the root consent are the host's fields and the plan's rule,
 * so they are not checked here.
 */
import { fail, ok } from '@stillpointlab/common-format/app';

import { slugifyTaskId, TASKS_ID_MAX_LENGTH, TASKS_SLUG_PATTERN } from './paths.js';
import { UNASSIGNED_COLUMN_ID, UNASSIGNED_DIR } from './types.js';

import type { TasksManifestSeed } from './manifestSeed.js';
import type { Failure, Result } from '@stillpointlab/common-format/app';

export { slugifyTaskId, TASKS_DEFAULT_FOLDER, TASKS_ID_MAX_LENGTH } from './paths.js';

/** The longest column or kind label. */
export const TASKS_LABEL_MAX_LENGTH = 40;
/** The longest column description. */
export const TASKS_DESCRIPTION_MAX_LENGTH = 200;
export const TASKS_CREATE_MAX_COLUMNS = 50;
export const TASKS_CREATE_MAX_KINDS = 20;
/** The labels a new manifest starts with, ids derived from them. */
export const TASKS_CREATE_DEFAULT_COLUMNS: readonly string[] = ['Todo', 'In progress', 'Done'];
export const TASKS_CREATE_DEFAULT_KINDS: readonly string[] = ['Task'];

/** What the create form collects: the create input without its folder and root consent. */
export type TasksCreateFields = TasksManifestSeed;

/** Which list a refusal is about, as its `details[0]`, with the row when it is one row's. */
export interface TasksCreateField {
  field: 'columns' | 'kinds';
  index?: number;
}

const refuse = (code: string, message: string, where: TasksCreateField): Failure =>
  fail(code, message, [where]);

interface Row {
  id: string;
  label?: string;
  description?: string;
}

function checkRows(rows: readonly Row[], what: 'column' | 'kind'): Result {
  const field = what === 'column' ? 'columns' : 'kinds';
  const ids = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const where = { field, index } as const;
    // A kind may leave its label out (it defaults from the id); a blank one is a mistake.
    const label = row.label ?? (what === 'kind' ? row.id : '');
    if (label === '') return refuse('TASKS_LABEL_INVALID', `Give every ${what} a label.`, where);
    if (label.length > TASKS_LABEL_MAX_LENGTH) {
      return refuse(
        'TASKS_LABEL_INVALID',
        `“${label}” is too long for a ${what} label (${TASKS_LABEL_MAX_LENGTH} characters max).`,
        where
      );
    }
    if (row.id === '' || row.id.length > TASKS_ID_MAX_LENGTH || !TASKS_SLUG_PATTERN.test(row.id)) {
      return refuse(
        'TASKS_ID_INVALID',
        `“${label}” needs a lowercase id (a-z, 0-9, - or _), like “${slugifyTaskId(label) || 'todo'}”.`,
        where
      );
    }
    if (row.id === UNASSIGNED_COLUMN_ID) {
      return refuse(
        'TASKS_ID_RESERVED',
        `“${UNASSIGNED_COLUMN_ID}” is reserved for the built-in unassigned ${what === 'column' ? 'column' : 'pool'}.`,
        where
      );
    }
    if (ids.has(row.id)) {
      return refuse('TASKS_ID_DUPLICATE', `Two ${what}s share the id “${row.id}”.`, where);
    }
    ids.add(row.id);
    if ((row.description ?? '').length > TASKS_DESCRIPTION_MAX_LENGTH) {
      return refuse(
        'TASKS_DESCRIPTION_TOO_LONG',
        `“${label}”'s description is too long (${TASKS_DESCRIPTION_MAX_LENGTH} characters max).`,
        where
      );
    }
  }
  return ok();
}

/**
 * The first problem with a create's columns and kinds, in the order the form
 * shows them, or ok. Labels are taken as given: the form trims them.
 */
export function checkTasksCreate(input: TasksCreateFields): Result {
  if (input.columns.length === 0) {
    return refuse('TASKS_COLUMNS_REQUIRED', 'Declare at least one column.', { field: 'columns' });
  }
  if (input.columns.length > TASKS_CREATE_MAX_COLUMNS) {
    return refuse('TASKS_TOO_MANY_COLUMNS', `At most ${TASKS_CREATE_MAX_COLUMNS} columns.`, {
      field: 'columns',
    });
  }
  if (input.kinds.length === 0) {
    return refuse('TASKS_KINDS_REQUIRED', 'Declare at least one kind.', { field: 'kinds' });
  }
  if (input.kinds.length > TASKS_CREATE_MAX_KINDS) {
    return refuse('TASKS_TOO_MANY_KINDS', `At most ${TASKS_CREATE_MAX_KINDS} kinds.`, {
      field: 'kinds',
    });
  }
  const columns = checkRows(input.columns, 'column');
  if (!columns.ok) return columns;
  const kinds = checkRows(input.kinds, 'kind');
  if (!kinds.ok) return kinds;
  // Kind folders derive from ids (`${id}s`): the reserved pool folder and two
  // kinds sharing a folder are refusals the manifest would also make.
  const dirs = new Set<string>();
  for (const [index, kind] of input.kinds.entries()) {
    const dir = `${kind.id}s`;
    if (dir === UNASSIGNED_DIR) {
      return refuse(
        'TASKS_KIND_DIR_CONFLICT',
        `The kind “${kind.id}” would use the reserved folder.`,
        {
          field: 'kinds',
          index,
        }
      );
    }
    if (dirs.has(dir)) {
      return refuse('TASKS_KIND_DIR_CONFLICT', `Two kinds would share the folder “${dir}/”.`, {
        field: 'kinds',
        index,
      });
    }
    dirs.add(dir);
  }
  return ok();
}
