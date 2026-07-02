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

describe('Code block round trips', () => {
  it('preserves fenced code blocks with leading spaces before the fence', () => {
    const markdown = `   \`\`\`ts
const value = true;
   \`\`\``;

    const doc = markdownParser.parse(markdown);
    const serialized = markdownSerializer.serialize(doc);
    const reparsed = markdownParser.parse(serialized);
    const reserialized = markdownSerializer.serialize(reparsed);

    expect(serialized).toBe('```ts\nconst value = true;\n```');
    expect(reserialized).toBe(serialized);
  });

  it('uses a longer fence when code content contains triple backticks', () => {
    const markdown = `    \`\`\`
    const value = true;
    \`\`\``;

    const doc = markdownParser.parse(markdown);
    const serialized = markdownSerializer.serialize(doc);
    const reparsed = markdownParser.parse(serialized);
    const reserialized = markdownSerializer.serialize(reparsed);

    expect(serialized).toBe('````\n```\nconst value = true;\n```\n````');
    expect(reserialized).toBe(serialized);
  });

  it('preserves fenced code blocks nested under bullet list items', () => {
    const markdown = `- Example
  \`\`\`ts
  const value = true;
  \`\`\``;

    const doc = markdownParser.parse(markdown);
    const json = doc.toJSON();
    const serialized = markdownSerializer.serialize(doc);
    const reparsed = markdownParser.parse(serialized);
    const reserialized = markdownSerializer.serialize(reparsed);

    expect(json.content?.[0]?.type).toBe('bullet_list');
    expect(json.content?.[0]?.content?.[0]?.content?.[1]?.type).toBe('code_block');
    expect(serialized).toBe('* Example\n\n  ```ts\n  const value = true;\n  ```');
    expect(reserialized).toBe(serialized);
  });

  it('preserves four-space indented fenced code blocks under bullet list items', () => {
    const markdown = `- Example
    \`\`\`ts
    const value = true;
    \`\`\``;

    const doc = markdownParser.parse(markdown);
    const json = doc.toJSON();
    const serialized = markdownSerializer.serialize(doc);
    const reparsed = markdownParser.parse(serialized);
    const reserialized = markdownSerializer.serialize(reparsed);

    expect(json.content?.[0]?.type).toBe('bullet_list');
    expect(json.content?.[0]?.content?.[0]?.content?.[1]?.type).toBe('code_block');
    expect(serialized).toBe('* Example\n\n  ```ts\n  const value = true;\n  ```');
    expect(reserialized).toBe(serialized);
  });
});
