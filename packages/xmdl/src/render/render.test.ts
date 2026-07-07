import { describe, expect, it } from 'vitest';

import { parseXmdl } from '../parser/parse';

import { renderXmdl } from './render';

describe('renderXmdl', () => {
  it('renders placeholders and included conditionals', () => {
    const parsed = parseXmdl(`---
title: XML Template
version: 0.1.0
outputFileType: xml
params:
  - name: title
    type: string
    required: true
  - name: includeSummary
    type: bool
  - name: summary
    type: string
---
<doc>
  <title>{{title}}</title>
  {{#if includeSummary}}<summary>{{summary}}</summary>{{/if}}
</doc>
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const rendered = renderXmdl(parsed.document, {
      title: 'A & B',
      includeSummary: true,
      summary: '<strong>safe text</strong>',
    });

    expect(rendered).toContain('<title>A &amp; B</title>');
    expect(rendered).toContain('&lt;strong&gt;safe text&lt;/strong&gt;');
  });

  it('omits skipped conditionals and leaves missing values blank', () => {
    const parsed = parseXmdl(`---
title: Markdown Template
version: 0.1.0
outputFileType: markdown
params:
  - name: title
    type: string
  - name: includeNotes
    type: bool
  - name: notes
    type: string
---
# {{title}}
{{#if includeNotes}}
{{notes}}
{{/if}}
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const rendered = renderXmdl(parsed.document, { title: 'Draft' });

    expect(rendered).toContain('# Draft');
    expect(rendered).not.toContain('{{notes}}');
  });
});
