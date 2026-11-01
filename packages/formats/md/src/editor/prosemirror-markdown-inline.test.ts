import { describe, expect, it } from 'vitest';

import { getMarkdownParser, getMarkdownSerializer } from './prosemirror-markdown';

const markdownParser = getMarkdownParser();
const markdownSerializer = getMarkdownSerializer();

describe('Table with inline markdown', () => {
  it('should preserve inline code in table cells', () => {
    const markdown = `| Header | Description |
| --- | --- |
| \`code\` | Some text with \`inline code\` |
| **bold** | Text with **bold** and *italic* |`;

    // Parse markdown to ProseMirror document
    const doc = markdownParser.parse(markdown);

    // Serialize back to markdown
    const serialized = markdownSerializer.serialize(doc);

    // Check that inline formatting is preserved (not escaped)
    expect(serialized).toContain('`code`');
    expect(serialized).toContain('`inline code`');
    expect(serialized).toContain('**bold**');
    expect(serialized).toContain('*italic*');

    // Make sure backticks are not escaped
    expect(serialized).not.toContain('\\`');
  });

  it('should preserve links in table cells', () => {
    const markdown = `| Name | Link |
| --- | --- |
| Google | [Google](https://google.com) |
| GitHub | [GitHub](https://github.com "GitHub Home") |`;

    const doc = markdownParser.parse(markdown);
    const serialized = markdownSerializer.serialize(doc);

    // Check that links are preserved
    expect(serialized).toContain('[Google](https://google.com)');
    expect(serialized).toContain('[GitHub](https://github.com "GitHub Home")');
  });

  it('should preserve mixed formatting in table cells', () => {
    const markdown = `| Command | Description |
| --- | --- |
| \`npm install\` | Install **all** dependencies |
| \`npm test\` | Run *tests* with ~~strikethrough~~ |`;

    const doc = markdownParser.parse(markdown);
    const serialized = markdownSerializer.serialize(doc);

    // Check that all formatting is preserved
    expect(serialized).toContain('`npm install`');
    expect(serialized).toContain('`npm test`');
    expect(serialized).toContain('**all**');
    expect(serialized).toContain('*tests*');
    expect(serialized).toContain('~~strikethrough~~');
  });
});
