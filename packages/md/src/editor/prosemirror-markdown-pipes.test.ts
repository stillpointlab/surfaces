import { describe, expect, it } from 'vitest';

import { getMarkdownParser, getMarkdownSerializer } from './prosemirror-markdown';

const markdownParser = getMarkdownParser();
const markdownSerializer = getMarkdownSerializer();

// In GFM, a literal `|` inside a table cell must be backslash-escaped (`\|`) so
// it isn't read as a column separator — this holds even inside inline code and
// other inline formatting. The serializer is responsible for emitting that
// escape; the parser unescapes it back to a literal pipe. These tests pin that
// round trip (the WYSIWYG ↔ plain-text path), so the cell content survives.
//
// Note: the test inputs use already-escaped pipes (`\|`), which is the only
// well-formed way to put a pipe in a GFM table cell. Feeding an *unescaped*
// pipe inside a table cell is malformed GFM — the table parser splits the row
// on it before inline parsing runs — so that is not a recoverable input.
describe('Table with pipe characters', () => {
  it('should escape pipe characters in table cells', () => {
    const markdown = `| Command | Description |
| --- | --- |
| a \\| b | Use pipe \\| character |
| x \\| y \\| z | Multiple \\| pipes \\| here |`;

    // Parse markdown to ProseMirror document
    const doc = markdownParser.parse(markdown);

    // Serialize back to markdown
    const serialized = markdownSerializer.serialize(doc);

    // Check that pipe characters are escaped with a single backslash
    expect(serialized).toContain('a \\| b');
    expect(serialized).toContain('Use pipe \\| character');
    expect(serialized).toContain('x \\| y \\| z');
    expect(serialized).toContain('Multiple \\| pipes \\| here');

    // Make sure the table structure is preserved
    const lines = serialized.trim().split('\n');
    expect(lines).toHaveLength(4); // Header + separator + 2 data rows

    // Each non-separator line should have exactly 3 unescaped pipes (the column
    // separators): start | middle | end.
    lines.forEach((line, index) => {
      if (index !== 1) {
        // Skip separator line
        const unescapedPipes = line
          .split('')
          .filter((char, i) => char === '|' && (i === 0 || line[i - 1] !== '\\')).length;
        expect(unescapedPipes).toBe(3);
      }
    });
  });

  it('should handle pipes in inline code within table cells', () => {
    const markdown = `| Command | Example |
| --- | --- |
| Pipe | \`echo "a" \\| grep "b"\` |
| Or | \`condition \\|\\| fallback\` |`;

    const doc = markdownParser.parse(markdown);

    // The code spans hold literal pipes once parsed…
    const codeTexts: string[] = [];
    doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === 'code')) {
        codeTexts.push(node.text || '');
      }
    });
    expect(codeTexts).toEqual(['echo "a" | grep "b"', 'condition || fallback']);

    // …and serializing re-escapes them with a single backslash.
    const serialized = markdownSerializer.serialize(doc);
    expect(serialized).toContain('`echo "a" \\| grep "b"`');
    expect(serialized).toContain('`condition \\|\\| fallback`');

    // Round trip: re-parsing the serialized output preserves the code content.
    const roundTripped: string[] = [];
    markdownParser.parse(serialized).descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === 'code')) {
        roundTripped.push(node.text || '');
      }
    });
    expect(roundTripped).toEqual(codeTexts);
  });

  it('should handle pipes with other formatting', () => {
    const markdown = `| Header | Content |
| --- | --- |
| Bold | **a \\| b** text |
| Mixed | *italic \\| text* with \`code \\| here\` |`;

    const doc = markdownParser.parse(markdown);
    const serialized = markdownSerializer.serialize(doc);

    // Formatting is preserved with single-backslash-escaped pipes.
    expect(serialized).toContain('**a \\| b**');
    expect(serialized).toContain('*italic \\| text*');
    expect(serialized).toContain('`code \\| here`');
  });
});
