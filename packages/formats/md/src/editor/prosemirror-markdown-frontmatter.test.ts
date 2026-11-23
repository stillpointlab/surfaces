import { Fragment } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';

import { getMarkdownParser, getMarkdownSerializer } from './prosemirror-markdown';

import type { Node } from 'prosemirror-model';

const parser = getMarkdownParser();
const serializer = getMarkdownSerializer();

const nodeTypes = (doc: Node): string[] => {
  const types: string[] = [];
  doc.descendants((node) => {
    types.push(node.type.name);
  });
  return types;
};

/** Parse → serialize → reparse → reserialize; both outputs must agree. */
const roundTrip = (markdown: string): { doc: Node; serialized: string } => {
  const doc = parser.parse(markdown);
  const serialized = serializer.serialize(doc);
  const reparsed = parser.parse(serialized);
  const reserialized = serializer.serialize(reparsed);
  expect(reserialized).toBe(serialized);
  return { doc, serialized };
};

describe('frontmatter round trips', () => {
  it('parses a leading block into a frontmatter node instead of hr + setext heading', () => {
    const { doc } = roundTrip('---\ncolumn: briefed\n---\n\n# Title\n\nBody text.');

    expect(doc.firstChild?.type.name).toBe('frontmatter');
    expect(doc.firstChild?.textContent).toBe('column: briefed');
    const types = nodeTypes(doc);
    expect(types).not.toContain('horizontal_rule');
    expect(types.filter((t) => t === 'frontmatter')).toHaveLength(1);
    // The historical corruption turned the block into `## column: briefed`.
    doc.descendants((node) => {
      if (node.type.name === 'heading') {
        expect(node.textContent).not.toBe('column: briefed');
      }
    });
  });

  it('round-trips an untouched block byte-identically', () => {
    const input = '---\ncolumn: briefed\n---\n\n# Title\n\nBody text.';
    const { serialized } = roundTrip(input);
    expect(serialized).toBe(input);
  });

  it('round-trips an empty block byte-identically', () => {
    const input = '---\n---\nBody text.';
    const { doc, serialized } = roundTrip(input);
    expect(doc.firstChild?.type.name).toBe('frontmatter');
    expect(doc.firstChild?.textContent).toBe('');
    expect(serialized).toBe(input);
  });

  it('round-trips a CRLF block byte-identically', () => {
    const input = '---\r\na: 1\r\nb: 2\r\n---\r\n\r\nBody text.';
    const { doc, serialized } = roundTrip(input);
    // The node's editable text is LF-normalized; the bytes are not.
    expect(doc.firstChild?.textContent).toBe('a: 1\nb: 2');
    expect(serialized).toBe(input);
  });

  it('round-trips a block that ends the file without a trailing newline', () => {
    const input = '---\ncolumn: briefed\n---';
    const { serialized } = roundTrip(input);
    expect(serialized).toBe(input);
  });

  it('round-trips a block with no blank line before the body byte-identically', () => {
    const input = '---\ncolumn: briefed\n---\nBody text.';
    const { serialized } = roundTrip(input);
    expect(serialized).toBe(input);
  });

  it('keeps a garbage-YAML block as opaque text without eating the document', () => {
    const input = '---\n{{{ not yaml\ncolumn: briefed\n---\n\nBody text.';
    const { doc, serialized } = roundTrip(input);
    expect(doc.firstChild?.type.name).toBe('frontmatter');
    expect(doc.firstChild?.textContent).toBe('{{{ not yaml\ncolumn: briefed');
    expect(serialized).toBe(input);
  });

  it('still parses a mid-document --- as a thematic break', () => {
    const { doc } = roundTrip('Body one\n\n---\n\nBody two');
    expect(nodeTypes(doc)).toContain('horizontal_rule');
    expect(nodeTypes(doc)).not.toContain('frontmatter');
  });

  it('leaves documents without frontmatter untouched', () => {
    const input = '# Title\n\nSome **bold** text.';
    const { doc, serialized } = roundTrip(input);
    expect(doc.firstChild?.type.name).toBe('heading');
    expect(serialized).toBe(input);
  });

  it('serializes an edited block canonically, keeping the blank-line separation', () => {
    const doc = parser.parse('---\ncolumn: briefed\n---\n\nBody text.');
    const fm = doc.firstChild!;
    const edited = fm.type.create(fm.attrs, parser.schema.text('column: done'));
    const editedDoc = doc.copy(doc.content.replaceChild(0, edited));

    expect(serializer.serialize(editedDoc)).toBe('---\ncolumn: done\n---\n\nBody text.');
  });

  it('serializes a normalized CRLF block canonically once edited', () => {
    const doc = parser.parse('---\r\ncolumn: briefed\r\n---\r\n\r\nBody text.');
    const fm = doc.firstChild!;
    const edited = fm.type.create(fm.attrs, parser.schema.text('column: done'));
    const editedDoc = doc.copy(doc.content.replaceChild(0, edited));

    // Edited blocks emit the canonical LF form; the original CRLF separator
    // blank line is preserved as-is.
    expect(serializer.serialize(editedDoc)).toBe('---\ncolumn: done\n---\n\r\nBody text.');
  });

  it('serializes a programmatically created node (no original bytes) canonically', () => {
    const { schema } = parser;
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.frontmatter.create(null, schema.text('a: 1')),
      schema.nodes.paragraph.create(null, schema.text('Body text.')),
    ]);

    expect(serializer.serialize(doc)).toBe('---\na: 1\n---\nBody text.');
  });

  it('parses pasted fragments with frontmatter disabled as plain markdown', () => {
    const doc = parser.parse('---\na: 1\n---\n\nBody', { frontmatter: false });

    expect(doc.firstChild?.type.name).toBe('horizontal_rule');
    expect(nodeTypes(doc)).not.toContain('frontmatter');
  });

  it('treats a second --- block in the body as content, not frontmatter', () => {
    const input = '---\na: 1\n---\n---\nb: 2\n---\n\nBody';
    const doc = parser.parse(input);

    expect(doc.firstChild?.type.name).toBe('frontmatter');
    expect(doc.firstChild?.textContent).toBe('a: 1');
    expect(nodeTypes(doc).filter((t) => t === 'frontmatter')).toHaveLength(1);
    expect(nodeTypes(doc)).toContain('horizontal_rule');
  });
});

describe('a rule that becomes the first block', () => {
  /** Read `text` as the editor loads it, change its blocks, and save it with its source. */
  function save(text: string, change: (blocks: Node[]) => Node[]): string {
    const { doc, source } = parser.parseWithSource(text);
    expect(source).not.toBeNull();
    const blocks: Node[] = [];
    doc.forEach((node) => blocks.push(node));
    return serializer.serialize(doc.copy(Fragment.fromArray(change(blocks))), source);
  }
  const withoutFirst = (blocks: Node[]): Node[] => blocks.slice(1);

  /** Each top-level block of `text` read as the editor loads it: its type and its text. */
  const blocksOf = (text: string): string[] => {
    const blocks: string[] = [];
    parser.parseWithSource(text).doc.forEach((node) => {
      blocks.push(`${node.type.name}:${node.textContent}`);
    });
    return blocks;
  };

  it('is written `***`, so the next load shows every block, not frontmatter', () => {
    const text = 'Above the rule.\n\n---\n\nFirst after.\n\nA heading\n---\n\nLast.\n';
    const written = save(text, withoutFirst);

    expect(written).toBe('***\n\nFirst after.\n\nA heading\n---\n\nLast.\n');
    expect(blocksOf(written)).toEqual([
      'horizontal_rule:',
      'paragraph:First after.',
      'heading:A heading',
      'paragraph:Last.',
    ]);
  });

  it('is written `***` when a later `---` rule would close the block', () => {
    const text = 'Above.\n\n---\n\nMiddle.\n\n---\n\nEnd.\n';
    const written = save(text, withoutFirst);

    expect(written).toBe('***\n\nMiddle.\n\n---\n\nEnd.\n');
    expect(blocksOf(written)).toEqual([
      'horizontal_rule:',
      'paragraph:Middle.',
      'horizontal_rule:',
      'paragraph:End.',
    ]);
  });

  it('keeps its line breaks: CRLF', () => {
    const text = 'Above.\r\n\r\n---\r\n\r\nMiddle.\r\n\r\n---\r\n\r\nEnd.\r\n';

    expect(save(text, withoutFirst)).toBe('***\r\n\r\nMiddle.\r\n\r\n---\r\n\r\nEnd.\r\n');
  });

  it('that was first already is written `***` once an edit adds a `---` after it', () => {
    const text = '---\n\nText.\n';
    expect(blocksOf(text)[0]).toBe('horizontal_rule:');
    const rule = parser.schema.nodes.horizontal_rule.create();
    const written = save(text, (blocks) => [...blocks, rule]);

    expect(written).toBe('***\n\nText.\n\n---\n');
    expect(blocksOf(written)).toEqual(['horizontal_rule:', 'paragraph:Text.', 'horizontal_rule:']);
  });

  it('that was first already keeps its text while nothing would close it', () => {
    const text = '---\n\nText.\n';
    const edited = parser.schema.nodes.paragraph.create(null, parser.schema.text('Edited.'));

    expect(save(text, (blocks) => [blocks[0], edited])).toBe('---\n\nEdited.\n');
    expect(save('Above.\n\n---\n', withoutFirst)).toBe('---\n');
  });

  it('keeps its text when it could not open frontmatter: `- - -`, `___`, `----`', () => {
    for (const rule of ['- - -', '___', '----', '***']) {
      const text = `Above.\n\n${rule}\n\nMiddle.\n\n---\n\nEnd.\n`;
      const written = save(text, withoutFirst);

      expect(written).toBe(`${rule}\n\nMiddle.\n\n---\n\nEnd.\n`);
      expect(blocksOf(written)[0]).toBe('horizontal_rule:');
    }
  });

  it('under a real frontmatter block is left as it is', () => {
    const text = '---\na: 1\n---\n\nAbove.\n\n---\n\nMiddle.\n\n---\n\nEnd.\n';
    const written = save(text, (blocks) => blocks.filter((_, index) => index !== 1));

    expect(written).toBe('---\na: 1\n---\n\n---\n\nMiddle.\n\n---\n\nEnd.\n');
    expect(blocksOf(written)).toEqual([
      'frontmatter:a: 1',
      'horizontal_rule:',
      'paragraph:Middle.',
      'horizontal_rule:',
      'paragraph:End.',
    ]);
  });

  it('is written `***` by a document written whole, with no source', () => {
    const { schema } = parser;
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.horizontal_rule.create(),
      schema.nodes.paragraph.create(null, schema.text('Text.')),
      schema.nodes.horizontal_rule.create(),
    ]);

    expect(serializer.serialize(doc)).toBe('***\n\nText.\n\n---');
  });

  it('leaves an empty document empty', () => {
    expect(serializer.serialize(parser.parse(''))).toBe('');
    expect(save('Only.\n', () => [])).toBe('');
  });
});
