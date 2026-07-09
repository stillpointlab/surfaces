import { afterEach, describe, expect, it } from 'vitest';

import { XmdlPreview } from './xmdl-preview';

const VALID_TEMPLATE = `---
title: Market Template
version: 0.1.0
outputFileType: xml
outputContextType: spl:market-analysis
extraKey: ignored
params:
  - name: reportTitle
    type: string
    required: true
    description: Human-readable title
  - name: tone
    type: enum
    values: [neutral, urgent]
  - name: includeDrivers
    type: bool
validation:
  outputSchemaRef: schemas/market.xsd
---
<doc>
  <title>{{reportTitle}}</title>
  {{#if includeDrivers}}
  <drivers tone="{{tone}}">Drivers</drivers>
  {{/if}}
</doc>
`;

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(content: string): XmdlPreview {
  const el = document.createElement('xmdl-preview') as XmdlPreview;
  el.setContent(content);
  document.body.append(el);
  return el;
}

function text(el: XmdlPreview): string {
  return el.shadowRoot?.textContent ?? '';
}

describe('xmdl-preview', () => {
  it('registers the custom element', () => {
    expect(customElements.get('xmdl-preview')).toBe(XmdlPreview);
  });

  it('renders metadata and validation for a valid template', () => {
    const el = mount(VALID_TEMPLATE);

    expect(text(el)).toContain('Market Template');
    expect(text(el)).toContain('0.1.0');
    expect(text(el)).toContain('xml');
    expect(text(el)).toContain('spl:market-analysis');
    expect(text(el)).toContain('schemas/market.xsd');
  });

  it('renders params in declaration order with details', () => {
    const el = mount(VALID_TEMPLATE);
    const params = [...(el.shadowRoot?.querySelectorAll('.xmdl-preview__param') ?? [])];

    expect(params.map((param) => param.textContent)).toEqual([
      expect.stringContaining('reportTitle'),
      expect.stringContaining('tone'),
      expect.stringContaining('includeDrivers'),
    ]);
    expect(params[0].textContent).toContain('required');
    expect(params[0].textContent).toContain('Human-readable title');
    expect(params[1].textContent).toContain('Options: neutral, urgent');
  });

  it('renders params in an expanded collapsible section', () => {
    const el = mount(VALID_TEMPLATE);
    const section = el.shadowRoot?.querySelector<HTMLDetailsElement>(
      'details[aria-labelledby="xmdl-preview-params-title"]',
    );
    const style = el.shadowRoot?.querySelector('style')?.textContent ?? '';

    expect(section?.open).toBe(true);
    expect(section?.querySelector('summary')?.textContent).toContain('Params');
    expect(section?.querySelectorAll('.xmdl-preview__param')).toHaveLength(3);
    expect(style).toContain('.xmdl-preview__section-summary::before');
    expect(style).toContain('border-width:.45rem 0 .45rem .675rem');
    expect(style).toContain('details[open]>.xmdl-preview__section-summary::before');

    section!.open = false;
    expect(section?.open).toBe(false);
  });

  it('hides empty validation sections without reserving preview grid space', () => {
    const el = mount(
      VALID_TEMPLATE.replace(/validation:\n  outputSchemaRef: schemas\/market\.xsd\n/, ''),
    );
    const validation = el.shadowRoot?.querySelector<HTMLElement>(
      'section[aria-label="Validation"]',
    );
    const style = el.shadowRoot?.querySelector('style')?.textContent ?? '';

    expect(validation?.hidden).toBe(true);
    expect(style).toContain('.xmdl-preview__section[hidden]{display:none}');
  });

  it('renders warnings for ignored unknown keys', () => {
    const el = mount(VALID_TEMPLATE);
    const warnings = el.shadowRoot?.querySelector('.xmdl-preview__messages');

    expect(warnings?.textContent).toContain('Unknown XMDL key "extraKey" will be ignored.');
  });

  it('marks placeholders and conditionals in the body preview', () => {
    const el = mount(VALID_TEMPLATE);
    const placeholders = Array.from(
      el.shadowRoot?.querySelectorAll<HTMLElement>('.xmdl-preview__token--placeholder') ?? [],
    );
    const conditionals = Array.from(
      el.shadowRoot?.querySelectorAll<HTMLElement>('.xmdl-preview__token--conditional') ?? [],
    );

    expect(placeholders.map((node) => node.textContent)).toEqual(['{{reportTitle}}', '{{tone}}']);
    expect(conditionals.map((node) => node.textContent)).toEqual([
      '{{#if includeDrivers}}',
      '{{/if}}',
    ]);
  });

  it('renders parse errors and raw source for an invalid template', () => {
    const el = mount(`---
title: Broken
version: 0.1.0
outputFileType: markdown
params:
  - name: title
    type: string
---
# {{missing}}
`);

    expect(text(el)).toContain('Invalid XMDL');
    expect(text(el)).toContain('Template body references undeclared param "missing".');
    expect(el.shadowRoot?.querySelector('.xmdl-preview__messages--error')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('.xmdl-preview__body')?.textContent).toContain(
      '# {{missing}}',
    );
  });

  it('buffers content set before connect', () => {
    const el = document.createElement('xmdl-preview') as XmdlPreview;
    el.setContent(VALID_TEMPLATE);
    document.body.append(el);

    expect(text(el)).toContain('Market Template');
  });
});
