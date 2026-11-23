import { Fragment } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { alignBlocks } from './markdown-source';
import { getMarkdownParser, getMarkdownSerializer } from './prosemirror-markdown';
import { getSchema } from './prosemirror-schema';

import type { Node } from 'prosemirror-model';

const parser = getMarkdownParser();
const serializer = getMarkdownSerializer();
const schema = getSchema();

/** The document with its top-level blocks changed: what an edit in the rich view leaves. */
function withBlocks(doc: Node, change: (blocks: Node[]) => Node[]): Node {
  const blocks: Node[] = [];
  doc.forEach((node) => blocks.push(node));
  return doc.copy(Fragment.fromArray(change(blocks)));
}

const paragraph = (text: string): Node => schema.nodes.paragraph.create(null, schema.text(text));

/** Parse `text`, edit its blocks, and write it back with the source it was parsed with. */
function edit(text: string, change: (blocks: Node[]) => Node[]): string {
  const { doc, source } = parser.parseWithSource(text);
  expect(source).not.toBeNull();
  return serializer.serialize(withBlocks(doc, change), source);
}

const replaceAt =
  (index: number, ...nodes: Node[]) =>
  (blocks: Node[]): Node[] => [...blocks.slice(0, index), ...nodes, ...blocks.slice(index + 1)];

// What the serializer does to text it writes: one line a paragraph, `-` bullets,
// tight lists, ATX headings. Each of these is a block the tests leave alone.
const WRAPPED = 'The first line of a paragraph\nthat was wrapped by hand\nat three places.';
const STARS = '* one\n* two\n\n* three, in a loose list';
const SETEXT = 'A heading\n=========';
const TABLE = '| a   | b   |\n| :-- | --: |\n| 1   | 2   |';
const REFERENCE = 'See [the docs][docs] for more.';
const DEFINITION = '[docs]: https://example.com/docs';

const DOCUMENT = [SETEXT, WRAPPED, STARS, 'A paragraph to edit.', TABLE, REFERENCE, DEFINITION]
  .join('\n\n')
  .concat('\n');

describe('a save keeps the text it did not change', () => {
  it('writes an unchanged document as it was set, the serializer notwithstanding', () => {
    const { doc, source } = parser.parseWithSource(DOCUMENT);

    expect(serializer.serialize(doc, source)).toBe(DOCUMENT);
    // The same document written whole is what a save used to produce.
    expect(serializer.serialize(doc)).not.toBe(DOCUMENT);
    expect(serializer.serialize(doc)).not.toContain('that was wrapped by hand\nat three');
  });

  it('rewrites the paragraph that changed and nothing else', () => {
    const written = edit(DOCUMENT, replaceAt(3, paragraph('An edited paragraph.')));

    expect(written).toBe(DOCUMENT.replace('A paragraph to edit.', 'An edited paragraph.'));
  });

  it('keeps the blocks between two edits', () => {
    const written = edit(DOCUMENT, (blocks) =>
      replaceAt(5, paragraph('No link now.'))(replaceAt(1, paragraph('Short.'))(blocks))
    );

    expect(written).toBe(DOCUMENT.replace(WRAPPED, 'Short.').replace(REFERENCE, 'No link now.'));
  });

  it('writes a new block between its neighbours, each as it was', () => {
    const written = edit(DOCUMENT, (blocks) => [
      ...blocks.slice(0, 2),
      paragraph('A new paragraph.'),
      ...blocks.slice(2),
    ]);

    expect(written).toBe(DOCUMENT.replace(WRAPPED, `${WRAPPED}\n\nA new paragraph.`));
  });

  it('takes a deleted block out and leaves one blank line where it was', () => {
    const written = edit(DOCUMENT, (blocks) => blocks.filter((_, index) => index !== 3));

    expect(written).toBe(DOCUMENT.replace('A paragraph to edit.\n\n', ''));
  });

  it('keeps a link definition when the block before it goes', () => {
    const text = `${REFERENCE}\n\nA paragraph that goes.\n\n${DEFINITION}\n\nThe last one.\n`;
    const written = edit(text, (blocks) => blocks.filter((_, index) => index !== 1));

    expect(written).toBe(`${REFERENCE}\n\n${DEFINITION}\n\nThe last one.\n`);
  });

  it('keeps two blocks with no blank line between them as they were', () => {
    const text = '# Title\nText straight after.\n\nA paragraph to edit.\n';
    const written = edit(text, replaceAt(2, paragraph('Edited.')));

    expect(written).toBe('# Title\nText straight after.\n\nEdited.\n');
  });

  it('ends as the text ended: with a final newline, or without', () => {
    const last = replaceAt(1, paragraph('Edited.'));

    expect(edit('One.\n\nTwo.\n', last)).toBe('One.\n\nEdited.\n');
    expect(edit('One.\n\nTwo.', last)).toBe('One.\n\nEdited.');
    expect(edit('One.\n\nTwo.\n\n\n', last)).toBe('One.\n\nEdited.\n\n\n');
    // The last block kept, and one written before it.
    expect(edit('One.\n\nTwo.', replaceAt(0, paragraph('Edited.')))).toBe('Edited.\n\nTwo.');
  });

  it('writes what it rewrites with the line breaks the text has', () => {
    const text = 'One,\r\nwrapped.\r\n\r\nTwo.\r\n\r\n- a\r\n- b\r\n';
    const written = edit(text, replaceAt(1, paragraph('Edited.'), paragraph('And more.')));

    expect(written).toBe('One,\r\nwrapped.\r\n\r\nEdited.\r\n\r\nAnd more.\r\n\r\n- a\r\n- b\r\n');
  });

  it('keeps the body under a frontmatter block, and the block itself', () => {
    const text = `---\ncolumn: todo\n---\n\n${DOCUMENT}`;
    const written = edit(text, replaceAt(4, paragraph('An edited paragraph.')));

    expect(written).toBe(text.replace('A paragraph to edit.', 'An edited paragraph.'));
  });

  it('writes the document whole when kept text would read differently', () => {
    // With the paragraph gone the two lists are neighbours, and their text
    // would read as one list. Nothing is kept, so the meaning is.
    const text = '* a\n* b\n\nBetween.\n\n* c\n';
    const { doc, source } = parser.parseWithSource(text);
    const edited = withBlocks(doc, (blocks) => blocks.filter((_, index) => index !== 1));

    expect(serializer.serialize(edited, source)).toBe(`${serializer.serialize(edited)}\n`);
  });

  it('has no source for text with no block, and writes it as before', () => {
    expect(parser.parseWithSource('').source).toBeNull();
    expect(parser.parseWithSource('\n\n').source).toBeNull();
    const { doc, source } = parser.parseWithSource('');
    const edited = withBlocks(doc, () => [paragraph('First words.')]);

    expect(serializer.serialize(edited, source)).toBe('First words.');
  });

  it('drops an empty paragraph the edit left, and keeps the rest', () => {
    const written = edit(DOCUMENT, (blocks) => [...blocks, schema.nodes.paragraph.create()]);

    expect(written).toBe(DOCUMENT);
  });
});

describe('a link definition inside a list item or a quote', () => {
  /** `doc` with `typed` put in after the first `after` in its text: an edit in the rich view. */
  function typeAfter(doc: Node, after: string, typed: string): Node {
    let at = -1;
    doc.descendants((node, pos) => {
      if (at >= 0) return false;
      const found = node.isText ? node.text!.indexOf(after) : -1;
      if (found >= 0) at = pos + found + after.length;
      return true;
    });
    expect(at).toBeGreaterThanOrEqual(0);
    return EditorState.create({ doc }).tr.insertText(typed, at).doc;
  }

  /** The address and title of the link on `text`, the saved text read back the way the editor reads it. */
  function linkOn(markdown: string, text: string): { href: string; title: string | null } | null {
    let link: { href: string; title: string | null } | null = null;
    parser.parse(markdown).descendants((node) => {
      const mark = node.isText && node.text === text ? node.marks.find(isLink) : undefined;
      if (mark) link = { href: mark.attrs.href as string, title: mark.attrs.title as string };
    });
    return link;
  }
  const isLink = (mark: { type: { name: string } }): boolean => mark.type.name === 'link';

  const DOCS = { href: 'https://example.com/docs', title: 'The docs' };
  const NESTED_IN_LIST = '- one\n- two\n\n  [d]: https://example.com/docs "The docs"';
  // A block between the link and the definition's block, so the seams an edit
  // there makes are not where the link is.
  const IN_LIST = ['See [the docs][d] for more.', 'Between.', NESTED_IN_LIST, 'The end.']
    .join('\n\n')
    .concat('\n');
  const IN_QUOTE = [
    'See [the docs][d] for more.',
    'Between.',
    '> A quote,\n> wrapped.\n>\n> [d]: https://example.com/docs "The docs"',
    'The end.',
  ]
    .join('\n\n')
    .concat('\n');

  /** Read `text`, type `typed` after `after`, and write it back with the source. */
  function save(text: string, after: string, typed: string): string {
    const { doc, source } = parser.parseWithSource(text);
    expect(source).not.toBeNull();
    expect(linkOn(text, 'the docs')).toEqual(DOCS);
    return serializer.serialize(typeAfter(doc, after, typed), source);
  }

  it('is not written away by an edit in its list: the link elsewhere keeps its address', () => {
    const written = save(IN_LIST, 'two', ', edited');

    expect(written).toContain('two, edited');
    expect(linkOn(written, 'the docs')).toEqual(DOCS);
    // Written whole, as before the source was kept: the link carries its address.
    expect(written).toContain('[the docs](https://example.com/docs "The docs")');
  });

  it('is not written away by an edit in its quote: the link elsewhere keeps its address', () => {
    const written = save(IN_QUOTE, 'A quote,', ' edited,');

    expect(written).toContain('A quote, edited,');
    expect(linkOn(written, 'the docs')).toEqual(DOCS);
  });

  it('stays in its block, and every other block keeps its text, when the edit is elsewhere', () => {
    expect(save(IN_LIST, 'The end', ', edited')).toBe(
      IN_LIST.replace('The end.', 'The end, edited.')
    );
    expect(save(IN_QUOTE, 'The end', ', edited')).toBe(
      IN_QUOTE.replace('The end.', 'The end, edited.')
    );
  });

  it('goes with its list, the rest kept, when a definition between blocks says the same', () => {
    const text = `${IN_LIST}\n[d]: https://example.com/docs "The docs"\n`;
    const written = save(text, 'two', ', edited');

    expect(written).toBe(text.replace(NESTED_IN_LIST, '- one\n- two, edited'));
    expect(linkOn(written, 'the docs')).toEqual(DOCS);
  });
});

describe('alignBlocks', () => {
  const blocks = (...texts: string[]): Node[] => texts.map(paragraph);

  it('pairs the equal blocks at each end and the longest run between', () => {
    const before = blocks('a', 'b', 'c', 'd', 'e');
    const after = [before[0], paragraph('x'), before[2], paragraph('y'), before[4]];

    expect(alignBlocks(before, after)).toEqual([
      [0, 0],
      [2, 2],
      [4, 4],
    ]);
  });

  it('pairs through an insert and a delete', () => {
    const before = blocks('a', 'b', 'c', 'd');
    const after = [before[0], paragraph('new'), before[1], before[3]];

    expect(alignBlocks(before, after)).toEqual([
      [0, 0],
      [1, 2],
      [3, 3],
    ]);
  });

  it('pairs nothing when nothing is left', () => {
    expect(alignBlocks(blocks('a', 'b'), blocks('x'))).toEqual([]);
    expect(alignBlocks([], blocks('x'))).toEqual([]);
  });
});
