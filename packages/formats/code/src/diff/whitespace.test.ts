import { describe, expect, it } from 'vitest';

import { stripInlineWhitespace } from './whitespace';

describe('stripInlineWhitespace', () => {
  it('removes spaces and tabs but keeps newlines', () => {
    expect(stripInlineWhitespace('a = 1\n\tb = 2').norm).toBe('a=1\nb=2');
  });

  it('maps each normalized index back to the original index', () => {
    const { norm, map } = stripInlineWhitespace('a b');
    expect(norm).toBe('ab');
    // 'a' is at 0, 'b' is at 2 (the space at 1 is dropped).
    expect(map[0]).toBe(0);
    expect(map[1]).toBe(2);
    // End anchor maps to the original length.
    expect(map[norm.length]).toBe(3);
  });

  it('treats whitespace-only differences as identical (empty diff input)', () => {
    const a = stripInlineWhitespace('foo(  a,b )');
    const b = stripInlineWhitespace('foo(a, b)');
    expect(a.norm).toBe(b.norm);
  });

  it('handles an empty string', () => {
    const { norm, map } = stripInlineWhitespace('');
    expect(norm).toBe('');
    expect(map).toEqual([0]);
  });

  it('preserves the end anchor when the string ends in whitespace', () => {
    const { norm, map } = stripInlineWhitespace('ab  ');
    expect(norm).toBe('ab');
    expect(map[norm.length]).toBe(4);
  });
});
