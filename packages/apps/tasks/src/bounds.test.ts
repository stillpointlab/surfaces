import { describe, expect, it } from 'vitest';

import { tasksBounds } from './bounds.js';

// The bounds as Context Manager has them at 8fa439ba. The first cases are
// carried over from its tests there (`services/tasks/opSchema.test.ts`, every
// case it has); the rest pin each limit, enum and pattern at its edge.

const CARD = 'docs/tasks/stage1/phase1/specs/task_a.md';
const x = (length: number): string => 'x'.repeat(length);
const many = (n: number, of: (i: number) => unknown = (i) => `p${i}.md`): unknown[] =>
  Array.from({ length: n }, (_, i) => of(i));

const opOk = (op: unknown): boolean => tasksBounds.op(op).ok;
const viewOk = (view: unknown): boolean => tasksBounds.view(view).ok;
const createOk = (input: unknown): boolean => tasksBounds.create(input).ok;
const edit = (body: Record<string, unknown>) => ({ type: 'edit-manifest', edit: body });

describe('tasksBounds.op: Context Manager’s cases', () => {
  it.each([
    ['a column move', { type: 'move', path: CARD, column: 'done' }],
    ['a move to Unassigned', { type: 'move', path: CARD, column: null }],
    ['a file move to the pool', { type: 'move-file', path: CARD, target: { pool: true } }],
    ['a title removed', { type: 'set-title', path: CARD, title: null }],
    ['tags cleared', { type: 'set-tags', path: CARD, tags: [] }],
    ['a pool reorder', { type: 'reorder-pool', paths: [CARD] }],
    ['a new card', { type: 'create-card', boardPath: '', title: 'Idea', kind: 'brief' }],
    ['a reference fix', { type: 'fix-references', path: CARD, referencingPaths: ['README.md'] }],
    ['a registry tag', { type: 'add-tag', tag: 'infra' }],
    ['a column added', edit({ op: 'add-column', id: 'review', label: 'Review' })],
    ['a new stage', { type: 'create-stage-phase', kind: 'stage' }],
    ['the pointer', { type: 'set-current', stage: 1, phase: 2 }],
    ['a close sweeping nothing', { type: 'close', kind: 'phase', paths: [] }],
  ])('takes %s', (_label, op) => {
    expect(opOk(op)).toBe(true);
  });

  it('trims what the endpoints trimmed', () => {
    expect(tasksBounds.op({ type: 'set-title', path: CARD, title: '  Title  ' })).toEqual({
      ok: true,
      op: { type: 'set-title', path: CARD, title: 'Title' },
    });
  });

  it.each([
    ['a move with no path', { type: 'move', column: 'done' }],
    ['a card named by good id', { type: 'move', goodPublicId: 'dg_1', path: CARD, column: 'done' }],
    ['a blank title', { type: 'set-title', path: CARD, title: '   ' }],
    ['a 201-character title', { type: 'set-title', path: CARD, title: 'a'.repeat(201) }],
    ['a blank new card title', { type: 'create-card', boardPath: '', title: ' ', kind: 'brief' }],
    ['a kind that is not a slug', { type: 'create-card', boardPath: '', title: 'X', kind: 'A B' }],
    ['a new phase with no stage', { type: 'create-stage-phase', kind: 'phase' }],
    ['a pointer at phase 0', { type: 'set-current', stage: 1, phase: 0 }],
    [
      'a reference fix with nothing to fix',
      { type: 'fix-references', path: CARD, referencingPaths: [] },
    ],
    ['update-column with nothing to update', edit({ op: 'update-column', id: 'todo' })],
    ['update-kind with nothing to update', edit({ op: 'update-kind', id: 'spec' })],
    ['a non-slug id', edit({ op: 'add-column', id: 'To Do', label: 'Todo' })],
    ['the reserved column id', edit({ op: 'add-column', id: 'unassigned', label: 'X' })],
    ['the reserved kind id', edit({ op: 'add-kind', id: 'unassigned' })],
    ['an unknown manifest op', edit({ op: 'rename-id', id: 'todo' })],
    ['a dir change', edit({ op: 'update-kind', id: 'spec', dir: 'x' })],
    ['an op the core does not apply', { type: 'resolve', path: CARD, mode: 'take-latest' }],
  ])('refuses %s', (_label, op) => {
    expect(opOk(op)).toBe(false);
  });
});

describe('tasksBounds.op: each limit at its edge', () => {
  it('answers APP_OP_INVALID with the schema’s issues', () => {
    const refused = tasksBounds.op({ type: 'set-title', path: CARD, title: x(201) });
    expect(refused).toMatchObject({ ok: false, code: 'APP_OP_INVALID' });
    expect(refused.ok ? [] : refused.details).toEqual([
      expect.objectContaining({ code: 'too_big', path: ['title'] }),
    ]);
    expect(refused.ok ? '' : refused.message).toMatch(/^The op is not valid: title: /);
  });

  it('refuses the host’s ops, the shell’s, an unknown type and a non-object', () => {
    for (const type of ['resolve', 'scan-references', 'read-file', 'refresh-stage']) {
      expect(opOk({ type, path: CARD }), type).toBe(false);
    }
    expect(opOk({ type: 'close-candidates', path: 'stage1/phase1' })).toBe(false);
    expect(opOk({ type: 'rename', path: CARD })).toBe(false);
    expect(opOk(null)).toBe(false);
    expect(opOk('move')).toBe(false);
  });

  it('a card path of 1 to 1024 characters, wherever an op names one', () => {
    const named = (path: string) => [
      { type: 'move', path, column: 'done' },
      { type: 'move-file', path, target: { pool: true } },
      { type: 'set-title', path, title: 'T' },
      { type: 'set-tags', path, tags: [] },
      { type: 'fix-references', path, referencingPaths: ['README.md'] },
      { type: 'fix-references', path: CARD, referencingPaths: [path] },
      { type: 'reorder-pool', paths: [path] },
      { type: 'close', kind: 'phase', paths: [path] },
    ];
    for (const op of named(x(1024))) expect(opOk(op), `${op.type} at 1024`).toBe(true);
    for (const op of named(x(1025))) expect(opOk(op), `${op.type} at 1025`).toBe(false);
    for (const op of named('')) expect(opOk(op), `${op.type} empty`).toBe(false);
  });

  it('move: a column of at least one character, or null', () => {
    expect(opOk({ type: 'move', path: CARD, column: 'd' })).toBe(true);
    expect(opOk({ type: 'move', path: CARD, column: '' })).toBe(false);
    expect(opOk({ type: 'move', path: CARD })).toBe(false);
  });

  it('move-file: the pool, or a board path of up to 1024 characters and a column', () => {
    const to = (target: unknown) => opOk({ type: 'move-file', path: CARD, target });
    expect(to({ boardPath: x(1024), column: 'todo' })).toBe(true);
    expect(to({ boardPath: '', column: 'todo' })).toBe(true);
    expect(to({ boardPath: x(1025), column: 'todo' })).toBe(false);
    expect(to({ boardPath: 'stage1/phase2', column: '' })).toBe(false);
    expect(to({ pool: false })).toBe(false);
    expect(to({ pool: true, column: 'todo' })).toBe(false);
    expect(
      opOk({ type: 'move-file', path: CARD, target: { pool: true }, coMoving: { a: 'b' } })
    ).toBe(false);
  });

  it('reorder-pool and close: at most 1000 paths', () => {
    expect(opOk({ type: 'reorder-pool', paths: many(1000) })).toBe(true);
    expect(opOk({ type: 'reorder-pool', paths: many(1001) })).toBe(false);
    expect(opOk({ type: 'close', kind: 'stage', paths: many(1000) })).toBe(true);
    expect(opOk({ type: 'close', kind: 'stage', paths: many(1001) })).toBe(false);
    expect(opOk({ type: 'close', kind: 'board', paths: [] })).toBe(false);
  });

  it('set-title: 1 to 200 characters after trimming', () => {
    expect(opOk({ type: 'set-title', path: CARD, title: x(200) })).toBe(true);
    expect(opOk({ type: 'set-title', path: CARD, title: ` ${x(200)} ` })).toBe(true);
    expect(opOk({ type: 'set-title', path: CARD })).toBe(false);
  });

  it('set-tags: at most 20 tags, each 1 to 60 characters after trimming', () => {
    const tags = (list: unknown[]) => opOk({ type: 'set-tags', path: CARD, tags: list });
    expect(tags(many(20, (i) => `t${i}`))).toBe(true);
    expect(tags(many(21, (i) => `t${i}`))).toBe(false);
    expect(tags([x(60)])).toBe(true);
    expect(tags([x(61)])).toBe(false);
    expect(tags([' '])).toBe(false);
    expect(tasksBounds.op({ type: 'set-tags', path: CARD, tags: [' code '] })).toMatchObject({
      op: { tags: ['code'] },
    });
  });

  it('create-card: a board path of up to 1024, a title of 1 to 200, a slug kind', () => {
    const card = (fields: Record<string, unknown>) =>
      opOk({ type: 'create-card', boardPath: '', title: 'Idea', kind: 'spec', ...fields });
    expect(card({ boardPath: x(1024) })).toBe(true);
    expect(card({ boardPath: x(1025) })).toBe(false);
    expect(card({ title: x(200) })).toBe(true);
    expect(card({ title: x(201) })).toBe(false);
    expect(card({ kind: 'a' })).toBe(true);
    expect(card({ kind: `0${x(100)}_-` })).toBe(true);
    expect(card({ kind: '-spec' })).toBe(false);
    expect(card({ kind: '' })).toBe(false);
    // The host stamps the time; an element does not send it.
    expect(card({ now: '2026-11-09T12:00:00.000Z' })).toBe(false);
  });

  it('fix-references: 1 to 200 referencing paths', () => {
    const fix = (referencingPaths: unknown[]) =>
      opOk({ type: 'fix-references', path: CARD, referencingPaths });
    expect(fix(many(200))).toBe(true);
    expect(fix(many(201))).toBe(false);
  });

  it('add-tag: 1 to 60 characters after trimming', () => {
    expect(opOk({ type: 'add-tag', tag: x(60) })).toBe(true);
    expect(opOk({ type: 'add-tag', tag: x(61) })).toBe(false);
    expect(opOk({ type: 'add-tag', tag: '  ' })).toBe(false);
    expect(tasksBounds.op({ type: 'add-tag', tag: ' infra ' })).toMatchObject({
      op: { tag: 'infra' },
    });
  });

  it('create-stage-phase: a phase or a stage, a stage a positive whole number', () => {
    const create = (fields: Record<string, unknown>) =>
      opOk({ type: 'create-stage-phase', ...fields });
    expect(create({ kind: 'phase', stage: 1 })).toBe(true);
    expect(create({ kind: 'stage', stage: 2 })).toBe(true);
    expect(create({ kind: 'phase', stage: 0 })).toBe(false);
    expect(create({ kind: 'phase', stage: 1.5 })).toBe(false);
    expect(create({ kind: 'phase', stage: '1' })).toBe(false);
    expect(create({ kind: 'board' })).toBe(false);
  });

  it('set-current: a stage and a phase, each a positive whole number', () => {
    expect(opOk({ type: 'set-current', stage: 1, phase: 1 })).toBe(true);
    expect(opOk({ type: 'set-current', stage: 0, phase: 1 })).toBe(false);
    expect(opOk({ type: 'set-current', stage: 1, phase: 2.5 })).toBe(false);
    expect(opOk({ type: 'set-current', stage: 1 })).toBe(false);
  });
});

describe('tasksBounds.op: edit-manifest', () => {
  const ok = (body: Record<string, unknown>) => opOk(edit(body));

  it('an id of up to 40 characters, a lowercase slug', () => {
    expect(ok({ op: 'remove-column', id: x(40) })).toBe(true);
    expect(ok({ op: 'remove-column', id: x(41) })).toBe(false);
    expect(ok({ op: 'remove-kind', id: 'in-progress_2' })).toBe(true);
    expect(ok({ op: 'remove-kind', id: '_spec' })).toBe(false);
    expect(ok({ op: 'set-default-column', id: 'Todo' })).toBe(false);
    expect(ok({ op: 'set-done-column', id: '' })).toBe(false);
  });

  it('add-column: a label of 1 to 40, a description of 1 to 200', () => {
    const add = (fields: Record<string, unknown>) =>
      ok({ op: 'add-column', id: 'review', label: 'Review', ...fields });
    expect(add({ label: x(40) })).toBe(true);
    expect(add({ label: x(41) })).toBe(false);
    expect(add({ label: ' ' })).toBe(false);
    expect(add({ description: x(200) })).toBe(true);
    expect(add({ description: x(201) })).toBe(false);
    expect(add({ description: ' ' })).toBe(false);
    expect(ok({ op: 'add-column', id: 'review' })).toBe(false);
  });

  it('update-column: a label of 1 to 40, a description of 0 to 200 (empty clears it)', () => {
    const update = (fields: Record<string, unknown>) =>
      ok({ op: 'update-column', id: 'todo', ...fields });
    expect(update({ label: x(40) })).toBe(true);
    expect(update({ label: x(41) })).toBe(false);
    expect(update({ description: '' })).toBe(true);
    expect(update({ description: x(200) })).toBe(true);
    expect(update({ description: x(201) })).toBe(false);
  });

  it('add-kind and update-kind: a label of 1 to 40, a badge of 1 to 4', () => {
    for (const op of ['add-kind', 'update-kind']) {
      const kind = (fields: Record<string, unknown>) => ok({ op, id: 'note', ...fields });
      expect(kind({ label: x(40) }), op).toBe(true);
      expect(kind({ label: x(41) }), op).toBe(false);
      expect(kind({ badge: x(4) }), op).toBe(true);
      expect(kind({ badge: x(5) }), op).toBe(false);
      expect(kind({ badge: ' ' }), op).toBe(false);
    }
    expect(ok({ op: 'add-kind', id: 'note' })).toBe(true);
    expect(ok({ op: 'update-kind', id: 'note', creatable: false })).toBe(true);
    expect(ok({ op: 'update-kind', id: 'note', creatable: 'no' })).toBe(false);
    expect(ok({ op: 'add-kind', id: 'note', creatable: false })).toBe(false);
    expect(ok({ op: 'add-kind', id: 'note', template: 'note.template.md' })).toBe(false);
  });

  it('removes and pickers take nothing beside the id', () => {
    expect(ok({ op: 'remove-column', id: 'todo', label: 'Todo' })).toBe(false);
    expect(ok({ op: 'set-done-column', id: 'done', also: 'x' })).toBe(false);
  });
});

describe('tasksBounds.view', () => {
  it('takes a board by a path of up to 1024 characters, a stage, and the nav', () => {
    expect(tasksBounds.view({ type: 'nav' })).toEqual({ ok: true, view: { type: 'nav' } });
    expect(viewOk({ type: 'board', path: x(1024) })).toBe(true);
    expect(viewOk({ type: 'board', path: '' })).toBe(true);
    expect(viewOk({ type: 'board', path: x(1025) })).toBe(false);
    expect(viewOk({ type: 'stage', stage: 1 })).toBe(true);
    expect(viewOk({ type: 'stage', stage: 0 })).toBe(false);
    expect(viewOk({ type: 'stage', stage: 1.5 })).toBe(false);
    expect(viewOk({ type: 'stage', stage: '1' })).toBe(false);
  });

  it('refuses an unknown view or key with APP_VIEW_INVALID', () => {
    expect(tasksBounds.view({ type: 'phase', stage: 1, phase: 1 })).toMatchObject({
      ok: false,
      code: 'APP_VIEW_INVALID',
    });
    expect(viewOk({ type: 'nav', stage: 1 })).toBe(false);
    expect(viewOk({ type: 'board' })).toBe(false);
  });
});

describe('tasksBounds.create', () => {
  const column = (fields: Record<string, unknown> = {}) => ({
    id: 'todo',
    label: 'Todo',
    ...fields,
  });
  const kind = (fields: Record<string, unknown> = {}) => ({ id: 'task', ...fields });
  const input = (fields: Record<string, unknown> = {}) => ({
    columns: [column()],
    kinds: [kind()],
    ...fields,
  });

  it('answers the input as parsed, trimmed, or APP_CREATE_INVALID', () => {
    expect(tasksBounds.create(input({ columns: [column({ label: ' Todo ' })] }))).toEqual({
      ok: true,
      input: { columns: [{ id: 'todo', label: 'Todo' }], kinds: [{ id: 'task' }] },
    });
    expect(tasksBounds.create(input({ columns: [] }))).toMatchObject({
      ok: false,
      code: 'APP_CREATE_INVALID',
    });
  });

  it('1 to 50 columns and 1 to 20 kinds, and no folder or other key', () => {
    const columns = (n: number) => many(n, (i) => column({ id: `c${i}` }));
    const kinds = (n: number) => many(n, (i) => kind({ id: `k${i}` }));
    expect(createOk(input({ columns: columns(50) }))).toBe(true);
    expect(createOk(input({ columns: columns(51) }))).toBe(false);
    expect(createOk(input({ kinds: kinds(20) }))).toBe(true);
    expect(createOk(input({ kinds: kinds(21) }))).toBe(false);
    expect(createOk(input({ kinds: [] }))).toBe(false);
    expect(createOk(input({ folder: 'tasks' }))).toBe(false);
    expect(createOk(input({ confirmRoot: true }))).toBe(false);
    expect(createOk({ columns: [column()] })).toBe(false);
  });

  it('a column: a slug id of up to 40, a label of 1 to 40, a description of 1 to 200', () => {
    const one = (fields: Record<string, unknown>) => createOk(input({ columns: [column(fields)] }));
    expect(one({ id: x(40) })).toBe(true);
    expect(one({ id: x(41) })).toBe(false);
    expect(one({ id: 'To do' })).toBe(false);
    expect(one({ label: x(40) })).toBe(true);
    expect(one({ label: x(41) })).toBe(false);
    expect(one({ label: ' ' })).toBe(false);
    expect(one({ description: x(200) })).toBe(true);
    expect(one({ description: x(201) })).toBe(false);
    expect(one({ description: '' })).toBe(false);
    expect(one({ badge: 'td' })).toBe(false);
    expect(createOk(input({ columns: [{ id: 'todo' }] }))).toBe(false);
  });

  it('a kind: a slug id of up to 40, a label of 1 to 40 if given', () => {
    const one = (fields: Record<string, unknown>) => createOk(input({ kinds: [kind(fields)] }));
    expect(one({ id: x(40) })).toBe(true);
    expect(one({ id: x(41) })).toBe(false);
    expect(one({ id: 'Task' })).toBe(false);
    expect(one({ label: x(40) })).toBe(true);
    expect(one({ label: x(41) })).toBe(false);
    expect(one({ label: ' ' })).toBe(false);
    expect(one({ description: 'A kind' })).toBe(false);
  });

  it('leaves reserved and repeated ids to the plan, as Context Manager did', () => {
    expect(createOk(input({ columns: [column({ id: 'unassigned' })] }))).toBe(true);
    expect(createOk(input({ kinds: [kind(), kind()] }))).toBe(true);
  });
});
