import { describe, expect, it } from 'vitest';

import { rangeOf } from './range';

describe('rangeOf', () => {
  it.each([
    ['bytes=0-99', { start: 0, end: 99 }],
    ['bytes=10-10', { start: 10, end: 10 }],
    ['bytes=900-', { start: 900, end: 999 }],
    ['bytes=-100', { start: 900, end: 999 }],
    ['bytes=990-2000', { start: 990, end: 999 }],
    ['bytes=-5000', { start: 0, end: 999 }],
    ['bytes=0-99999999999999999999', { start: 0, end: 999 }],
    ['BYTES=0-1', { start: 0, end: 1 }],
    [' bytes=0-1 ', { start: 0, end: 1 }],
  ])('reads %s of a 1000-byte file', (header, range) => {
    expect(rangeOf(header, 1000)).toEqual(range);
  });

  it.each([
    'bytes=1000-',
    'bytes=1000-1001',
    'bytes=5000-6000',
    'bytes=-0',
    'bytes=99999999999999999999-',
  ])('finds %s of a 1000-byte file past its end', (header) => {
    expect(rangeOf(header, 1000)).toBe('unsatisfiable');
  });

  it.each(['bytes=0-', 'bytes=0-0', 'bytes=-1'])(
    'finds %s of an empty file past its end',
    (header) => {
      expect(rangeOf(header, 0)).toBe('unsatisfiable');
    }
  );

  it.each([
    null,
    '',
    'bytes=0-1,5-6',
    'bytes=0-1, 5-6',
    'bytes=-',
    'bytes=5-2',
    'bytes=a-b',
    'bytes=1.5-2',
    'bytes=+1-2',
    'bytes 0-1',
    'items=0-1',
    'bytes=0-1-2',
  ])('sends the whole file for %s', (header) => {
    expect(rangeOf(header, 1000)).toBeNull();
  });
});
