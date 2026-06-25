import { describe, expect, it } from 'vitest';

import { getMarkdownParser, getMarkdownSerializer } from './prosemirror-markdown';

const markdownParser = getMarkdownParser();
const markdownSerializer = getMarkdownSerializer();

describe('Table parsing', () => {
  it('should preserve table content when parsing and serializing', () => {
    const markdown = `| Header 1 | Header 2 |
| --- | --- |
| Cell 1 | Cell 2 |
| Cell 3 | Cell 4 |`;

    // Parse markdown to ProseMirror document
    const doc = markdownParser.parse(markdown);

    // Check that the document has the expected structure
    const json = doc.toJSON();
    expect(json.type).toBe('doc');
    expect(json.content).toHaveLength(1);
    expect(json.content[0].type).toBe('table');

    // Check that table has rows
    const table = json.content[0];
    expect(table.content).toHaveLength(3); // Header row + 2 data rows

    // Check that cells have content
    const firstRow = table.content[0];
    expect(firstRow.type).toBe('table_row');
    expect(firstRow.content).toHaveLength(2); // 2 cells in first row

    // Check that the first cell has content
    const firstCell = firstRow.content[0];
    expect(firstCell.type).toBe('table_header');
    expect(firstCell.content).toHaveLength(1); // Should have a paragraph

    if (firstCell.content && firstCell.content[0]) {
      const paragraph = firstCell.content[0];
      expect(paragraph.type).toBe('paragraph');

      if (paragraph.content && paragraph.content[0]) {
        const text = paragraph.content[0];
        expect(text.type).toBe('text');
        expect(text.text).toBe('Header 1');
      }
    }

    // Serialize back to markdown
    const serialized = markdownSerializer.serialize(doc);

    // Check that content is preserved
    expect(serialized).toContain('Header 1');
    expect(serialized).toContain('Header 2');
    expect(serialized).toContain('Cell 1');
    expect(serialized).toContain('Cell 2');
    expect(serialized).toContain('Cell 3');
    expect(serialized).toContain('Cell 4');
  });
});
