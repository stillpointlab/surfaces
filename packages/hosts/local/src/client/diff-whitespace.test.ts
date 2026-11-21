import { describe, expect, it } from 'vitest';

import { lineEndings, whitespaceAttributes, whitespaceNote } from './diff-whitespace';
import { words } from './words';

describe('lineEndings', () => {
  it('names a text’s endings', () => {
    expect(lineEndings('a\nb\n')).toBe('LF');
    expect(lineEndings('a\r\nb\r\n')).toBe('CRLF');
    expect(lineEndings('a\r\nb\n')).toBe('mixed');
    expect(lineEndings('\n')).toBe('LF');
    expect(lineEndings('one line')).toBeNull();
    expect(lineEndings('')).toBeNull();
  });
});

describe('whitespaceNote', () => {
  it('says nothing for equal sides, or for changes that are not whitespace', () => {
    expect(whitespaceNote('a\n', 'a\n')).toBeNull();
    expect(whitespaceNote('a\nb\n', 'a\nc\n')).toBeNull();
    expect(whitespaceNote('one line', 'another line')).toBeNull();
  });

  it('says so when line endings alone differ, naming each side’s', () => {
    expect(whitespaceNote('a\nb\n', 'a\r\nb\r\n')).toBe(words.diff.endingsOnly('CRLF', 'LF'));
    expect(whitespaceNote('a\r\nb\r\n', 'a\nb\r\n')).toBe(words.diff.endingsOnly('mixed', 'CRLF'));
    expect(words.diff.endingsOnly('mixed', 'CRLF')).toContain('mixed endings in the file');
  });

  it('says so when whitespace alone differs', () => {
    expect(whitespaceNote('f() {\n  x;\n}\n', 'f() {\n\tx;\n}\n')).toBe(words.diff.whitespaceOnly);
    expect(whitespaceNote('a b\n', 'a  b \n')).toBe(words.diff.whitespaceOnly);
    // A blank line is a line, not whitespace within one.
    expect(whitespaceNote('a\nb\n', 'a\n\nb\n')).toBeNull();
  });

  it('says both when whitespace and endings differ, and nothing else', () => {
    expect(whitespaceNote('a b\nc\n', 'a  b\r\nc\r\n')).toBe(
      `${words.diff.whitespaceOnly} ${words.diff.endingsToo('CRLF', 'LF')}`
    );
  });

  it('names the endings beside other changes', () => {
    expect(whitespaceNote('a\nb\n', 'a\r\nc\r\n')).toBe(words.diff.endingsToo('CRLF', 'LF'));
    // A side of one line has no ending to compare.
    expect(whitespaceNote('a', 'b\r\nc\r\n')).toBeNull();
  });
});

describe('whitespaceAttributes', () => {
  it('gives <code-diff> its two attributes for each mode', () => {
    expect(whitespaceAttributes('compare')).toEqual({
      'ignore-whitespace': 'false',
      'show-whitespace': 'false',
    });
    expect(whitespaceAttributes('ignore')).toEqual({
      'ignore-whitespace': 'true',
      'show-whitespace': 'false',
    });
    expect(whitespaceAttributes('show')).toEqual({
      'ignore-whitespace': 'false',
      'show-whitespace': 'true',
    });
  });
});
