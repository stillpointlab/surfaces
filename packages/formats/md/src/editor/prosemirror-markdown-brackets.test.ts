import { Fragment } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';

import { getMarkdownParser, getMarkdownSerializer, unescapeBrackets } from './prosemirror-markdown';

import type { Node } from 'prosemirror-model';

const parser = getMarkdownParser();
const serializer = getMarkdownSerializer();

/** Parse, then write the serializer's way, with no source to keep. */
const rewritten = (markdown: string): string => serializer.serialize(parser.parse(markdown));

/**
 * Parse `markdown`, put `block` (Markdown for one block) in place of its `index`th
 * block, as an edit in the rich view would leave it, and save with the source.
 */
function saved(markdown: string, index: number, block: string): string {
  const { doc, source } = parser.parseWithSource(markdown);
  expect(source).not.toBeNull();
  const blocks: Node[] = [];
  doc.forEach((node) => blocks.push(node));
  blocks[index] = parser.parse(block).firstChild as Node;
  return serializer.serialize(doc.copy(Fragment.fromArray(blocks)), source);
}

describe('square brackets are written as typed', () => {
  it('keeps a task list’s boxes', () => {
    const markdown = '- [x] done\n- [ ] todo';
    expect(rewritten(markdown)).toBe(markdown);
  });

  it('keeps brackets in prose', () => {
    const markdown = 'A line with [brackets] in it, and a lone ] and a lone [ too.';
    expect(rewritten(markdown)).toBe(markdown);
  });

  it('keeps brackets around marked text', () => {
    expect(rewritten('See [**bold**] and [`code`].')).toBe('See [**bold**] and [`code`].');
  });

  it('keeps brackets in a table cell', () => {
    const markdown = '| Task | State |\n| --- | --- |\n| ship | [x] |';
    expect(rewritten(markdown).trimEnd()).toBe(markdown);
  });

  it('still writes a link as a link', () => {
    const markdown = 'A [link](https://example.com) and ![an image](a.png).';
    expect(rewritten(markdown)).toBe(markdown);
  });

  it('keeps the backslashes where bare brackets would read as a link', () => {
    // Text that only looks like a link: typed with backslashes, it has to keep them.
    const markdown = 'Not a link: \\[text\\](target).';
    const written = rewritten(markdown);

    expect(written).toBe(markdown);
    expect(parser.parse(written).eq(parser.parse(markdown))).toBe(true);
  });

  it('keeps them for one pair and drops them for another in the same text', () => {
    const markdown = 'Keep \\[this\\](x) but write [that] bare.';
    expect(rewritten(markdown)).toBe(markdown);
  });

  it('keeps them where a link starts in the next text node', () => {
    // `[` ends one text node and the emphasis the next: no single node sees the pair,
    // so the second reading is what keeps the backslashes.
    const markdown = 'Odd: \\[*text*\\](target).';
    const written = rewritten(markdown);

    expect(parser.parse(written).eq(parser.parse(markdown))).toBe(true);
    expect(written).toContain('\\[');
  });

  it('reads back as the same document however it was written', () => {
    const cases = [
      '- [x] done\n- [ ] todo',
      'A [b] c [d](e) f \\[g\\](h) i ] j [ k',
      '[a]: not a definition here',
      'Text [^1] and a\\[i\\] index and arr[0][1].',
      '> quote with [brackets]\n\n1. item [one]\n2. item \\[two\\](x)',
    ];
    for (const markdown of cases) {
      const doc = parser.parse(markdown);
      expect(parser.parse(serializer.serialize(doc)).eq(doc), markdown).toBe(true);
    }
  });
});

describe('a save that keeps its source', () => {
  it('rewrites an edited task list without escaping its boxes', () => {
    const markdown = '# Plan\n\n- [x] done\n- [ ] todo\n\nA closing line.\n';

    expect(saved(markdown, 1, '- [x] done twice\n- [ ] todo')).toBe(
      '# Plan\n\n- [x] done twice\n- [ ] todo\n\nA closing line.\n'
    );
  });

  it('keeps the backslashes of a name the document defines as a link', () => {
    // `\[home\]` is text here; bare, the definition below would make it a link.
    const markdown = 'Go \\[home\\] now.\n\nSee [home] for more.\n\n[home]: https://example.com\n';

    expect(saved(markdown, 0, 'Go \\[home\\] today.')).toBe(
      'Go \\[home\\] today.\n\nSee [home] for more.\n\n[home]: https://example.com\n'
    );
  });
});

describe('unescapeBrackets', () => {
  it('leaves text with no escaped bracket alone', () => {
    expect(unescapeBrackets('plain \\* text')).toBe('plain \\* text');
  });

  it('takes the backslash off a pair nothing follows', () => {
    expect(unescapeBrackets('\\[x\\] done')).toBe('[x] done');
  });

  it('keeps it on a pair that a parenthesis, a bracket or a colon follows', () => {
    expect(unescapeBrackets('\\[a\\](b)')).toBe('\\[a\\](b)');
    expect(unescapeBrackets('\\[a\\]\\[b\\]')).toBe('\\[a\\][b]');
    expect(unescapeBrackets('\\[a\\]: b')).toBe('\\[a\\]: b');
  });

  it('does not take an escaped backslash for an escape', () => {
    expect(unescapeBrackets('\\\\\\[a\\]')).toBe('\\\\[a]');
  });
});
