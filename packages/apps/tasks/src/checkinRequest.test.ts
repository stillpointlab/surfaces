import { describe, expect, it } from 'vitest';

import { checkinCountOf, checkinRequestOf, hasUncommittedChange } from './checkinRequest.js';

import type { SharedTaskBoardState, SharedTaskCard, SharedTaskStageState } from './types.js';

const card = (path: string, facts: Partial<SharedTaskCard> = {}): SharedTaskCard =>
  ({ path, column: 'todo', dirty: false, changed: false, ...facts }) as SharedTaskCard;

const pool = {
  orderPath: 'docs/tasks/unassigned/order.yaml',
  order: { changed: true },
  cards: [card('docs/tasks/unassigned/seeds/a.md', { changed: true }), card('seeds/b.md')],
};

describe('hasUncommittedChange', () => {
  it('is any change, and never a tracked card’s', () => {
    expect(hasUncommittedChange(card('a.md'))).toBe(false);
    expect(hasUncommittedChange(card('a.md', { changed: true }))).toBe(true);
    expect(hasUncommittedChange(card('a.md', { changed: true, dirty: true }))).toBe(true);
    expect(hasUncommittedChange(card('a.md', { changed: true, movedFrom: 'b.md' }))).toBe(true);
    expect(hasUncommittedChange(card('a.md', { changed: true, tracked: true }))).toBe(false);
  });
});

describe('checkinRequestOf', () => {
  it('a board: its changed cards and the pool’s, the order file, the housekeeping', () => {
    const state = {
      board: { path: 'docs/tasks/stage1/phase1', label: 'Phase 1' },
      cards: [card('p1/a.md', { changed: true }), card('p1/b.md')],
      pool,
      housekeeping: [{ path: 'docs/tasks/tasks.yaml', kind: 'manifest' }],
    } as unknown as SharedTaskBoardState;
    const request = checkinRequestOf(state, 'board');
    expect(request).toMatchObject({
      boardPath: 'docs/tasks/stage1/phase1',
      boardLabel: 'Phase 1',
      stage: null,
      orderFile: { path: pool.orderPath },
      housekeeping: [{ path: 'docs/tasks/tasks.yaml', kind: 'manifest' }],
    });
    expect(request.cards.map((found) => found.path)).toEqual([
      'p1/a.md',
      'docs/tasks/unassigned/seeds/a.md',
    ]);
    expect(checkinCountOf(request)).toBe(4);
  });

  it('a stage: every phase’s changed cards, named for the stage', () => {
    const state = {
      stage: 3,
      phases: [
        { cards: [card('s3/p1/a.md', { changed: true })] },
        { cards: [card('s3/p2/b.md', { changed: true, tracked: true }), card('s3/p2/c.md')] },
      ],
      pool: null,
    } as unknown as SharedTaskStageState;
    const request = checkinRequestOf(state, 'stage');
    expect(request).toMatchObject({
      boardPath: '',
      boardLabel: 'Stage 3',
      stage: 3,
      orderFile: null,
      housekeeping: [],
    });
    expect(request.cards.map((found) => found.path)).toEqual(['s3/p1/a.md']);
    expect(checkinCountOf(request)).toBe(1);
  });
});
