import { describe, expect, it } from 'vitest';

import { buildTasksNav, resolveDefaultBoard } from './nav.js';
import { BUILTIN_TASK_KINDS } from './types.js';

import type { SharedTaskBoardDescriptor, SharedTasksManifest } from './types.js';

const board = (
  path: string,
  stagePhase?: { stage: number; phase: number }
): SharedTaskBoardDescriptor => ({
  path,
  label: path,
  paths: { brief: [], spec: [], spike: [], review: [], test: [] },
  ...(stagePhase ?? {}),
});

const manifest = (current?: { stage: number; phase: number }): SharedTasksManifest => ({
  version: 1,
  columns: [{ id: 'briefed', label: 'Briefed' }],
  frontmatterKey: 'column',
  kinds: [...BUILTIN_TASK_KINDS],
  defaultColumn: 'briefed',
  doneColumn: 'briefed',
  tags: [],
  ...(current ? { current } : {}),
});

describe('buildTasksNav', () => {
  it('groups by stage with numeric sorting (no zero-padding assumptions)', () => {
    const nav = buildTasksNav([
      board('d/stage10/phase2', { stage: 10, phase: 2 }),
      board('d/stage2/phase10', { stage: 2, phase: 10 }),
      board('d/stage2/phase9', { stage: 2, phase: 9 }),
      board('d/sprint-9'),
    ]);
    expect(nav.stages.map((s) => s.stage)).toEqual([2, 10]);
    expect(nav.stages[0].phases.map((p) => p.phase)).toEqual([9, 10]);
    expect(nav.other).toEqual([{ path: 'd/sprint-9', label: 'd/sprint-9' }]);
  });

  it('returns empty buckets for no boards', () => {
    expect(buildTasksNav([])).toEqual({ stages: [], other: [] });
  });
});

describe('resolveDefaultBoard', () => {
  const nav = buildTasksNav([
    board('d/stage1/phase1', { stage: 1, phase: 1 }),
    board('d/stage3/phase5', { stage: 3, phase: 5 }),
    board('d/stage3/phase4', { stage: 3, phase: 4 }),
    board('d/flat'),
  ]);

  it('honors the manifest current pointer when the phase exists', () => {
    expect(resolveDefaultBoard(nav, manifest({ stage: 3, phase: 4 }))).toEqual({
      kind: 'phase',
      stage: 3,
      phase: 4,
      path: 'd/stage3/phase4',
    });
  });

  it('falls back to the highest stage/phase when the pointer is missing or stale', () => {
    expect(resolveDefaultBoard(nav, manifest())).toMatchObject({ stage: 3, phase: 5 });
    expect(resolveDefaultBoard(nav, manifest({ stage: 9, phase: 9 }))).toMatchObject({
      stage: 3,
      phase: 5,
    });
  });

  it('falls back to the first non-conventional board, else null', () => {
    const flatOnly = buildTasksNav([board('d/flat')]);
    expect(resolveDefaultBoard(flatOnly, manifest())).toEqual({ kind: 'other', path: 'd/flat' });
    expect(resolveDefaultBoard(buildTasksNav([]), manifest())).toBeNull();
  });
});

describe('buildTasksNav duplicate stage/phase handling', () => {
  it('first board wins the tab slot; duplicates fall into the flat bucket', () => {
    const nav = buildTasksNav([
      board('a/stage1/phase1', { stage: 1, phase: 1 }),
      board('b/stage1/phase1', { stage: 1, phase: 1 }),
    ]);

    expect(nav.stages).toEqual([
      { stage: 1, phases: [{ phase: 1, path: 'a/stage1/phase1', label: 'a/stage1/phase1' }] },
    ]);
    expect(nav.other.map((o) => o.path)).toEqual(['b/stage1/phase1']);
  });
});
