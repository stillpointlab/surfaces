// The numbers the column is drawn by: which pages hold a canvas, and how sharp a
// canvas may be.
import { describe, expect, it } from 'vitest';

import {
  MAX_CANVAS_PIXELS,
  MAX_CANVAS_SIDE,
  PAGES_AROUND,
  pagesNear,
  pixelRatioFor,
} from './layout';

describe('pagesNear', () => {
  it('is the pages in view and two either side', () => {
    expect(PAGES_AROUND).toBe(2);
    expect([...pagesNear([10, 11], 200)]).toEqual([8, 9, 10, 11, 12, 13]);
  });

  it('stops at the first and the last page', () => {
    expect([...pagesNear([0], 200)]).toEqual([0, 1, 2]);
    expect([...pagesNear([199], 200)]).toEqual([197, 198, 199]);
    expect([...pagesNear([0], 1)]).toEqual([0]);
  });

  it('is the first pages when none is in view', () => {
    expect([...pagesNear([], 200)]).toEqual([0, 1, 2]);
  });
});

describe('pixelRatioFor', () => {
  it('is the screen’s pixel ratio for a page of a usual size', () => {
    expect(pixelRatioFor(816, 1056, 2)).toBe(2);
    expect(pixelRatioFor(816, 1056, 1)).toBe(1);
    expect(pixelRatioFor(816, 1056, 0)).toBe(1);
  });

  it('keeps a huge page within the bound on a canvas’s pixels', () => {
    const ratio = pixelRatioFor(4000, 4000, 3);
    expect(ratio).toBeLessThan(3);
    expect(4000 * ratio * 4000 * ratio).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1);
  });

  it('keeps a long, narrow page within the bound on a side', () => {
    const ratio = pixelRatioFor(100, 40_000, 2);
    expect(40_000 * ratio).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
  });
});
