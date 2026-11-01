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
