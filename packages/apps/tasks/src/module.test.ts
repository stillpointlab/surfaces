import { describe, expect, it } from 'vitest';

import { tasksModule } from './module.js';

import type { TasksElementOps } from './module.js';
import type { TasksSnapshot } from './projection.js';
import type { AppOp, FileChange } from '@stillpointlab/common-format/app';

// Every element op of the board and the strip, so a new one fails to compile
// until the module places it.
const ELEMENT_OPS = {
  move: true,
  'move-file': true,
  'reorder-pool': true,
  resolve: true,
  'scan-references': true,
  'fix-references': true,
  'read-file': true,
  'refresh-stage': true,
  'edit-manifest': true,
  'create-card': true,
  'set-title': true,
  'set-tags': true,
  'add-tag': true,
  'create-stage-phase': true,
  'set-current': true,
  'close-candidates': true,
  close: true,
} satisfies Record<keyof TasksElementOps, true>;

const MANIFEST = 'docs/tasks/tasks.yaml';
const PHASE = 'docs/tasks/stage1/phase1';
const CARD = `${PHASE}/specs/task_a.md`;

function snapshot(): TasksSnapshot {
  const files: Record<string, string> = {
    [MANIFEST]: [
      'version: 1',
      'columns:',
      '  - id: todo',
      '    label: Todo',
      '  - id: done',
      '    label: Done',
      'kinds:',
      '  - id: spec',
      '  - id: seed',
      'tags: [code]',
      'current:',
      '  stage: 1',
      '  phase: 1',
      '',
    ].join('\n'),
    [CARD]: '---\ncolumn: todo\n---\n\n# A\n',
    'docs/tasks/unassigned/seeds/one.md': '# One\n',
    'docs/tasks/unassigned/seeds/two.md': '# Two\n',
  };
  return { manifestPath: MANIFEST, paths: Object.keys(files), files };
}

function written(before: TasksSnapshot, changes: readonly FileChange[]): TasksSnapshot {
  const files = { ...before.files } as Record<string, string | null>;
  let paths = [...before.paths];
  for (const change of changes) {
    if (change.kind === 'move') {
      delete files[change.from];
      paths = paths.filter((path) => path !== change.from);
    }
    files[change.path] = change.content;
    if (!paths.includes(change.path)) paths.push(change.path);
  }
  return { ...before, paths, files };
}

/** An element op applied as a host does, and the module's reply to it. */
function run(op: AppOp<TasksElementOps>, view = { type: 'board' as const, path: PHASE }) {
  const before = snapshot();
  const applied = tasksModule.core.apply(
    before,
    tasksModule.toCoreOp(op, { now: '2026-11-10T00:00:00.000Z' })
  );
  if (!applied.ok) return applied;
  return tasksModule.reply(op, applied, {
    snapshot: written(before, applied.changes),
    facts: {},
    view,
  });
}

describe('tasksModule', () => {
  it('names every element op once, as the core’s or the host’s', () => {
    const named = [...tasksModule.coreOps, ...tasksModule.hostOps];
    expect([...named].sort()).toEqual(Object.keys(ELEMENT_OPS).sort());
    expect(new Set(named).size).toBe(named.length);
  });

  it('answers a move with the card where it landed', () => {
    const reply = run({ type: 'move', path: CARD, column: 'done' });
    expect(reply).toMatchObject({ ok: true, card: { path: CARD, column: 'done' } });
  });

  it('stamps a new card with the host’s time and answers it', () => {
    const reply = run({ type: 'create-card', boardPath: PHASE, title: 'New thing', kind: 'spec' });
    expect(reply).toMatchObject({ ok: true, card: { path: `${PHASE}/specs/new_thing.md` } });
  });

  it('answers a reorder with the pool of the view on screen', () => {
    const order = ['docs/tasks/unassigned/seeds/two.md', 'docs/tasks/unassigned/seeds/one.md'];
    const reply = run({ type: 'reorder-pool', paths: order });
    expect(reply.ok).toBe(true);
    const pool = (reply as unknown as { pool: { cards: { path: string }[] } }).pool;
    expect(pool.cards.map((card) => card.path)).toEqual(order);
  });

  it('answers a new phase with its stage and phase only', () => {
    expect(run({ type: 'create-stage-phase', kind: 'phase', stage: 1 })).toEqual({
      ok: true,
      stage: 1,
      phase: 2,
    });
  });

  it('answers the rest with the core’s own result, without its changes', () => {
    expect(run({ type: 'add-tag', tag: 'docs' })).toEqual({ ok: true, tags: ['code', 'docs'] });
    expect(run({ type: 'set-current', stage: 1, phase: 1 })).toEqual({ ok: true });
  });

  // The statuses Context Manager's tasks endpoints send, pinned so the
  // generic route sends the same ones.
  it.each([
    ['TASKS_CARD_NOT_FOUND', 'move', 'not-found'],
    ['TASKS_STAGE_NOT_FOUND', 'create-stage-phase', 'not-found'],
    ['TASKS_MOVE_TARGET_EXISTS', 'move-file', 'conflict'],
    ['TASKS_CLOSE_NEEDS_ATTENTION', 'close', 'conflict'],
    ['TASKS_MANIFEST_UNPATCHABLE', 'edit-manifest', 'conflict'],
    ['TASKS_ID_IMMUTABLE', 'edit-manifest', 'conflict'],
    ['TASKS_MANIFEST_UNPATCHABLE', 'add-tag', 'invalid'],
    ['TASKS_TAG_EMPTY', 'add-tag', 'invalid'],
    ['TASKS_TAG_INVALID', 'set-tags', 'invalid'],
    ['SOMETHING_NEW', 'move', 'invalid'],
  ])('treats %s on %s as %s', (code, op, refusal) => {
    expect(tasksModule.refusalClass(code, op)).toBe(refusal);
  });
});
