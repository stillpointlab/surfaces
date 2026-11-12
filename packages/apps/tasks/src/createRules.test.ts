import { describe, expect, it } from 'vitest';

import { checkTasksCreate } from './createRules.js';

import type { TasksCreateFields } from './createRules.js';

const columns = [{ id: 'todo', label: 'Todo' }];
const kinds = [{ id: 'task', label: 'Task' }];
const refusal = (input: TasksCreateFields) => {
  const result = checkTasksCreate(input);
  return result.ok ? null : { code: result.code, message: result.message, at: result.details?.[0] };
};

describe('checkTasksCreate', () => {
  it('accepts columns and kinds, a kind without a label included', () => {
    expect(checkTasksCreate({ columns, kinds })).toEqual({ ok: true });
    expect(checkTasksCreate({ columns, kinds: [{ id: 'spec' }] })).toEqual({ ok: true });
  });

  it('refuses empty and overfull lists', () => {
    expect(refusal({ columns: [], kinds })?.code).toBe('TASKS_COLUMNS_REQUIRED');
    expect(refusal({ columns, kinds: [] })?.code).toBe('TASKS_KINDS_REQUIRED');
    const many = Array.from({ length: 51 }, (_, i) => ({ id: `c${i}`, label: `C ${i}` }));
    expect(refusal({ columns: many, kinds })?.code).toBe('TASKS_TOO_MANY_COLUMNS');
    expect(refusal({ columns, kinds: many.slice(0, 21) })?.code).toBe('TASKS_TOO_MANY_KINDS');
  });

  it('refuses a blank label, a bad id, the reserved id and a repeated id, by row', () => {
    expect(refusal({ columns: [{ id: 'todo', label: '' }], kinds })).toEqual({
      code: 'TASKS_LABEL_INVALID',
      message: 'Give every column a label.',
      at: { field: 'columns', index: 0 },
    });
    expect(refusal({ columns: [{ id: 'To Do', label: 'To Do' }], kinds })).toMatchObject({
      code: 'TASKS_ID_INVALID',
      message: '“To Do” needs a lowercase id (a-z, 0-9, - or _), like “to-do”.',
    });
    expect(refusal({ columns: [{ id: 'unassigned', label: 'Pool' }], kinds })?.code).toBe(
      'TASKS_ID_RESERVED'
    );
    expect(refusal({ columns, kinds: [...kinds, { id: 'task', label: 'Other' }] })).toMatchObject({
      code: 'TASKS_ID_DUPLICATE',
      at: { field: 'kinds', index: 1 },
    });
  });

  it('refuses an overlong label or description', () => {
    expect(refusal({ columns: [{ id: 'todo', label: 'x'.repeat(41) }], kinds })?.code).toBe(
      'TASKS_LABEL_INVALID'
    );
    expect(
      refusal({ columns: [{ id: 'todo', label: 'Todo', description: 'x'.repeat(201) }], kinds })
        ?.code
    ).toBe('TASKS_DESCRIPTION_TOO_LONG');
  });
});
