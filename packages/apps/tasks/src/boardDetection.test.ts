import { describe, expect, it } from 'vitest';

import {
  detectBoards,
  detectPool,
  synthesizeBoardForPath,
  withSynthesizedBoards,
} from './boardDetection.js';
import { BUILTIN_TASK_KINDS } from './types.js';

import type { TreeNode } from './types.js';

function blob(path: string): TreeNode {
  return { path, type: 'blob', sha: `sha-${path}` };
}

function tree(path: string): TreeNode {
  return { path, type: 'tree', sha: `sha-${path}` };
}

describe('detectBoards', () => {
  const nodes: TreeNode[] = [
    tree('docs'),
    tree('docs/tasks'),
    blob('docs/tasks/tasks.yaml'),
    blob('docs/tasks/brief.template.md'),
    blob('docs/tasks/spec.template.md'),
    tree('docs/tasks/stage1'),
    tree('docs/tasks/stage1/phase1'),
    tree('docs/tasks/stage1/phase1/briefs'),
    tree('docs/tasks/stage1/phase1/specs'),
    blob('docs/tasks/stage1/phase1/briefs/idea.md'),
    blob('docs/tasks/stage1/phase1/specs/task_a.md'),
    blob('docs/tasks/stage1/phase1/specs/task_b.markdown'),
    blob('docs/tasks/stage1/phase1/specs/notes.txt'),
    tree('docs/tasks/stage1/phase2'),
    tree('docs/tasks/stage1/phase2/briefs'),
    // phase2 has only a briefs folder — the stage/phase name shape alone
    // makes it a board (existence is not a signal, ADR-0027)
    blob('docs/tasks/stage1/phase2/briefs/idea.md'),
    // kind folders OUTSIDE the manifest's directory → never a board
    tree('elsewhere/briefs'),
    tree('elsewhere/tasks'),
    blob('elsewhere/tasks/task.md'),
  ];

  it('detects every stage/phase-shaped folder under the docs root', () => {
    const boards = detectBoards(nodes, 'docs/tasks/tasks.yaml', BUILTIN_TASK_KINDS);
    expect(boards.map((b) => b.path)).toEqual([
      'docs/tasks/stage1/phase1',
      'docs/tasks/stage1/phase2',
    ]);
  });

  it('an absent kind folder means the kind is empty, never ineligible', () => {
    const [, phase2] = detectBoards(nodes, 'docs/tasks/tasks.yaml', BUILTIN_TASK_KINDS);
    expect(phase2.paths.brief).toEqual(['docs/tasks/stage1/phase2/briefs/idea.md']);
    expect(phase2.paths.spec).toEqual([]);
    expect(phase2.paths.spike).toEqual([]);
    expect(phase2.paths.review).toEqual([]);
    expect(phase2.paths.test).toEqual([]);
  });

  it('collects every kind folder that exists (all five kinds)', () => {
    const fullNodes: TreeNode[] = [
      blob('docs/tasks/tasks.yaml'),
      tree('docs/tasks/stage1/phase1/briefs'),
      tree('docs/tasks/stage1/phase1/specs'),
      blob('docs/tasks/stage1/phase1/briefs/idea.md'),
      blob('docs/tasks/stage1/phase1/specs/task.md'),
      blob('docs/tasks/stage1/phase1/spikes/why_slow.md'),
      blob('docs/tasks/stage1/phase1/reviews/auth_review.md'),
      blob('docs/tasks/stage1/phase1/tests/release_plan.md'),
    ];
    const [board] = detectBoards(fullNodes, 'docs/tasks/tasks.yaml', BUILTIN_TASK_KINDS);
    expect(board.paths.spike).toEqual(['docs/tasks/stage1/phase1/spikes/why_slow.md']);
    expect(board.paths.review).toEqual(['docs/tasks/stage1/phase1/reviews/auth_review.md']);
    expect(board.paths.test).toEqual(['docs/tasks/stage1/phase1/tests/release_plan.md']);
  });

  it('labels stage/phase folders and lists only markdown blobs, sorted', () => {
    const [board] = detectBoards(nodes, 'docs/tasks/tasks.yaml', BUILTIN_TASK_KINDS);
    expect(board.label).toBe('Stage 1 — Phase 1');
    expect(board.stage).toBe(1);
    expect(board.phase).toBe(1);
    expect(board.paths.brief).toEqual(['docs/tasks/stage1/phase1/briefs/idea.md']);
    expect(board.paths.spec).toEqual([
      'docs/tasks/stage1/phase1/specs/task_a.md',
      'docs/tasks/stage1/phase1/specs/task_b.markdown',
    ]);
  });

  it('a non stage/phase folder is a board when it holds any declared kind folder', () => {
    const flat: TreeNode[] = [blob('docs/tasks/tasks.yaml'), tree('docs/tasks/sprint-9/briefs')];
    const boards = detectBoards(flat, 'docs/tasks/tasks.yaml', BUILTIN_TASK_KINDS);
    expect(boards).toHaveLength(1);
    expect(boards[0].label).toBe('sprint-9');
    expect(boards[0].stage).toBeUndefined();
  });

  it('a non stage/phase folder without kind folders is not a board', () => {
    const flat: TreeNode[] = [blob('docs/tasks/tasks.yaml'), blob('docs/tasks/notes/scratch.md')];
    expect(detectBoards(flat, 'docs/tasks/tasks.yaml', BUILTIN_TASK_KINDS)).toEqual([]);
  });

  it('infers directories from blob paths when tree entries are missing', () => {
    const blobsOnly: TreeNode[] = [
      blob('docs/tasks/tasks.yaml'),
      blob('docs/tasks/stage2/phase10/briefs/idea.md'),
      blob('docs/tasks/stage2/phase10/specs/task.md'),
    ];
    const boards = detectBoards(blobsOnly, 'docs/tasks/tasks.yaml', BUILTIN_TASK_KINDS);
    expect(boards.map((b) => b.path)).toEqual(['docs/tasks/stage2/phase10']);
  });

  it('supports a root-level manifest, including a root board', () => {
    const rootNodes: TreeNode[] = [
      blob('tasks.yaml'),
      tree('briefs'),
      tree('specs'),
      blob('briefs/idea.md'),
      blob('specs/task.md'),
    ];
    const boards = detectBoards(rootNodes, 'tasks.yaml', BUILTIN_TASK_KINDS);
    expect(boards.map((b) => b.path)).toEqual(['']);
    expect(boards[0].paths.spec).toEqual(['specs/task.md']);
  });

  it('returns boards sorted by path', () => {
    const multi: TreeNode[] = [
      blob('docs/tasks/tasks.yaml'),
      tree('docs/tasks/stage2/phase2/briefs'),
      tree('docs/tasks/stage2/phase2/specs'),
      tree('docs/tasks/stage1/phase1/briefs'),
      tree('docs/tasks/stage1/phase1/specs'),
    ];
    const boards = detectBoards(multi, 'docs/tasks/tasks.yaml', BUILTIN_TASK_KINDS);
    expect(boards.map((b) => b.path)).toEqual([
      'docs/tasks/stage1/phase1',
      'docs/tasks/stage2/phase2',
    ]);
  });

  it('never claims the reserved pool folder as a board (ADR-0020)', () => {
    const withPool: TreeNode[] = [
      blob('docs/tasks/tasks.yaml'),
      tree('docs/tasks/stage1/phase1/briefs'),
      tree('docs/tasks/stage1/phase1/specs'),
      // The pool holds kind folders — it must be excluded, and so must any
      // nested folder under it.
      tree('docs/tasks/unassigned/briefs'),
      tree('docs/tasks/unassigned/specs'),
      tree('docs/tasks/unassigned/nested/briefs'),
      tree('docs/tasks/unassigned/nested/tasks'),
    ];
    const boards = detectBoards(withPool, 'docs/tasks/tasks.yaml', BUILTIN_TASK_KINDS);
    expect(boards.map((b) => b.path)).toEqual(['docs/tasks/stage1/phase1']);
  });
});

describe('detectPool', () => {
  it('collects pool markdown by kind and computes the order path', () => {
    const nodes: TreeNode[] = [
      blob('docs/tasks/tasks.yaml'),
      blob('docs/tasks/unassigned/briefs/idea.md'),
      blob('docs/tasks/unassigned/specs/task_b.md'),
      blob('docs/tasks/unassigned/specs/task_a.md'),
      blob('docs/tasks/unassigned/order.yaml'),
      blob('docs/tasks/stage1/phase1/briefs/other.md'),
    ];
    const pool = detectPool(nodes, 'docs/tasks/tasks.yaml', BUILTIN_TASK_KINDS);
    expect(pool).toEqual({
      path: 'docs/tasks/unassigned',
      paths: {
        brief: ['docs/tasks/unassigned/briefs/idea.md'],
        spec: ['docs/tasks/unassigned/specs/task_a.md', 'docs/tasks/unassigned/specs/task_b.md'],
        spike: [],
        review: [],
        test: [],
      },
      orderPath: 'docs/tasks/unassigned/order.yaml',
    });
  });

  it('returns an empty descriptor when the folder does not exist yet', () => {
    const pool = detectPool(
      [blob('docs/tasks/tasks.yaml')],
      'docs/tasks/tasks.yaml',
      BUILTIN_TASK_KINDS
    );
    expect(pool.paths.brief).toEqual([]);
    expect(pool.paths.spec).toEqual([]);
    expect(pool.path).toBe('docs/tasks/unassigned');
  });
});

describe('custom kind registries', () => {
  // The registry is manifest data — a non-default list (own ids, a dir
  // override) must drive detection without any code enumerating kinds.
  const KINDS = [
    { id: 'brief', label: 'Brief', badge: 'b', dir: 'briefs', creatable: true },
    { id: 'spec', label: 'Spec', badge: 'sp', dir: 'specs', creatable: false },
    { id: 'story', label: 'Story', badge: 'y', dir: 'stories', creatable: true },
  ];
  const nodes: TreeNode[] = [
    blob('docs/tasks/tasks.yaml'),
    blob('docs/tasks/stage1/phase1/briefs/idea.md'),
    blob('docs/tasks/stage1/phase1/specs/task.md'),
    blob('docs/tasks/stage1/phase1/stories/epic.md'),
    // The built-in registry would claim this folder; a custom one must not.
    blob('docs/tasks/stage1/phase1/spikes/probe.md'),
    blob('docs/tasks/unassigned/stories/backlog_epic.md'),
  ];

  it('detects boards with paths keyed by kind id and folders from each dir', () => {
    const [board] = detectBoards(nodes, 'docs/tasks/tasks.yaml', KINDS);
    expect(board.paths).toEqual({
      brief: ['docs/tasks/stage1/phase1/briefs/idea.md'],
      spec: ['docs/tasks/stage1/phase1/specs/task.md'],
      story: ['docs/tasks/stage1/phase1/stories/epic.md'],
    });
  });

  it('an undeclared folder is ignored, not an error', () => {
    const [board] = detectBoards(nodes, 'docs/tasks/tasks.yaml', KINDS);
    expect(board.paths).not.toHaveProperty('spike');
  });

  it('the pool follows the same registry', () => {
    const pool = detectPool(nodes, 'docs/tasks/tasks.yaml', KINDS);
    expect(pool.paths.story).toEqual(['docs/tasks/unassigned/stories/backlog_epic.md']);
    expect(pool.paths).not.toHaveProperty('spike');
  });
});

describe('board synthesis (existence is not a signal, ADR-0027)', () => {
  const detected = detectBoards(
    [blob('docs/tasks/tasks.yaml'), blob('docs/tasks/stage2/phase3/briefs/idea.md')],
    'docs/tasks/tasks.yaml',
    BUILTIN_TASK_KINDS
  );

  it('synthesizes the current: pointer phase when its folders are missing', () => {
    const boards = withSynthesizedBoards(
      detected,
      { current: { stage: 2, phase: 4 } },
      'docs/tasks/tasks.yaml'
    );
    expect(boards.map((b) => b.path)).toEqual([
      'docs/tasks/stage2/phase3',
      'docs/tasks/stage2/phase4',
    ]);
    const synthesized = boards[1];
    expect(synthesized).toMatchObject({ stage: 2, phase: 4, label: 'Stage 2 — Phase 4' });
    expect(synthesized.paths).toEqual({});
  });

  it('leaves detected boards alone when the pointer phase exists', () => {
    const boards = withSynthesizedBoards(
      detected,
      { current: { stage: 2, phase: 3 } },
      'docs/tasks/tasks.yaml'
    );
    expect(boards).toBe(detected);
  });

  it('synthesizes the stage1/phase1 floor for a bare manifest', () => {
    const boards = withSynthesizedBoards([], {}, 'docs/tasks/tasks.yaml');
    expect(boards.map((b) => b.path)).toEqual(['docs/tasks/stage1/phase1']);
    expect(boards[0]).toMatchObject({ stage: 1, phase: 1 });
  });

  it('does not duplicate the floor when the pointer already names stage1/phase1', () => {
    const boards = withSynthesizedBoards(
      [],
      { current: { stage: 1, phase: 1 } },
      'docs/tasks/tasks.yaml'
    );
    expect(boards.map((b) => b.path)).toEqual(['docs/tasks/stage1/phase1']);
  });

  it('does not pad gaps between existing phases', () => {
    const boards = withSynthesizedBoards(detected, {}, 'docs/tasks/tasks.yaml');
    expect(boards.map((b) => b.path)).toEqual(['docs/tasks/stage2/phase3']);
  });

  it('synthesizeBoardForPath accepts exactly <root>/stage<N>/phase<M>', () => {
    expect(synthesizeBoardForPath('docs/tasks/stage3/phase9', 'docs/tasks')).toMatchObject({
      path: 'docs/tasks/stage3/phase9',
      stage: 3,
      phase: 9,
    });
    expect(synthesizeBoardForPath('stage3/phase9', '')).toMatchObject({ stage: 3, phase: 9 });
    expect(synthesizeBoardForPath('docs/tasks/stage3', 'docs/tasks')).toBeNull();
    expect(synthesizeBoardForPath('docs/tasks/deep/stage3/phase9', 'docs/tasks')).toBeNull();
    expect(synthesizeBoardForPath('elsewhere/stage3/phase9', 'docs/tasks')).toBeNull();
    expect(synthesizeBoardForPath('docs/tasks/stage3/phase9x', 'docs/tasks')).toBeNull();
  });
});
