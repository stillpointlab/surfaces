// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { FRONTMATTER_BLOCK_PATTERN, splitFrontmatterBlock } from './frontmatter';

// md's splitFrontmatterBlock tests (which still run there, through md's
// re-export) cover the cases; these pin the entry itself and its capture group.
describe('frontmatter', () => {
  it('splits so raw + body is the input, CRLF kept', () => {
    const input = '---\r\ncolumn: done\r\n---\r\nBody\n';
    const { raw, body } = splitFrontmatterBlock(input);
    expect(raw).toBe('---\r\ncolumn: done\r\n---\r\n');
    expect(raw + body).toBe(input);
  });

  it('captures the block content without delimiters', () => {
    expect(FRONTMATTER_BLOCK_PATTERN.exec('---\na: 1\nb: 2\n---\n')?.[1]).toBe('a: 1\nb: 2');
    expect(FRONTMATTER_BLOCK_PATTERN.exec('---\n---\n')?.[1]).toBeUndefined();
  });

  it('leaves a document without a block whole', () => {
    expect(splitFrontmatterBlock('# Title\n---\n')).toEqual({ raw: '', body: '# Title\n---\n' });
  });

  it('runs without a DOM', () => {
    expect(typeof document).toBe('undefined');
  });
});
