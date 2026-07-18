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

    expect(rendered).toBe(
      `<doc>
  <title>A &amp; B</title>
  <summary>&lt;strong&gt;safe text&lt;/strong&gt;</summary>
</doc>
`,
    );
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

    expect(rendered).toBe(`# Draft

`);
  });

  it('renders nested and adjacent conditionals exactly once', () => {
    const parsed = parseXmdl(`---
title: Nested
version: 0.1.0
outputFileType: markdown
params:
  - name: outer
    type: bool
  - name: inner
    type: bool
  - name: value
    type: string
---
A{{#if outer}}B{{#if inner}}C{{value}}D{{/if}}E{{/if}}{{#if inner}}F{{/if}}G`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(renderXmdl(parsed.document, { outer: true, inner: true, value: 'X' })).toBe('ABCXDEFG');
    expect(renderXmdl(parsed.document, { outer: true, inner: false, value: 'X' })).toBe('ABEG');
    expect(renderXmdl(parsed.document, { outer: false, inner: true, value: 'X' })).toBe('AFG');
  });

  it('renders empty and adjacent conditional blocks without leaking content', () => {
    const parsed = parseXmdl(`---
title: Adjacent
version: 0.1.0
outputFileType: markdown
params:
  - name: first
    type: bool
  - name: second
    type: bool
---
A{{#if first}}{{/if}}{{#if second}}B{{/if}}C`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(renderXmdl(parsed.document, { first: true, second: true })).toBe('ABC');
    expect(renderXmdl(parsed.document, { first: false, second: false })).toBe('AC');
  });
});
