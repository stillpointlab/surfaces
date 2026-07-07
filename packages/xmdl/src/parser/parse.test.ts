import { describe, expect, it } from 'vitest';

import { parseXmdl } from './parse';

const XML_TEMPLATE = `---
title: Simple Market Analysis
version: 0.1.0
outputFileType: xml
outputContextType: spl:market-analysis
extraTopLevel: ignored
params:
  - name: reportTitle
    type: string
    required: true
    description: Human-readable title
  - name: includeDrivers
    type: bool
    required: false
  - name: driverTone
    type: enum
    values: [neutral, urgent]
validation:
  outputSchemaRef: schemas/spl-market-analysis.xsd
---
<spl:market-analysis>
  <spl:title>{{reportTitle}}</spl:title>
  {{#if includeDrivers}}
  <spl:drivers tone="{{driverTone}}">Drivers</spl:drivers>
  {{/if}}
</spl:market-analysis>
`;

describe('parseXmdl', () => {
  it('parses a valid XML template with params, warnings, placeholders, and conditionals', () => {
    const result = parseXmdl(XML_TEMPLATE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.title).toBe('Simple Market Analysis');
    expect(result.document.outputFileType).toBe('xml');
    expect(result.document.outputContextType).toBe('spl:market-analysis');
    expect(result.document.validation?.outputSchemaRef).toBe('schemas/spl-market-analysis.xsd');
    expect(result.document.params.map((param) => param.name)).toEqual([
      'reportTitle',
      'includeDrivers',
      'driverTone',
    ]);
    expect(result.document.placeholders.map((ref) => ref.name)).toEqual([
      'reportTitle',
      'driverTone',
    ]);
    expect(result.document.conditionals.map((ref) => ref.name)).toEqual(['includeDrivers']);
    expect(result.warnings).toEqual([
      {
        code: 'xmdl.frontmatter.unknownKey',
        message: 'Unknown XMDL key "extraTopLevel" will be ignored.',
        path: 'extraTopLevel',
      },
    ]);
  });

  it('treats a second frontmatter-looking block as Markdown template body', () => {
    const result = parseXmdl(`---
title: Brief Template
version: 0.1.0
outputFileType: markdown
params:
  - name: title
    type: string
    required: true
---
---
title: "{{title}}"
status: draft
---

# {{title}}
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.body.startsWith('---\ntitle: "{{title}}"')).toBe(true);
    expect(result.document.placeholders.map((ref) => ref.name)).toEqual(['title', 'title']);
  });

  it('fails when frontmatter is missing', () => {
    const result = parseXmdl('# Not XMDL\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors[0].code).toBe('xmdl.frontmatter.required');
  });

  it('fails when the body references an undeclared param', () => {
    const result = parseXmdl(`---
title: Bad Template
version: 0.1.0
outputFileType: markdown
params:
  - name: title
    type: string
    required: true
---
# {{missingTitle}}
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors).toContainEqual({
      code: 'xmdl.body.undeclaredReference',
      message: 'Template body references undeclared param "missingTitle".',
      path: 'body@2',
    });
  });

  it('fails on malformed conditionals', () => {
    const result = parseXmdl(`---
title: Bad Conditional
version: 0.1.0
outputFileType: markdown
params:
  - name: includeSummary
    type: bool
---
{{#if includeSummary}}Summary
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors[0].code).toBe('xmdl.body.unclosedConditional');
  });

  it('fails on duplicate params', () => {
    const result = parseXmdl(`---
title: Duplicate Param
version: 0.1.0
outputFileType: markdown
params:
  - name: title
    type: string
  - name: title
    type: string
---
{{title}}
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors).toContainEqual({
      code: 'xmdl.param.duplicateName',
      message: 'Param name "title" is declared more than once.',
      path: 'params.1.name',
    });
  });

  it('fails when enum params do not declare values', () => {
    const result = parseXmdl(`---
title: Enum Param
version: 0.1.0
outputFileType: markdown
params:
  - name: tone
    type: enum
---
{{tone}}
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors).toContainEqual({
      code: 'xmdl.param.enumValuesRequired',
      message: 'Enum param "tone" must declare at least one allowed value.',
      path: 'params.0.values',
    });
  });

  it('fails on unsupported template syntax', () => {
    const result = parseXmdl(`---
title: Unsupported Syntax
version: 0.1.0
outputFileType: markdown
params:
  - name: title
    type: string
---
{{#each title}}{{/each}}
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors.map((error) => error.code)).toContain('xmdl.body.unsupportedSyntax');
  });
});
