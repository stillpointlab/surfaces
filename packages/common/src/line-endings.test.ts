import { describe, expect, it } from 'vitest';

import { lineBreakOf, withLineBreak } from './line-endings';

describe('lineBreakOf', () => {
  it("finds the text's first line break", () => {
    expect(lineBreakOf('a\r\nb\nc')).toBe('\r\n');
    expect(lineBreakOf('a\nb\r\nc')).toBe('\n');
    expect(lineBreakOf('a\rb')).toBe('\r');
  });

  it('defaults to LF for text with no line break', () => {
    expect(lineBreakOf('')).toBe('\n');
    expect(lineBreakOf('one line')).toBe('\n');
  });
});

describe('withLineBreak', () => {
  it('writes every line break as the one given, mixed endings included', () => {
    expect(withLineBreak('a\nb\r\nc\rd', '\r\n')).toBe('a\r\nb\r\nc\r\nd');
    expect(withLineBreak('a\r\nb\r\n', '\n')).toBe('a\nb\n');
  });

  it('leaves text already in that line ending unchanged', () => {
    expect(withLineBreak('a\r\nb', '\r\n')).toBe('a\r\nb');
  });
});
