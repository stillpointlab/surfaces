import { describe, expect, it } from 'vitest';

import {
  addTasksTag,
  cardsCarryingColumn,
  closeTasksStagePhase,
  createTasksStagePhase,
  editTasksManifest,
  setTasksCurrent,
} from './manifestOps.js';
import { resolveTasks } from './projection.js';

import type { TasksSnapshot } from './projection.js';
import type { SharedTaskManifestEditOp } from './types.js';

// The manifest ops (phase 7, tasks-rules step 3): the rules Context Manager's
// board service tests covered — board settings and their guards, the tag
// registry, the pointer, closing a phase or stage — over plain snapshots.

const MANIFEST = 'docs/tasks/tasks.yaml';
const MANIFEST_TEXT = [
  '# The board shape — hand comments must survive app edits.',
  'version: 1',
  'columns:',
  '  - id: todo',
  '    label: Todo',
  '  - id: doing',
  '    label: Doing',
  '  - id: done',
  '    label: Done',
  'defaultColumn: todo',
  'kinds:',
  '  - id: brief',
  '  - id: spec',
  '    badge: sp # distinct from spike',
  '  - id: note',
  '    dir: memos',
  'tags: [infra]',
  'current:',
  '  stage: 1',
  '  phase: 1',
  '',
].join('\n');
const PHASE1 = 'docs/tasks/stage1/phase1';
const PHASE3 = 'docs/tasks/stage1/phase3';
const TASK_A = `${PHASE1}/specs/task_a.md`;
const TASK_B = `${PHASE1}/specs/task_b.md`;
const IDEA = `${PHASE1}/briefs/idea.md`;
const POOLED = 'docs/tasks/unassigned/briefs/pooled.md';

const card = (column: string | null, body = '# Body\n'): string =>
  `---\n${column === null ? '' : `column: ${column}\n`}---\n\n${body}`;

function snapshot(
  files: Record<string, string | null> = {},
  more: Partial<TasksSnapshot> = {}
): TasksSnapshot {
  const all: Record<string, string | null> = {
    [MANIFEST]: MANIFEST_TEXT,
    [TASK_A]: card('doing', 'See [B](task_b.md).\n'),
    [TASK_B]: card('done'),
    [IDEA]: 'No frontmatter.\n',
    [`${PHASE3}/briefs/later.md`]: card('todo'),
    [POOLED]: card(null),
    ...files,
  };
  const paths = Object.keys(all).filter((path) => all[path] !== undefined);
  return { manifestPath: MANIFEST, paths, files: all, ...more };
}

const refusal = (result: { ok: boolean; code?: string }) => (result.ok ? 'ok' : result.code);
const manifestAfter = (result: { ok: boolean; changes?: { path: string; content?: string }[] }) =>
  result.ok ? result.changes!.find((change) => change.path === MANIFEST)?.content : undefined;
const edit = (s: TasksSnapshot, change: SharedTaskManifestEditOp) =>
  editTasksManifest(s, { edit: change });

describe('addTasksTag', () => {
  it('appends to the registry, the file’s style kept, and answers the registry after it', () => {
    const result = addTasksTag(snapshot(), { tag: ' UI ' });
    expect(result).toMatchObject({ ok: true, tags: ['infra', 'UI'] });
    expect(manifestAfter(result)).toContain('tags: [infra, UI]');
  });

  it('a tag already there, in any casing, changes nothing', () => {
    expect(addTasksTag(snapshot(), { tag: 'INFRA' })).toEqual({
      ok: true,
      changes: [],
      tags: ['infra'],
    });
  });

  it('refuses an empty tag, and a registry the rewriter cannot patch', () => {
    expect(refusal(addTasksTag(snapshot(), { tag: '  ' }))).toBe('TASKS_TAG_INVALID');
    // A flow list over two lines parses, but has no closing bracket to insert before.
    const flow = MANIFEST_TEXT.replace('tags: [infra]', 'tags: [infra,\n  ops]');
    expect(refusal(addTasksTag(snapshot({ [MANIFEST]: flow }), { tag: 'UI' }))).toBe(
      'TASKS_MANIFEST_UNPATCHABLE'
    );
  });
});

describe('editTasksManifest', () => {
  it('adds a column byte-preserving, and answers the manifest after it', () => {
    const result = edit(snapshot(), {
      op: 'add-column',
      id: 'review',
      label: 'In review',
      description: 'PR open.',
    });
    expect(result.ok && result.manifest.columns.map((column) => column.id)).toEqual([
      'todo',
      'doing',
      'done',
      'review',
    ]);
    const after = manifestAfter(result)!;
    expect(after).toContain('# The board shape — hand comments must survive app edits.');
    expect(after).toContain(
      '    label: Done\n  - id: review\n    label: In review\n    description: PR open.\ndefaultColumn: todo'
    );
  });

  it('patches display fields in place, keeping a line comment; an empty description clears it', () => {
    expect(
      manifestAfter(edit(snapshot(), { op: 'update-kind', id: 'spec', badge: 'x' }))
    ).toContain('    badge: x # distinct from spike');
    const described = MANIFEST_TEXT.replace(
      '    label: Doing',
      '    label: Doing\n    description: Old.'
    );
    expect(
      manifestAfter(
        edit(snapshot({ [MANIFEST]: described }), {
          op: 'update-column',
          id: 'doing',
          description: '',
        })
      )
    ).not.toContain('Old.');
  });

  it('sets the done column after the columns block when there is none', () => {
    const result = edit(snapshot(), { op: 'set-done-column', id: 'doing' });
    expect(result.ok && result.manifest.doneColumn).toBe('doing');
    expect(manifestAfter(result)).toContain(
      '    label: Done\ndoneColumn: doing\ndefaultColumn: todo'
    );
  });

  it('refuses removing a column a card carries, naming the boards, until it is moved', () => {
    const result = edit(snapshot(), { op: 'remove-column', id: 'doing' });
    expect(result).toMatchObject({
      ok: false,
      code: 'TASKS_COLUMN_NOT_EMPTY',
      message: `1 card still carries “doing” (${PHASE1}) — move them, then remove the column`,
    });
    const moved = edit(snapshot({ [TASK_A]: card('done') }), { op: 'remove-column', id: 'doing' });
    expect(moved.ok && moved.manifest.columns.map((column) => column.id)).toEqual(['todo', 'done']);
  });

  it('counts a card it cannot check as carrying; a held projection is checked', () => {
    const carrying = (s: TasksSnapshot, column: string) => {
      const resolved = resolveTasks(s);
      if (!resolved?.ok) throw new Error('no instance');
      return cardsCarryingColumn(s, resolved.tasks, column);
    };
    expect(carrying(snapshot({ [TASK_A]: null }), 'review')).toEqual({
      count: 1,
      boards: [PHASE1],
    });
    // Held parsed and not read: in the paths, not among the files.
    const { [TASK_A]: _unread, ...files } = snapshot().files;
    const held: TasksSnapshot = {
      ...snapshot(),
      files,
      projections: { [TASK_A]: { column: 'review', tags: null, meta: {} } },
    };
    expect(carrying(held, 'review')).toEqual({ count: 1, boards: [PHASE1] });
    expect(carrying(held, 'doing')).toEqual({ count: 0, boards: [] });
  });

  it('a card is where it moved to: its anchor carries nothing', () => {
    const moved = `${PHASE3}/specs/task_a.md`;
    const s = snapshot({ [moved]: card('done') }, { moves: { [moved]: [TASK_A] } });
    expect(refusal(edit(s, { op: 'remove-column', id: 'doing' }))).toBe('ok');
  });

  it('refuses removing an explicit default column, and the last column or kind', () => {
    expect(refusal(edit(snapshot(), { op: 'remove-column', id: 'todo' }))).toBe(
      'TASKS_COLUMN_REFERENCED'
    );
    const one = 'version: 1\ncolumns:\n  - id: only\n    label: Only\nkinds:\n  - id: brief\n';
    expect(refusal(edit(snapshot({ [MANIFEST]: one }), { op: 'remove-column', id: 'only' }))).toBe(
      'TASKS_LAST_COLUMN'
    );
    expect(refusal(edit(snapshot({ [MANIFEST]: one }), { op: 'remove-kind', id: 'brief' }))).toBe(
      'TASKS_LAST_KIND'
    );
  });

  it('refuses removing a kind with files under its folder; an empty kind removes', () => {
    expect(edit(snapshot(), { op: 'remove-kind', id: 'spec' })).toMatchObject({
      ok: false,
      code: 'TASKS_KIND_NOT_EMPTY',
      message: `2 files still under ${PHASE1}/specs/ — move them out, then remove the kind`,
    });
    const removed = edit(snapshot(), { op: 'remove-kind', id: 'note' });
    expect(removed.ok && removed.manifest.kinds.map((kind) => kind.id)).toEqual(['brief', 'spec']);
  });

  it('refuses a duplicate id, a colliding folder, and an id it does not know', () => {
    expect(refusal(edit(snapshot(), { op: 'add-column', id: 'todo', label: 'T' }))).toBe(
      'TASKS_COLUMN_ID_EXISTS'
    );
    expect(refusal(edit(snapshot(), { op: 'add-kind', id: 'brief' }))).toBe('TASKS_KIND_ID_EXISTS');
    // 'note' pins dir: memos, which a new kind 'memo' would derive.
    expect(refusal(edit(snapshot(), { op: 'add-kind', id: 'memo' }))).toBe('TASKS_KIND_DIR_EXISTS');
    expect(refusal(edit(snapshot(), { op: 'update-column', id: 'nope', label: 'X' }))).toBe(
      'TASKS_COLUMN_NOT_FOUND'
    );
    expect(refusal(edit(snapshot(), { op: 'remove-kind', id: 'nope' }))).toBe(
      'TASKS_KIND_NOT_FOUND'
    );
  });

  it('refuses a manifest that does not parse, and a shape it cannot patch', () => {
    expect(
      refusal(
        edit(snapshot({ [MANIFEST]: 'not: [valid' }), { op: 'add-column', id: 'x', label: 'X' })
      )
    ).toBe('TASKS_MANIFEST_INVALID');
    const flow = 'version: 1\ncolumns: [{ id: a, label: A }]\nkinds:\n  - id: brief\n';
    expect(
      refusal(edit(snapshot({ [MANIFEST]: flow }), { op: 'add-column', id: 'b', label: 'B' }))
    ).toBe('TASKS_MANIFEST_UNPATCHABLE');
  });

  it('answers the warnings the manifest after it reads with', () => {
    const s = snapshot({ [MANIFEST]: `${MANIFEST_TEXT}extra: 1\n` });
    const result = edit(s, { op: 'add-kind', id: 'draft' });
    expect(result.ok && result.warnings).toEqual(["unknown key 'extra' is ignored"]);
  });

  it('does not warn about markdown no kind projects', () => {
    const s = snapshot({ [`${PHASE1}/drafts/stray.md`]: '# Stray\n' });
    expect(edit(s, { op: 'add-column', id: 'review', label: 'Review' })).toMatchObject({
      ok: true,
      warnings: [],
    });
  });
});

describe('createTasksStagePhase', () => {
  it('a new phase follows the stage’s last; a new stage follows the last stage', () => {
    const phase = createTasksStagePhase(snapshot(), { kind: 'phase', stage: 1 });
    expect(phase).toMatchObject({ ok: true, stage: 1, phase: 4, path: 'docs/tasks/stage1/phase4' });
    expect(manifestAfter(phase)).toContain('current:\n  stage: 1\n  phase: 4');
    expect(createTasksStagePhase(snapshot(), { kind: 'stage' })).toMatchObject({
      ok: true,
      stage: 2,
      phase: 1,
      path: 'docs/tasks/stage2/phase1',
    });
  });

  it('refuses a stage the nav does not show', () => {
    expect(refusal(createTasksStagePhase(snapshot(), { kind: 'phase', stage: 7 }))).toBe(
      'TASKS_STAGE_NOT_FOUND'
    );
  });
});

describe('setTasksCurrent', () => {
  it('points at a phase the nav shows', () => {
    expect(manifestAfter(setTasksCurrent(snapshot(), { stage: 1, phase: 3 }))).toContain(
      'current:\n  stage: 1\n  phase: 3'
    );
  });

  it('refuses a phase the nav does not show (phase 2 has no folders, and no pointer on it)', () => {
    expect(refusal(setTasksCurrent(snapshot(), { stage: 1, phase: 2 }))).toBe(
      'TASKS_BOARD_NOT_FOUND'
    );
  });
});

describe('closeTasksStagePhase', () => {
  it('moves on to the next phase after the pointer’s, the selection keeping its columns', () => {
    const result = closeTasksStagePhase(snapshot(), { kind: 'phase', paths: [TASK_A] });
    expect(result).toMatchObject({
      ok: true,
      target: { stage: 1, phase: 3, path: PHASE3 },
      moved: 1,
      created: false,
    });
    if (!result.ok) return;
    expect(result.changes.map((change) => change.kind)).toEqual(['move', 'write']);
    expect(result.changes[0]).toMatchObject({
      kind: 'move',
      from: TASK_A,
      path: `${PHASE3}/specs/task_a.md`,
    });
    expect(result.changes[0].content).toContain('column: doing');
    expect(result.changes[1].content).toContain('current:\n  stage: 1\n  phase: 3');
  });

  it('a phase with nothing after it is made by the pointer alone; a stage goes to phase 1', () => {
    const last = MANIFEST_TEXT.replace('  phase: 1\n', '  phase: 3\n');
    expect(
      closeTasksStagePhase(snapshot({ [MANIFEST]: last }), { kind: 'phase', paths: [] })
    ).toMatchObject({
      ok: true,
      target: { stage: 1, phase: 4, path: 'docs/tasks/stage1/phase4' },
      moved: 0,
      created: true,
    });
    expect(closeTasksStagePhase(snapshot(), { kind: 'stage', paths: [] })).toMatchObject({
      target: { stage: 2, phase: 1 },
      created: true,
    });
  });

  it('links between cards moving together stay as they are', () => {
    const result = closeTasksStagePhase(snapshot({ [TASK_B]: card('doing') }), {
      kind: 'phase',
      paths: [TASK_A, TASK_B],
    });
    expect(result.ok && result.changes[0].content).toContain('See [B](task_b.md).');
  });

  it('skips a card already under the target, so a close can run again', () => {
    const swept = `${PHASE3}/specs/task_a.md`;
    const s = snapshot({ [swept]: card('doing') }, { moves: { [swept]: [TASK_A] } });
    expect(closeTasksStagePhase(s, { kind: 'phase', paths: [swept] })).toMatchObject({
      ok: true,
      moved: 0,
    });
  });

  it('checks the whole selection before any change', () => {
    const close = (paths: string[], s = snapshot()) =>
      refusal(closeTasksStagePhase(s, { kind: 'phase', paths }));
    expect(close([TASK_A, TASK_B])).toBe('TASKS_CLOSE_INVALID_SELECTION'); // done
    expect(close([TASK_A, POOLED])).toBe('TASKS_CLOSE_INVALID_SELECTION'); // the pool
    expect(close([TASK_A, IDEA], snapshot({ [IDEA]: card('nope') }))).toBe(
      'TASKS_CLOSE_NEEDS_ATTENTION'
    );
    expect(close([TASK_A, `${PHASE1}/specs/gone.md`])).toBe('TASKS_CARD_NOT_FOUND');
    expect(close([TASK_A], snapshot({ [TASK_A]: null }))).toBe('TASKS_CARD_CONTENT_UNAVAILABLE');
    const unpointed = MANIFEST_TEXT.replace('current:\n  stage: 1\n  phase: 1\n', '');
    expect(close([], snapshot({ [MANIFEST]: unpointed }))).toBe('TASKS_NO_CURRENT_POINTER');
  });

  it('a card from another phase is not the closing phase’s', () => {
    expect(
      refusal(
        closeTasksStagePhase(snapshot(), {
          kind: 'stage',
          paths: [`${PHASE3}/briefs/later.md`],
        })
      )
    ).toBe('TASKS_CLOSE_INVALID_SELECTION');
  });
});
