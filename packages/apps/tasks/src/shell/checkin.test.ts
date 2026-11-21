import { describe, expect, it } from 'vitest';

import { tasksCheckinFiles } from './checkin.js';

import type { TaskBoardCheckinRequest } from '../element/task-board.js';
import type { SharedTaskCard } from '../types.js';

const card = (path: string): SharedTaskCard =>
  ({ path, column: 'todo', versionColumn: 'todo', dirty: false }) as unknown as SharedTaskCard;

const request = (over: Partial<TaskBoardCheckinRequest>): TaskBoardCheckinRequest => ({
  boardPath: '',
  boardLabel: 'Stage 3',
  stage: 3,
  cards: [],
  orderFile: null,
  housekeeping: [],
  ...over,
});

describe('tasksCheckinFiles on a stage view', () => {
  it('puts the phases in their order and the pool and config last', () => {
    const files = tasksCheckinFiles(
      request({
        cards: [
          card('docs/tasks/unassigned/seeds/idea.md'),
          card('docs/tasks/stage3/phase10/specs/late.md'),
          card('docs/tasks/stage3/phase2/specs/b.md'),
          card('docs/tasks/stage3/phase2/specs/a.md'),
        ],
        orderFile: { path: 'docs/tasks/unassigned/order.yaml' },
        housekeeping: [
          { path: 'docs/tasks/tasks.yaml', kind: 'manifest' },
          // A phase with no changed card: its new folder is its only row.
          { path: 'docs/tasks/stage3/phase4/specs/.gitkeep', kind: 'folder' },
        ] as TaskBoardCheckinRequest['housekeeping'],
      })
    );
    expect(files.map((file) => [file.group, file.path.split('/').pop()])).toEqual([
      // By number, so phase 2 comes before phase 10; within a phase, by path.
      ['Phase 2', 'a.md'],
      ['Phase 2', 'b.md'],
      ['Phase 4', '.gitkeep'],
      ['Phase 10', 'late.md'],
      // Then the pool and config, in the order they were: cards, the order file, housekeeping.
      ['Pool & config', 'idea.md'],
      ['Pool & config', 'order.yaml'],
      ['Pool & config', 'tasks.yaml'],
    ]);
  });

  it('leaves a board view’s rows as they come, with no groups', () => {
    const files = tasksCheckinFiles(
      request({
        stage: null,
        cards: [card('b/stage3/phase2/z.md'), card('b/stage3/phase1/a.md')],
        orderFile: { path: 'b/unassigned/order.yaml' },
      })
    );
    expect(files.map((file) => [file.group, file.path])).toEqual([
      [undefined, 'b/stage3/phase2/z.md'],
      [undefined, 'b/stage3/phase1/a.md'],
      [undefined, 'b/unassigned/order.yaml'],
    ]);
  });
});
