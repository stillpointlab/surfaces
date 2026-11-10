import { describe, expect, it } from 'vitest';

import {
  cardSlug,
  createTaskCard,
  fixTaskReferences,
  moveTaskCard,
  moveTaskCardFile,
  referencesTo,
  reorderTaskPool,
  setTaskCardTags,
  setTaskCardTitle,
} from './cardOps.js';
import { placeTasksCreate, planTasksCreate } from './create.js';

import type { TasksSnapshot } from './projection.js';

// The card ops (phase 7, tasks-rules step 2): the rules Context Manager's board
// service tests covered — guards, refusals and their codes, link rewriting,
// the pool prune, slugs and collisions — over plain snapshots.

const MANIFEST = 'docs/tasks/tasks.yaml';
const MANIFEST_TEXT = `version: 1
columns:
  - id: briefed
    label: Briefed
  - id: done
    label: Done
kinds:
  - id: brief
    template: docs/tasks/templates/brief.md
  - id: spec
    creatable: false
  - id: spike
tags: [infra, UI]
`;
const TEMPLATE = 'docs/tasks/templates/brief.md';
const PHASE = 'docs/tasks/stage1/phase1';
const IDEA = `${PHASE}/briefs/idea.md`;
const SPEC = `${PHASE}/specs/spec.md`;
const POOLED = 'docs/tasks/unassigned/briefs/pooled.md';
const ORDER = 'docs/tasks/unassigned/order.yaml';

const card = (column: string | null, body = '# Body\n'): string =>
  `---\n${column === null ? '' : `column: ${column}\n`}---\n\n${body}`;

function snapshot(
  files: Record<string, string | null> = {},
  more: Partial<TasksSnapshot> = {}
): TasksSnapshot {
  const all: Record<string, string | null> = {
    [MANIFEST]: MANIFEST_TEXT,
    [TEMPLATE]: '---\ncolumn: briefed\ncreated: <datetime>\n---\n\n# Brief\n',
    [IDEA]: card('briefed'),
    [SPEC]: card('done'),
    [POOLED]: card(null),
    [ORDER]: `- ${POOLED}\n`,
    ...files,
  };
  return { manifestPath: MANIFEST, paths: Object.keys(all), files: all, ...more };
}

const refusal = (result: { ok: boolean; code?: string }) => (result.ok ? 'ok' : result.code);

describe('moveTaskCard', () => {
  it('rewrites the column key alone', () => {
    expect(moveTaskCard(snapshot(), { path: IDEA, column: 'done' })).toEqual({
      ok: true,
      changes: [{ kind: 'write', path: IDEA, content: card('done') }],
    });
  });

  it('a null column removes the key', () => {
    const result = moveTaskCard(snapshot(), { path: IDEA, column: null });
    // The rewriter drops a block left empty.
    expect(result.ok && result.changes[0].content).toBe('\n# Body\n');
  });

  it('refuses an undeclared column, a pool card, and a path that is no card', () => {
    expect(refusal(moveTaskCard(snapshot(), { path: IDEA, column: 'nope' }))).toBe(
      'TASKS_UNKNOWN_COLUMN'
    );
    expect(refusal(moveTaskCard(snapshot(), { path: POOLED, column: 'done' }))).toBe(
      'TASKS_CARD_IN_POOL'
    );
    expect(refusal(moveTaskCard(snapshot(), { path: `${PHASE}/x.md`, column: 'done' }))).toBe(
      'TASKS_CARD_NOT_FOUND'
    );
  });

  it('a moved-away path is no card', () => {
    const moved = `${PHASE}/briefs/moved.md`;
    const s = snapshot({ [moved]: card('briefed') }, { moves: { [moved]: [IDEA] } });
    expect(refusal(moveTaskCard(s, { path: IDEA, column: 'done' }))).toBe('TASKS_CARD_NOT_FOUND');
  });

  it('refuses a card it could not read', () => {
    expect(refusal(moveTaskCard(snapshot({ [IDEA]: null }), { path: IDEA, column: 'done' }))).toBe(
      'TASKS_CARD_CONTENT_UNAVAILABLE'
    );
  });

  it('repairs a broken block by appending the key', () => {
    const broken = '---\ncolumn: [oops\n---\nbody\n';
    expect(moveTaskCard(snapshot({ [IDEA]: broken }), { path: IDEA, column: 'done' }).ok).toBe(
      true
    );
  });

  it('refuses for a missing manifest', () => {
    expect(
      refusal(
        moveTaskCard({ manifestPath: MANIFEST, paths: [], files: {} }, { path: IDEA, column: null })
      )
    ).toBe('TASKS_MANIFEST_NOT_FOUND');
  });
});

describe('moveTaskCardFile', () => {
  it('moves a board card to the pool: the column key goes, the path changes', () => {
    expect(moveTaskCardFile(snapshot(), { path: IDEA, target: { pool: true } })).toEqual({
      ok: true,
      changes: [
        {
          kind: 'move',
          from: IDEA,
          path: 'docs/tasks/unassigned/briefs/idea.md',
          content: '\n# Body\n',
        },
      ],
      path: 'docs/tasks/unassigned/briefs/idea.md',
      location: 'pool',
    });
  });

  it('moves a pool card to a board column, pruning it from the order file', () => {
    const result = moveTaskCardFile(snapshot(), {
      path: POOLED,
      target: { boardPath: PHASE, column: 'done' },
    });
    expect(result).toMatchObject({
      ok: true,
      path: `${PHASE}/briefs/pooled.md`,
      location: 'board',
    });
    expect(result.ok && result.changes).toEqual([
      { kind: 'move', from: POOLED, path: `${PHASE}/briefs/pooled.md`, content: card('done') },
      { kind: 'write', path: ORDER, content: expect.stringContaining('[]') },
    ]);
  });

  it('may target a phase with no folders yet', () => {
    const result = moveTaskCardFile(snapshot(), {
      path: IDEA,
      target: { boardPath: 'docs/tasks/stage1/phase9', column: 'done' },
    });
    expect(result.ok && result.path).toBe('docs/tasks/stage1/phase9/briefs/idea.md');
  });

  it('re-roots the moved file’s relative links, leaving co-moving ones alone', () => {
    const s = snapshot({ [IDEA]: card('briefed', 'See [spec](../specs/spec.md).\n') });
    const result = moveTaskCardFile(s, { path: IDEA, target: { pool: true } });
    expect(result.ok && result.changes[0].content).toContain(
      '[spec](../../stage1/phase1/specs/spec.md)'
    );
    const together = moveTaskCardFile(s, {
      path: IDEA,
      target: { pool: true },
      coMoving: { [SPEC]: 'docs/tasks/unassigned/specs/spec.md' },
    });
    expect(together.ok && together.changes[0].content).toContain('[spec](../specs/spec.md)');
  });

  it('refuses no-ops, unknown boards and columns, and an occupied destination', () => {
    const s = snapshot({ 'docs/tasks/unassigned/briefs/idea.md': card(null) });
    expect(refusal(moveTaskCardFile(s, { path: POOLED, target: { pool: true } }))).toBe(
      'TASKS_MOVE_NOOP'
    );
    expect(
      refusal(moveTaskCardFile(s, { path: IDEA, target: { boardPath: PHASE, column: 'done' } }))
    ).toBe('TASKS_MOVE_NOOP');
    expect(
      refusal(
        moveTaskCardFile(s, { path: IDEA, target: { boardPath: 'docs/elsewhere', column: 'done' } })
      )
    ).toBe('TASKS_BOARD_NOT_FOUND');
    expect(
      refusal(moveTaskCardFile(s, { path: POOLED, target: { boardPath: PHASE, column: 'nope' } }))
    ).toBe('TASKS_UNKNOWN_COLUMN');
    expect(refusal(moveTaskCardFile(s, { path: IDEA, target: { pool: true } }))).toBe(
      'TASKS_MOVE_TARGET_EXISTS'
    );
  });

  it('a destination only `taken` holds is occupied; one a pending move left is free', () => {
    const dest = 'docs/tasks/unassigned/briefs/idea.md';
    expect(
      refusal(
        moveTaskCardFile(snapshot({}, { taken: [dest] }), { path: IDEA, target: { pool: true } })
      )
    ).toBe('TASKS_MOVE_TARGET_EXISTS');
    // The pooled card moved away from `dest` earlier; its old path is free.
    const s = snapshot({ [dest]: card(null) }, { moves: { [POOLED]: [dest] } });
    expect(moveTaskCardFile(s, { path: IDEA, target: { pool: true } }).ok).toBe(true);
  });

  it('refuses moving a created card whose first check-in is in flight', () => {
    const s = snapshot({}, { created: [IDEA], inFlight: [IDEA] });
    expect(refusal(moveTaskCardFile(s, { path: IDEA, target: { pool: true } }))).toBe(
      'TASKS_CHECKIN_IN_FLIGHT'
    );
    // A card with an upstream file may move with its check-in in flight.
    expect(
      moveTaskCardFile(snapshot({}, { inFlight: [IDEA] }), { path: IDEA, target: { pool: true } })
        .ok
    ).toBe(true);
  });

  it('undoing a move is refused while its check-in is in flight, before any change', () => {
    const moved = 'docs/tasks/unassigned/briefs/idea.md';
    const files = { [moved]: card(null) };
    const back = { boardPath: PHASE, column: 'briefed' };
    const pending = snapshot(files, { moves: { [moved]: [IDEA] } });
    expect(moveTaskCardFile(pending, { path: moved, target: back }).ok).toBe(true);
    const inFlight = snapshot(files, { moves: { [moved]: [IDEA] }, inFlight: [moved] });
    expect(refusal(moveTaskCardFile(inFlight, { path: moved, target: back }))).toBe(
      'TASKS_CHECKIN_IN_FLIGHT'
    );
  });
});

describe('reorderTaskPool', () => {
  const second = 'docs/tasks/unassigned/spikes/second.md';

  it('writes the full order, or creates the order file when there is none', () => {
    const s = snapshot({ [second]: card(null) });
    const result = reorderTaskPool(s, { paths: [second, POOLED] });
    expect(result.ok && result.changes[0]).toMatchObject({ kind: 'write', path: ORDER });
    expect(result.ok && result.changes[0].content).toMatch(/- .*second\.md\n- .*pooled\.md\n$/);

    const none = snapshot({ [ORDER]: null }, {});
    const created = reorderTaskPool(
      { ...none, paths: none.paths.filter((path) => path !== ORDER) },
      { paths: [POOLED] }
    );
    expect(created.ok && created.changes[0].kind).toBe('create');
  });

  it('refuses a path that is no pool card, a moved-away one, and duplicates', () => {
    expect(refusal(reorderTaskPool(snapshot(), { paths: [IDEA] }))).toBe('TASKS_POOL_UNKNOWN_PATH');
    const moved = snapshot({ [second]: card(null) }, { moves: { [second]: [POOLED] } });
    expect(refusal(reorderTaskPool(moved, { paths: [POOLED] }))).toBe('TASKS_POOL_UNKNOWN_PATH');
    expect(refusal(reorderTaskPool(snapshot(), { paths: [POOLED, POOLED] }))).toBe(
      'TASKS_POOL_DUPLICATE_PATH'
    );
  });
});

describe('setTaskCardTitle and setTaskCardTags', () => {
  it('sets and removes the title', () => {
    const set = setTaskCardTitle(snapshot(), { path: IDEA, title: 'An idea' });
    expect(set.ok && set.changes[0].content).toBe(
      '---\ncolumn: briefed\ntitle: "An idea"\n---\n\n# Body\n'
    );
    const titled = snapshot({ [IDEA]: '---\ntitle: Old\n---\n' });
    const removed = setTaskCardTitle(titled, { path: IDEA, title: null });
    expect(removed.ok && removed.changes[0].content).toBe('');
  });

  it('writes tags as the registry declares them, once each', () => {
    const result = setTaskCardTags(snapshot(), { path: IDEA, tags: ['ui', ' Infra ', 'UI', ''] });
    expect(result.ok && result.changes[0].content).toContain('tags: [UI, infra]');
  });

  it('refuses a tag the registry does not declare, before looking at the card', () => {
    expect(refusal(setTaskCardTags(snapshot(), { path: 'nowhere.md', tags: ['nope'] }))).toBe(
      'TASKS_UNKNOWN_TAG'
    );
  });
});

describe('createTaskCard', () => {
  const now = '2026-11-09T12:00:00.000Z';

  it('creates from the kind’s template, the title and creation time seeded', () => {
    const result = createTaskCard(snapshot(), {
      boardPath: PHASE,
      title: 'Write the Walks!',
      kind: 'brief',
      now,
    });
    expect(result).toMatchObject({ ok: true, path: `${PHASE}/briefs/write_the_walks.md` });
    expect(result.ok && result.changes[0]).toMatchObject({ kind: 'create' });
    const content = result.ok ? result.changes[0].content : '';
    expect(content).toContain('title: "Write the Walks!"');
    expect(content).toContain(`created: "${now}"`);
    expect(content).toContain('column: briefed');
  });

  it('a stub-created board card gains the default column; a pool card loses its column', () => {
    const stub = createTaskCard(snapshot(), {
      boardPath: PHASE,
      title: 'Probe',
      kind: 'spike',
      now,
    });
    expect(stub.ok && stub.changes[0].content).toContain('column: briefed');
    const pooled = createTaskCard(snapshot(), {
      boardPath: 'docs/tasks/unassigned',
      title: 'Later',
      kind: 'brief',
      now,
    });
    expect(pooled.ok && pooled.changes[0].content).not.toContain('column:');
  });

  it('refuses a kind not created from the board, a path that is no board, and an empty slug', () => {
    expect(
      refusal(createTaskCard(snapshot(), { boardPath: PHASE, title: 'x', kind: 'spec', now }))
    ).toBe('TASKS_KIND_NOT_CREATABLE');
    expect(
      refusal(createTaskCard(snapshot(), { boardPath: PHASE, title: 'x', kind: 'nope', now }))
    ).toBe('TASKS_KIND_NOT_CREATABLE');
    expect(
      refusal(createTaskCard(snapshot(), { boardPath: 'docs/x', title: 'x', kind: 'brief', now }))
    ).toBe('TASKS_BOARD_NOT_FOUND');
    expect(
      refusal(createTaskCard(snapshot(), { boardPath: PHASE, title: '!!', kind: 'brief', now }))
    ).toBe('TASKS_BRIEF_NAME_INVALID');
  });

  it('refuses a name already taken, in the paths or beyond them', () => {
    expect(
      refusal(createTaskCard(snapshot(), { boardPath: PHASE, title: 'Idea', kind: 'brief', now }))
    ).toBe('TASKS_BRIEF_EXISTS');
    expect(
      refusal(
        createTaskCard(snapshot({}, { taken: [`${PHASE}/briefs/other.md`] }), {
          boardPath: PHASE,
          title: 'Other',
          kind: 'brief',
          now,
        })
      )
    ).toBe('TASKS_BRIEF_EXISTS');
  });

  it('refuses when the template could not be read', () => {
    expect(
      refusal(
        createTaskCard(snapshot({ [TEMPLATE]: null }), {
          boardPath: PHASE,
          title: 'x',
          kind: 'brief',
          now,
        })
      )
    ).toBe('TASKS_TEMPLATE_UNAVAILABLE');
  });

  it('slugs titles in snake_case', () => {
    expect(cardSlug('  Move the core: step 2 ')).toBe('move_the_core_step_2');
  });
});

describe('references to a moved card', () => {
  const moved = 'docs/tasks/unassigned/briefs/idea.md';
  const hop = 'docs/tasks/stage1/phase2/briefs/idea.md';
  const toAnchor = `${PHASE}/specs/a.md`;
  const toHop = `${PHASE}/specs/b.md`;
  const s = snapshot(
    {
      [moved]: card(null),
      [toAnchor]: card('done', 'See [idea](../briefs/idea.md).\n'),
      [toHop]: card('done', 'See [idea](../../phase2/briefs/idea.md).\n'),
      'docs/tasks/notes.txt': 'not markdown ../stage1/phase1/briefs/idea.md\n',
    },
    { moves: { [moved]: [IDEA, hop] } }
  );

  it('finds the files linking to its anchor or a hop', () => {
    expect(referencesTo(s, moved)).toEqual([toAnchor, toHop]);
    expect(referencesTo(s, SPEC)).toEqual([]);
  });

  it('points their links at its new path', () => {
    const result = fixTaskReferences(s, { path: moved, referencingPaths: [toAnchor, toHop] });
    expect(result).toMatchObject({ ok: true, fixed: 2 });
    expect(result.ok && result.changes.map((change) => change.content)).toEqual([
      card('done', 'See [idea](../../../unassigned/briefs/idea.md).\n'),
      card('done', 'See [idea](../../../unassigned/briefs/idea.md).\n'),
    ]);
  });

  it('refuses a card with no pending move', () => {
    expect(refusal(fixTaskReferences(s, { path: SPEC, referencingPaths: [toAnchor] }))).toBe(
      'TASKS_NO_PENDING_MOVE'
    );
  });
});

describe('creating tasks', () => {
  const input = {
    folder: 'docs/tasks',
    columns: [{ id: 'todo', label: 'Todo' }],
    kinds: [{ id: 'spec' }],
  };

  it('plans the manifest, refusing the root without consent', () => {
    const plan = planTasksCreate(input);
    expect(plan).toMatchObject({ ok: true, manifestPath: MANIFEST });
    expect(plan.ok && plan.files[0]).toMatchObject({ kind: 'create', path: MANIFEST });
    expect(refusal(planTasksCreate({ ...input, folder: '' }))).toBe('ROOT_CONFIRM_REQUIRED');
    expect(planTasksCreate({ ...input, folder: '', confirmRoot: true })).toMatchObject({
      ok: true,
      manifestPath: 'tasks.yaml',
    });
  });

  it('refuses a seed the app would not accept', () => {
    expect(refusal(planTasksCreate({ ...input, columns: [] }))).toBe('TASKS_MANIFEST_INVALID');
  });

  it('places the plan, refusing a file in the way and reusing an earlier attempt’s', () => {
    const plan = planTasksCreate(input);
    if (!plan.ok) throw new Error('no plan');
    expect(refusal(placeTasksCreate(plan, { taken: ['docs'] }))).toBe('TASKS_PATH_EXISTS');
    expect(refusal(placeTasksCreate(plan, { taken: [MANIFEST] }))).toBe('TASKS_PATH_EXISTS');
    expect(placeTasksCreate(plan, { taken: [MANIFEST], reusable: [MANIFEST] })).toEqual({
      ok: true,
      files: [],
    });
  });
});
