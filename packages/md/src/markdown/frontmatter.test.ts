import { describe, expect, it } from 'vitest';

import { createMarkdownIt, renderMarkdown } from './core';
import { splitFrontmatterBlock } from './frontmatter';

describe('splitFrontmatterBlock', () => {
  it('splits a block so raw + body is byte-identical to the input', () => {
    const input = '---\ncolumn: briefed\n---\n\n# Title\n';
    const { raw, body } = splitFrontmatterBlock(input);
    expect(raw).toBe('---\ncolumn: briefed\n---\n');
    expect(body).toBe('\n# Title\n');
    expect(raw + body).toBe(input);
  });

  it('matches an empty block', () => {
    const { raw, body } = splitFrontmatterBlock('---\n---\nBody');
    expect(raw).toBe('---\n---\n');
    expect(body).toBe('Body');
  });

  it('preserves CRLF line endings in the raw block', () => {
    const input = '---\r\na: 1\r\nb: 2\r\n---\r\nBody';
    const { raw, body } = splitFrontmatterBlock(input);
    expect(raw).toBe('---\r\na: 1\r\nb: 2\r\n---\r\n');
    expect(body).toBe('Body');
  });

  it('matches a block whose closing delimiter ends the file without a newline', () => {
    const { raw, body } = splitFrontmatterBlock('---\ncolumn: briefed\n---');
    expect(raw).toBe('---\ncolumn: briefed\n---');
    expect(body).toBe('');
  });

  it('tolerates trailing spaces and tabs on the delimiter lines', () => {
    const { raw } = splitFrontmatterBlock('---  \na: 1\n---\t\nBody');
    expect(raw).toBe('---  \na: 1\n---\t\n');
  });

  it('returns the whole document as body when there is no block', () => {
    expect(splitFrontmatterBlock('# Title\n\n---\n')).toEqual({
      raw: '',
      body: '# Title\n\n---\n',
    });
  });

  it('does not match a document that starts with a blank line', () => {
    expect(splitFrontmatterBlock('\n---\na: 1\n---\n').raw).toBe('');
  });

  it('does not match an unterminated block', () => {
    expect(splitFrontmatterBlock('---\na: 1\n').raw).toBe('');
  });
});

describe('frontMatterPlugin', () => {
  it('tokenizes a leading block as a single front_matter leaf token', () => {
    const md = createMarkdownIt();
    const tokens = md.parse('---\na: 1\nb: 2\n---\n\nBody\n', {});
    expect(tokens[0].type).toBe('front_matter');
    expect(tokens[0].content).toBe('a: 1\nb: 2');
    expect(tokens[0].map).toEqual([0, 4]);
    expect(tokens.filter((t) => t.type === 'front_matter')).toHaveLength(1);
  });

  it('no longer corrupts frontmatter into an hr + setext heading', async () => {
    const html = await renderMarkdown('---\ncolumn: briefed\n---\n\n# Title\n');
    expect(html).not.toContain('<hr');
    expect(html).not.toContain('column: briefed');
    expect(html).toContain('<h1>Title</h1>');
  });

  it('hides the block from rendered output by default', async () => {
    const html = await renderMarkdown('---\na: 1\n---\n\nBody\n');
    expect(html).toBe('<p>Body</p>\n');
  });

  it('leaves a mid-document --- as a thematic break', async () => {
    const html = await renderMarkdown('Body one\n\n---\n\nBody two\n');
    expect(html).toContain('<hr');
    expect(html).toContain('Body one');
    expect(html).toContain('Body two');
  });

  it('leaves an unterminated block at the top of the document alone', async () => {
    const html = await renderMarkdown('---\ncolumn: briefed\n');
    expect(html).toContain('<hr');
    expect(html).toContain('column: briefed');
  });

  it('does not treat a --- block inside a blockquote as frontmatter', async () => {
    const html = await renderMarkdown('> ---\n> a: 1\n> ---\n');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('a: 1');
  });

  it('does not fire when the document starts with a blank line', async () => {
    const html = await renderMarkdown('\n---\na: 1\n---\n');
    expect(html).toContain('a: 1');
  });
});
