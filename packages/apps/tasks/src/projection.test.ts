import { describe, expect, it } from 'vitest';

import {
  columnOfContent,
  projectTasksBoard,
  projectTasksNav,
  projectTasksPool,
  projectCardEntry,
  projectResolvedCard,
  projectTasksStage,
  resolveTasks,
} from './projection.js';

import type { TasksSnapshot } from './projection.js';

// The tasks core's projections (phase 7, tasks-rules step 1): the rules
// Context Manager's board service tests covered — placement, needs-attention,
// tracked and linked cards, the pool's order, stages, synthesized boards,
// moved-away paths — over plain snapshots, with the host's facts laid on.

const MANIFEST = 'docs/tasks/tasks.yaml';
const MANIFEST_TEXT = `version: 1
columns:
  - id: briefed
    label: Briefed
  - id: in-progress
    label: In progress
  - id: done
    label: Done
current:
  stage: 1
  phase: 1
tags: [infra, ui]
templates:
  brief: docs/tasks/templates/brief.md
  spec: docs/tasks/templates/spec.md
`;

const PHASE = 'docs/tasks/stage1/phase1';
const IDEA = `${PHASE}/briefs/idea.md`;
const TASK = `${PHASE}/specs/task.md`;
const POOL_A = 'docs/tasks/unassigned/briefs/a.md';
const POOL_B = 'docs/tasks/unassigned/briefs/b.md';
const ORDER = 'docs/tasks/unassigned/order.yaml';

const card = (column: string | null, extra = ''): string =>
  `---\n${column === null ? '' : `column: ${column}\n`}${extra}---\n\n# Body\n`;

function snapshot(
  files: Record<string, string | null>,
  more: Partial<TasksSnapshot> = {}
): TasksSnapshot {
  const all = { [MANIFEST]: MANIFEST_TEXT, ...files };
  return { manifestPath: MANIFEST, paths: Object.keys(all), files: all, ...more };
}

describe('resolveTasks', () => {
  it('is null for a manifest not among the paths (a dangling instance)', () => {
    expect(resolveTasks({ manifestPath: MANIFEST, paths: [], files: {} })).toBeNull();
  });

  it('refuses a manifest that does not parse, with the message hosts show', () => {
    const resolved = resolveTasks(snapshot({ [MANIFEST]: 'columns: 7\n' }));
    expect(resolved).toMatchObject({ ok: false, code: 'TASKS_MANIFEST_INVALID' });
    expect(resolved?.ok === false && resolved.message).toMatch(/^Invalid tasks\.yaml: /);
  });

  it('refuses a manifest it could not read', () => {
    expect(resolveTasks(snapshot({ [MANIFEST]: null }))).toMatchObject({
      ok: false,
      code: 'TASKS_MANIFEST_INVALID',
    });
  });

  it('warns about markdown no kind projects, after the parse warnings', () => {
    const resolved = resolveTasks(
      snapshot({
        [MANIFEST]: `${MANIFEST_TEXT}extra: 1\n`,
        [`${PHASE}/notes/n.md`]: '# n\n',
      })
    );
    expect(resolved?.ok && resolved.tasks.manifestWarnings).toEqual([
      "unknown key 'extra' is ignored",
      `'${PHASE}/notes/' is not a declared kind folder (1 markdown file not shown)`,
    ]);
  });
});

describe('projectTasksBoard', () => {
  it('is null for a missing or broken manifest, and for a path that is no board', () => {
    expect(projectTasksBoard({ manifestPath: MANIFEST, paths: [], files: {} }, PHASE)).toBeNull();
    expect(projectTasksBoard(snapshot({ [MANIFEST]: 'columns: 7\n' }), PHASE)).toBeNull();
    expect(projectTasksBoard(snapshot({}), 'docs/tasks/elsewhere')).toBeNull();
  });

  it('places cards by their frontmatter, sorted by path, with the manifest beside them', () => {
    const state = projectTasksBoard(
      snapshot({ [TASK]: card('in-progress'), [IDEA]: card('briefed', 'title: Idea\n') }),
      PHASE
    );
    expect(state).toMatchObject({
      board: { path: PHASE, label: 'Stage 1 — Phase 1', stage: 1, phase: 1 },
      columns: [{ id: 'briefed' }, { id: 'in-progress' }, { id: 'done' }],
      tags: ['infra', 'ui'],
      doneColumn: 'done',
      defaultColumn: 'briefed',
      housekeeping: [],
    });
    expect(state!.cards).toEqual([
      {
        title: 'idea.md',
        frontmatterTitle: 'Idea',
        path: IDEA,
        kind: 'brief',
        column: 'briefed',
        dirty: false,
        changed: false,
      },
      {
        title: 'task.md',
        path: TASK,
        kind: 'spec',
        column: 'in-progress',
        dirty: false,
        changed: false,
      },
    ]);
    expect(state!.manifestWarnings).toBeUndefined();
  });

  it('a card with no column key sits in the default column', () => {
    const state = projectTasksBoard(snapshot({ [IDEA]: card(null) }), PHASE);
    expect(state!.cards[0].column).toBe('briefed');
  });

  it('corrupt frontmatter is needs-attention with its parse error, and no title', () => {
    const state = projectTasksBoard(
      snapshot({ [IDEA]: '---\ncolumn: [unclosed\ntitle: T\n---\nbody\n' }),
      PHASE
    );
    expect(state!.cards[0]).toMatchObject({ column: null });
    expect(state!.cards[0].parseError).toMatch(/frontmatter/i);
    expect(state!.cards[0].frontmatterTitle).toBeUndefined();
  });

  it('an undeclared column is needs-attention with a warning', () => {
    const state = projectTasksBoard(snapshot({ [IDEA]: card('nope') }), PHASE);
    expect(state!.cards[0]).toMatchObject({
      column: null,
      warning: "'nope' is not a column declared in tasks.yaml",
    });
  });

  it('a card the host could not read is needs-attention: content unavailable', () => {
    const state = projectTasksBoard(snapshot({ [IDEA]: null }), PHASE);
    expect(state!.cards[0]).toMatchObject({ column: null, parseError: 'content unavailable' });
  });

  it('surfaces tags and the blocked/completed/pr keys', () => {
    const state = projectTasksBoard(
      snapshot({
        [IDEA]: card('briefed', 'tags: [infra]\nblocked: waiting\ncompleted: 2026-11-01\npr: 7\n'),
      }),
      PHASE
    );
    expect(state!.cards[0]).toMatchObject({
      tags: ['infra'],
      blocked: 'waiting',
      completed: '2026-11-01',
      pr: '7',
    });
  });

  it('renders a card the host holds parsed, with no content read', () => {
    const state = projectTasksBoard(
      snapshot(
        {},
        {
          paths: [MANIFEST, IDEA],
          projections: {
            [IDEA]: { column: 'done', title: 'Held', tags: ['ui'], meta: {} },
          },
        }
      ),
      PHASE
    );
    expect(state!.cards[0]).toMatchObject({
      path: IDEA,
      column: 'done',
      frontmatterTitle: 'Held',
      tags: ['ui'],
    });
  });

  it('a file the host read wins over a held projection', () => {
    const state = projectTasksBoard(
      snapshot(
        { [IDEA]: card('briefed') },
        { projections: { [IDEA]: { column: 'done', tags: null, meta: {} } } }
      ),
      PHASE
    );
    expect(state!.cards[0].column).toBe('briefed');
  });

  it('lays the host facts on: title, tracked, changed, dirty, divergence, move, PR', () => {
    const state = projectTasksBoard(
      snapshot({ [IDEA]: card('in-progress', 'pr: 9\n'), [TASK]: card('done') }),
      PHASE,
      {
        cards: {
          [IDEA]: {
            title: 'The idea',
            changed: true,
            dirty: true,
            versionColumn: 'briefed',
            diverged: 'metadata',
            movedFrom: `${PHASE}/briefs/old.md`,
            checkinPrUrl: 'https://example.test/pull/1',
            prState: 'merged',
          },
          [TASK]: { tracked: true, prState: 'open' },
        },
      }
    );
    expect(state!.cards[0]).toMatchObject({
      title: 'The idea',
      changed: true,
      dirty: true,
      versionColumn: 'briefed',
      diverged: 'metadata',
      movedFrom: `${PHASE}/briefs/old.md`,
      checkinPrUrl: 'https://example.test/pull/1',
      pr: '9',
      prState: 'merged',
    });
    // A PR state only rides on a card that names a PR.
    expect(state!.cards[1]).toMatchObject({ tracked: true, title: 'task.md' });
    expect(state!.cards[1].prState).toBeUndefined();
  });

  it('a pending move shows the card at its new path and hides the old one', () => {
    const NEW = `${PHASE}/briefs/renamed.md`;
    const state = projectTasksBoard(
      snapshot({ [IDEA]: card('briefed'), [NEW]: card('briefed') }, { moves: { [NEW]: [IDEA] } }),
      PHASE
    );
    expect(state!.cards.map((c) => c.path)).toEqual([NEW]);
  });

  it('a hop is not hidden: a card created at it since shows', () => {
    const HOP = `${PHASE}/briefs/hop.md`;
    const NEW = `${PHASE}/briefs/renamed.md`;
    const state = projectTasksBoard(
      snapshot(
        { [IDEA]: card('briefed'), [HOP]: card('briefed'), [NEW]: card('briefed') },
        { moves: { [NEW]: [IDEA, HOP] } }
      ),
      PHASE
    );
    expect(state!.cards.map((c) => c.path)).toEqual([HOP, NEW]);
  });

  it('a shape-valid phase with no folders is an empty board', () => {
    const state = projectTasksBoard(snapshot({}), 'docs/tasks/stage4/phase2');
    expect(state).toMatchObject({
      board: { path: 'docs/tasks/stage4/phase2', stage: 4, phase: 2 },
      cards: [],
    });
  });

  it('lays the housekeeping facts on, as given', () => {
    const state = projectTasksBoard(snapshot({}), PHASE, {
      housekeeping: [{ path: MANIFEST, kind: 'manifest' }],
    });
    expect(state!.housekeeping).toEqual([{ path: MANIFEST, kind: 'manifest' }]);
  });
});

describe('the pool', () => {
  const resolved = (s: TasksSnapshot) => {
    const result = resolveTasks(s);
    if (!result?.ok) throw new Error('no tasks');
    return result.tasks;
  };

  it('orders pool cards by the order file; columns there are ignored with a warning', () => {
    const s = snapshot({
      [POOL_A]: card(null),
      [POOL_B]: card('briefed'),
      [ORDER]: `- ${POOL_B}\n- ${POOL_A}\n`,
    });
    const pool = projectTasksPool(s, resolved(s));
    expect(pool).toMatchObject({ path: 'docs/tasks/unassigned', orderPath: ORDER });
    expect(pool.cards.map((c) => [c.path, c.column, c.warning])).toEqual([
      [POOL_B, null, "pooled cards carry no 'column:' key (ignored)"],
      [POOL_A, null, undefined],
    ]);
    expect(pool.order).toBeUndefined();
    expect(pool.orderWarning).toBeUndefined();
  });

  it('cards missing from the order file, or with no order file, sort last by path', () => {
    const listed = snapshot({
      [POOL_B]: card(null),
      [POOL_A]: card(null),
      [ORDER]: `- ${POOL_B}\n`,
    });
    expect(projectTasksPool(listed, resolved(listed)).cards.map((c) => c.path)).toEqual([
      POOL_B,
      POOL_A,
    ]);
    const unlisted = snapshot({ [POOL_B]: card(null), [POOL_A]: card(null) });
    expect(projectTasksPool(unlisted, resolved(unlisted)).cards.map((c) => c.path)).toEqual([
      POOL_A,
      POOL_B,
    ]);
  });

  it('an unparseable order file warns and falls back to path order', () => {
    const s = snapshot({ [POOL_B]: card(null), [POOL_A]: card(null), [ORDER]: 'a: [\n' });
    const pool = projectTasksPool(s, resolved(s));
    expect(pool.cards.map((c) => c.path)).toEqual([POOL_A, POOL_B]);
    expect(pool.orderWarning).toBe(
      'order.yaml could not be parsed — cards are shown in path order'
    );
  });

  it('carries the order file fact', () => {
    const s = snapshot({});
    expect(projectTasksPool(s, resolved(s), { order: { changed: true } }).order).toEqual({
      changed: true,
    });
  });

  it('rides on the board state, the same on every board', () => {
    const s = snapshot({ [POOL_A]: card(null) });
    expect(projectTasksBoard(s, PHASE)!.pool.cards.map((c) => c.path)).toEqual([POOL_A]);
    expect(projectTasksBoard(s, 'docs/tasks/stage1/phase2')!.pool.cards.map((c) => c.path)).toEqual(
      [POOL_A]
    );
  });
});

describe('projectTasksStage', () => {
  it('answers the stage’s phases as rows, numerically, with the pool', () => {
    const P10 = 'docs/tasks/stage1/phase10/briefs/x.md';
    const P2 = 'docs/tasks/stage1/phase2/briefs/y.md';
    const state = projectTasksStage(
      snapshot({ [IDEA]: card('briefed'), [P10]: card('done'), [P2]: card(null) }),
      1
    );
    expect(state!.phases.map((p) => [p.phase, p.cards.map((c) => c.path)])).toEqual([
      [1, [IDEA]],
      [2, [P2]],
      [10, [P10]],
    ]);
    expect(state).toMatchObject({ stage: 1, tags: ['infra', 'ui'], housekeeping: [] });
    expect(state!.pool.path).toBe('docs/tasks/unassigned');
  });

  it('is null for a stage with no phases', () => {
    expect(projectTasksStage(snapshot({ [IDEA]: card('briefed') }), 7)).toBeNull();
  });
});

describe('projectTasksNav', () => {
  it('answers the nav with the pointer and the done column', () => {
    const nav = projectTasksNav(
      snapshot({ [IDEA]: card('briefed'), 'docs/tasks/research/briefs/r.md': card(null) })
    );
    expect(nav).toEqual({
      nav: {
        stages: [
          {
            stage: 1,
            phases: [{ phase: 1, path: PHASE, label: 'Stage 1 — Phase 1' }],
          },
        ],
        other: [{ path: 'docs/tasks/research', label: 'research' }],
      },
      currentPointer: { stage: 1, phase: 1 },
      currentPointerPath: PHASE,
      doneColumn: 'done',
    });
  });

  it('synthesizes the pointer’s phase when no folder backs it', () => {
    const nav = projectTasksNav(
      snapshot({ [MANIFEST]: MANIFEST_TEXT.replace('phase: 1', 'phase: 3'), [IDEA]: card(null) })
    );
    expect(nav!.nav.stages[0].phases.map((p) => p.phase)).toEqual([1, 3]);
    expect(nav!.currentPointerPath).toBe('docs/tasks/stage1/phase3');
  });

  it('a bare manifest has an empty stage 1 phase 1', () => {
    const bare =
      'version: 1\ncolumns:\n  - id: todo\n    label: To do\ntemplates:\n  brief: b.md\n  spec: s.md\n';
    const nav = projectTasksNav(snapshot({ [MANIFEST]: bare }));
    expect(nav).toMatchObject({
      nav: { stages: [{ stage: 1, phases: [{ phase: 1, path: PHASE }] }], other: [] },
      currentPointer: null,
      currentPointerPath: null,
      doneColumn: 'todo',
    });
  });

  it('is null for a missing or broken manifest', () => {
    expect(projectTasksNav({ manifestPath: MANIFEST, paths: [], files: {} })).toBeNull();
    expect(projectTasksNav(snapshot({ [MANIFEST]: 'columns: 7\n' }))).toBeNull();
  });
});

describe('columnOfContent', () => {
  const manifest = (() => {
    const resolved = resolveTasks(snapshot({}));
    if (!resolved?.ok) throw new Error('no tasks');
    return resolved.tasks.manifest;
  })();

  it('answers the column a card’s content renders in', () => {
    expect(columnOfContent(card('done'), manifest)).toBe('done');
    expect(columnOfContent(card(null), manifest)).toBe('briefed');
    expect(columnOfContent(card('nope'), manifest)).toBeNull();
    expect(columnOfContent(card('done'), manifest, 'pool')).toBeNull();
  });
});

describe('projectResolvedCard', () => {
  const NEW = `${PHASE}/briefs/renamed.md`;
  const s = snapshot(
    { [IDEA]: card('briefed'), [NEW]: card('done'), [POOL_A]: card('briefed') },
    { moves: { [NEW]: [IDEA] } }
  );
  const tasks = (() => {
    const resolved = resolveTasks(s);
    if (!resolved?.ok) throw new Error('no tasks');
    return resolved.tasks;
  })();

  it('projects one card where it sits, with its facts', () => {
    expect(
      projectResolvedCard(s, tasks, NEW, { cards: { [NEW]: { changed: true } } })
    ).toMatchObject({ path: NEW, kind: 'brief', column: 'done', changed: true });
    expect(projectResolvedCard(s, tasks, POOL_A)).toMatchObject({ path: POOL_A, column: null });
  });

  it('is null for a moved-away path and for a path that is no card', () => {
    expect(projectResolvedCard(s, tasks, IDEA)).toBeNull();
    expect(projectResolvedCard(s, tasks, MANIFEST)).toBeNull();
  });
});

describe('projectCardEntry', () => {
  it('projects a card from its entry where the host says it sits', () => {
    const files = { [POOL_A]: card('done') };
    const manifest = (() => {
      const resolved = resolveTasks(snapshot({}));
      if (!resolved?.ok) throw new Error('no tasks');
      return resolved.tasks.manifest;
    })();
    const entry = { path: POOL_A, kind: 'brief' };
    expect(projectCardEntry({ files }, entry, manifest, 'board')).toMatchObject({ column: 'done' });
    expect(projectCardEntry({ files }, entry, manifest, 'pool', { title: 'A' })).toMatchObject({
      column: null,
      title: 'A',
    });
  });
});
