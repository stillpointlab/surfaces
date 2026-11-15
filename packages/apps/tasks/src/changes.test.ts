import { describe, expect, it } from 'vitest';

import { tasksFromChanges } from './changes.js';
import { projectTasksBoard } from './projection.js';

import type { TasksSnapshot } from './projection.js';

const MANIFEST = 'docs/tasks/tasks.yaml';
const PHASE = 'docs/tasks/stage1/phase1';
const CARD = `${PHASE}/specs/a.md`;
const SEED = 'docs/tasks/unassigned/seeds/idea.md';
const ORDER = 'docs/tasks/unassigned/order.yaml';

const FILES: Record<string, string> = {
  [MANIFEST]: [
    'version: 1',
    'columns:',
    '  - id: todo',
    '    label: Todo',
    '  - id: done',
    '    label: Done',
    'kinds:',
    '  - id: seed',
    '  - id: spec',
    '',
  ].join('\n'),
  [CARD]: '---\ncolumn: todo\n---\n\n# A\n',
  [`${PHASE}/specs/b.md`]: '---\ncolumn: done\n---\n\n# B\n',
  [SEED]: '---\ncolumn: todo\n---\n\n# Idea\n',
  [ORDER]: `- ${SEED}\n`,
  [`${PHASE}/specs/notes.txt`]: 'Not a card.\n',
  'README.md': 'Not the app’s.\n',
};

const snapshotOf = (files: Record<string, string> = FILES): TasksSnapshot => ({
  manifestPath: MANIFEST,
  paths: Object.keys(files),
  files,
});

describe('tasksFromChanges', () => {
  it('answers no news over no changes, and an order file with no change', () => {
    expect(tasksFromChanges([], snapshotOf())).toEqual({
      facts: { cards: {}, order: { changed: false }, housekeeping: [] },
      snapshot: { moves: {}, created: [] },
    });
  });

  it('marks a changed card changed, and nothing else about it', () => {
    const { facts, snapshot } = tasksFromChanges([{ path: CARD, status: 'changed' }], snapshotOf());
    expect(facts.cards).toEqual({ [CARD]: { changed: true } });
    expect(snapshot).toEqual({ moves: {}, created: [] });
  });

  it('marks a new card changed, and lists it as created', () => {
    const { facts, snapshot } = tasksFromChanges([{ path: SEED, status: 'new' }], snapshotOf());
    expect(facts.cards).toEqual({ [SEED]: { changed: true } });
    expect(snapshot?.created).toEqual([SEED]);
  });

  it('gives a moved card where it moved from, and records the move', () => {
    const from = 'docs/tasks/stage1/phase2/specs/a.md';
    const { facts, snapshot } = tasksFromChanges(
      [{ path: CARD, status: 'moved', from }],
      snapshotOf()
    );
    expect(facts.cards).toEqual({ [CARD]: { changed: true, movedFrom: from } });
    expect(snapshot).toEqual({ moves: { [CARD]: [from] }, created: [] });
  });

  it('marks a card dirty when its column differs from the text at the last check-in', () => {
    const base = '---\ncolumn: done\n---\n\n# A\n';
    const { facts } = tasksFromChanges([{ path: CARD, status: 'changed', base }], snapshotOf());
    expect(facts.cards).toEqual({
      [CARD]: { changed: true, dirty: true, versionColumn: 'done' },
    });
  });

  it('marks a moved card dirty from the text it had under its old path', () => {
    const from = 'docs/tasks/stage1/phase2/specs/a.md';
    const { facts } = tasksFromChanges(
      [{ path: CARD, status: 'moved', from, base: '---\ncolumn: done\n---\n\n# A\n' }],
      snapshotOf()
    );
    expect(facts.cards).toEqual({
      [CARD]: { changed: true, movedFrom: from, dirty: true, versionColumn: 'done' },
    });
  });

  it('a card in the column the last check-in had, or with no base, is not dirty', () => {
    const { facts } = tasksFromChanges(
      [
        { path: CARD, status: 'changed', base: '---\ncolumn: todo\n---\n\n# Before\n' },
        { path: `${PHASE}/specs/b.md`, status: 'changed' },
      ],
      snapshotOf()
    );
    expect(facts.cards).toEqual({
      [CARD]: { changed: true },
      [`${PHASE}/specs/b.md`]: { changed: true },
    });
  });

  it('the dirty mark reaches the board, with the column it had', () => {
    const base = '---\ncolumn: done\n---\n\n# A\n';
    const snapshot = snapshotOf();
    const known = tasksFromChanges([{ path: CARD, status: 'changed', base }], snapshot);
    const board = projectTasksBoard({ ...snapshot, ...known.snapshot }, PHASE, known.facts);
    expect(board?.cards.find((card) => card.path === CARD)).toMatchObject({
      changed: true,
      dirty: true,
      versionColumn: 'done',
    });
  });

  it('treats a move with no old path, or onto itself, as a change', () => {
    const { facts, snapshot } = tasksFromChanges(
      [
        { path: CARD, status: 'moved' },
        { path: SEED, status: 'moved', from: SEED },
      ],
      snapshotOf()
    );
    expect(facts.cards).toEqual({ [CARD]: { changed: true }, [SEED]: { changed: true } });
    expect(snapshot?.moves).toEqual({});
  });

  it('leaves out deleted files and files that are not cards', () => {
    const { facts, snapshot } = tasksFromChanges(
      [
        { path: `${PHASE}/specs/gone.md`, status: 'deleted' },
        { path: `${PHASE}/specs/notes.txt`, status: 'changed' },
        { path: 'README.md', status: 'new' },
        { path: 'docs/elsewhere/x.md', status: 'moved', from: 'docs/elsewhere/y.md' },
      ],
      snapshotOf()
    );
    expect(facts.cards).toEqual({});
    expect(facts.housekeeping).toEqual([]);
    expect(snapshot).toEqual({ moves: {}, created: [] });
  });

  it('marks the order file changed when it is changed, new or moved', () => {
    for (const status of ['changed', 'new', 'moved'] as const) {
      const { facts } = tasksFromChanges([{ path: ORDER, status }], snapshotOf());
      expect(facts.order, status).toEqual({ changed: true });
    }
  });

  it('has no order fact when there is no order file', () => {
    const { [ORDER]: _order, ...files } = FILES;
    const { facts } = tasksFromChanges([{ path: ORDER, status: 'deleted' }], snapshotOf(files));
    expect(facts.order).toBeUndefined();
  });

  it('lists the manifest and new .gitkeep files as housekeeping, by path', () => {
    const { facts } = tasksFromChanges(
      [
        { path: 'docs/tasks/stage2/phase1/.gitkeep', status: 'new' },
        { path: MANIFEST, status: 'changed' },
        { path: 'docs/tasks/stage1/.gitkeep', status: 'new' },
        { path: 'docs/tasks/stage1/phase1/.gitkeep', status: 'changed' },
        { path: '.gitkeep', status: 'new' },
      ],
      snapshotOf()
    );
    expect(facts.housekeeping).toEqual([
      { path: 'docs/tasks/stage1/.gitkeep', kind: 'scaffold' },
      { path: 'docs/tasks/stage2/phase1/.gitkeep', kind: 'scaffold' },
      { path: MANIFEST, kind: 'manifest' },
    ]);
  });

  it('lists the manifest when it is new or moved, and not when it is unchanged', () => {
    for (const status of ['new', 'moved'] as const) {
      const { facts } = tasksFromChanges([{ path: MANIFEST, status }], snapshotOf());
      expect(facts.housekeeping, status).toEqual([{ path: MANIFEST, kind: 'manifest' }]);
    }
    expect(
      tasksFromChanges([{ path: CARD, status: 'changed' }], snapshotOf()).facts.housekeeping
    ).toEqual([]);
  });

  it('knows no cards over a broken manifest, and still lists it', () => {
    const files = { ...FILES, [MANIFEST]: 'version: [' };
    const { facts } = tasksFromChanges(
      [
        { path: MANIFEST, status: 'changed' },
        { path: CARD, status: 'changed' },
      ],
      snapshotOf(files)
    );
    expect(facts).toEqual({ cards: {}, housekeeping: [{ path: MANIFEST, kind: 'manifest' }] });
  });

  it('answers facts the board shows, the moved card’s old path hidden', () => {
    const from = 'docs/tasks/stage1/phase2/specs/a.md';
    const moved = { ...FILES, [from]: FILES[CARD] };
    const base = snapshotOf(moved);
    const known = tasksFromChanges(
      [
        { path: CARD, status: 'moved', from },
        { path: ORDER, status: 'changed' },
        { path: MANIFEST, status: 'changed' },
      ],
      base
    );
    const board = projectTasksBoard({ ...base, ...known.snapshot }, PHASE, known.facts);
    expect(board?.cards.find((card) => card.path === CARD)).toMatchObject({
      changed: true,
      dirty: false,
      movedFrom: from,
    });
    expect(board?.pool.order).toEqual({ changed: true });
    expect(board?.housekeeping).toEqual([{ path: MANIFEST, kind: 'manifest' }]);
    const phase2 = projectTasksBoard(
      { ...base, ...known.snapshot },
      'docs/tasks/stage1/phase2',
      known.facts
    );
    expect(phase2?.cards).toEqual([]);
  });
});
