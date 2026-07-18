import { afterEach, describe, expect, it, vi } from 'vitest';

import { XmdlEditor, type XmdlApplyEventDetail } from './xmdl-editor';

const TEMPLATE = `---
title: Brief Template
version: 0.1.0
outputFileType: markdown
params:
  - name: title
    type: string
    required: true
    description: The document title
  - name: includeSummary
    type: bool
    required: false
  - name: tone
    type: enum
    values: [neutral, urgent]
    required: false
  - name: wordCount
    type: number
    required: false
  - name: dueDate
    type: date
    required: false
---
# {{title}}

{{#if includeSummary}}
Summary tone: {{tone}}
{{/if}}

Words: {{wordCount}}
Due: {{dueDate}}
`;

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function mount(content = TEMPLATE): XmdlEditor {
  const el = document.createElement('xmdl-editor') as XmdlEditor;
  el.setContent(content);
  document.body.append(el);
  return el;
}

function button(el: XmdlEditor, label: string): HTMLButtonElement {
  const match = Array.from(el.shadowRoot?.querySelectorAll('button') ?? []).find(
    (candidate) => candidate.textContent === label,
  );
  if (!match) throw new Error(`Button not found: ${label}`);
  return match as HTMLButtonElement;
}

function modeSwitch(el: XmdlEditor): HTMLButtonElement {
  const match = el.shadowRoot?.querySelector<HTMLButtonElement>(
    '.xmdl-editor__mode-toggle[role="switch"]',
  );
  if (!match) throw new Error('Mode switch not found');
  return match;
}

function input(el: XmdlEditor): HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement {
  const match = el.shadowRoot?.querySelector<
    HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement
  >(
    '.xmdl-editor__slot-control textarea, .xmdl-editor__slot-control input, .xmdl-editor__slot-control select',
  );
  if (!match) throw new Error('Slot input not found');
  return match;
}

function setInputValue(
  el: XmdlEditor,
  value: string,
): HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement {
  const control = input(el);
  control.value = value;
  control.dispatchEvent(new Event('input', { bubbles: true }));
  return control;
}

function text(el: XmdlEditor): string {
  return el.shadowRoot?.textContent ?? '';
}

describe('xmdl-editor', () => {
  it('registers the custom element and exposes raw source through EditorElement methods', () => {
    const el = mount();

    expect(customElements.get('xmdl-editor')).toBe(XmdlEditor);
    expect(el.getContent()).toBe(TEMPLATE);
  });

  it('defaults to apply mode with toolbar status and disabled apply action', () => {
    const el = mount();

    expect(text(el)).toContain('0 of 5 Applied');
    expect(text(el)).toContain('Incomplete');
    expect(button(el, 'Apply Template').disabled).toBe(true);
    expect(modeSwitch(el).getAttribute('aria-checked')).toBe('true');
    expect(text(el)).toContain('title');
    expect(text(el)).toContain('The document title');
  });

  it('applies a required text slot and navigates to the next slot', () => {
    const el = mount();

    setInputValue(el, 'Market Brief');
    button(el, 'Apply').click();
    expect(text(el)).toContain('1 of 5 Applied');
    expect(el.shadowRoot?.querySelector('.xmdl-editor__output-body')?.textContent).toContain(
      '# Market Brief',
    );

    button(el, 'Next').click();
    expect(text(el)).toContain('includeSummary');
  });

  it('supports boolean include/skip and optional enum/number/date decisions', () => {
    const el = mount();

    setInputValue(el, 'Market Brief');
    button(el, 'Apply').click();

    button(el, 'Next').click();
    button(el, 'Include').click();
    expect(text(el)).toContain('2 of 5 Applied');

    button(el, 'Next').click();
    setInputValue(el, 'urgent');
    button(el, 'Apply').click();

    button(el, 'Next').click();
    setInputValue(el, '500');
    button(el, 'Apply').click();

    button(el, 'Next').click();
    setInputValue(el, '2026-08-01');
    button(el, 'Apply').click();

    expect(button(el, 'Apply Template').disabled).toBe(false);
    const output = el.shadowRoot?.querySelector('.xmdl-editor__output-body')?.textContent ?? '';
    expect(output).toContain('Summary tone: urgent');
    expect(output).toContain('Words: 500');
    expect(output).toContain('Due: 2026-08-01');
  });

  it('allows optional values and conditionals to be skipped', () => {
    const el = mount();

    setInputValue(el, 'Market Brief');
    button(el, 'Apply').click();

    button(el, 'Next').click();
    button(el, 'Skip').click();

    button(el, 'Next').click();
    button(el, 'Skip').click();

    button(el, 'Next').click();
    button(el, 'Skip').click();

    button(el, 'Next').click();
    button(el, 'Skip').click();

    expect(button(el, 'Apply Template').disabled).toBe(false);
    expect(el.shadowRoot?.querySelector('.xmdl-editor__output-body')?.textContent).not.toContain(
      'Summary tone:',
    );
  });

  it('treats both required boolean choices as completed applied decisions', () => {
    const requiredBool = `---
title: Required Bool
version: 0.1.0
outputFileType: markdown
params:
  - name: show
    type: bool
    required: true
---
A{{#if show}}B{{/if}}C`;
    const included = mount(requiredBool);
    button(included, 'Include').click();
    expect(text(included)).toContain('1 of 1 Applied');
    expect(button(included, 'Apply Template').disabled).toBe(false);
    expect(included.shadowRoot?.querySelector('.xmdl-editor__output-body')?.textContent).toBe(
      'ABC',
    );

    const excluded = mount(requiredBool);
    button(excluded, 'Exclude').click();
    expect(text(excluded)).toContain('1 of 1 Applied');
    expect(button(excluded, 'Apply Template').disabled).toBe(false);
    expect(excluded.shadowRoot?.querySelector('.xmdl-editor__output-body')?.textContent).toBe('AC');
  });

  it('emits an apply event with rendered output metadata', () => {
    const el = mount();
    let detail: XmdlApplyEventDetail | undefined;
    el.addEventListener('xmdl-apply', (event) => {
      detail = (event as CustomEvent<XmdlApplyEventDetail>).detail;
    });

    setInputValue(el, 'Market Brief');
    button(el, 'Apply').click();
    for (let i = 0; i < 4; i += 1) {
      button(el, 'Next').click();
      button(el, 'Skip').click();
    }
    button(el, 'Apply Template').click();

    expect(detail?.title).toBe('Brief Template');
    expect(detail?.outputFileType).toBe('markdown');
    expect(detail?.output).toContain('# Market Brief');
  });

  it('keeps raw edits as source content and emits content-change', () => {
    const el = mount();
    let changes = 0;
    el.addEventListener('content-change', () => {
      changes += 1;
    });

    modeSwitch(el).click();
    expect(modeSwitch(el).getAttribute('aria-checked')).toBe('false');
    const source = el.shadowRoot?.querySelector<HTMLTextAreaElement>('.xmdl-editor__source');
    if (!source) throw new Error('Raw source textarea not found');
    source.value = TEMPLATE.replace('Brief Template', 'Edited Template');
    source.dispatchEvent(new Event('input', { bubbles: true }));

    expect(changes).toBe(1);
    expect(el.getContent()).toContain('Edited Template');

    modeSwitch(el).click();
    expect(text(el)).toContain('Edited Template');
    expect(text(el)).toContain('0 of 5 Applied');
    expect(modeSwitch(el).getAttribute('aria-checked')).toBe('true');
  });

  it('preserves applied, skipped, pending, and active state across an unchanged mode round trip', () => {
    const el = mount();

    setInputValue(el, 'Market Brief');
    button(el, 'Apply').click();
    button(el, 'Next').click();
    button(el, 'Skip').click();
    button(el, 'Next').click();
    setInputValue(el, 'urgent');

    modeSwitch(el).click();
    modeSwitch(el).click();

    expect(text(el)).toContain('2 of 5 Applied');
    expect(text(el)).toContain('tone');
    expect(input(el).value).toBe('urgent');
    expect(el.shadowRoot?.querySelector('.xmdl-editor__output-body')?.textContent).toContain(
      '# Market Brief',
    );
  });

  it('preserves compatible decisions after raw source edits', () => {
    const el = mount();
    setInputValue(el, 'Market Brief');
    button(el, 'Apply').click();

    modeSwitch(el).click();
    const source = el.shadowRoot?.querySelector<HTMLTextAreaElement>('.xmdl-editor__source');
    if (!source) throw new Error('Raw source textarea not found');
    source.value = TEMPLATE.replace('Brief Template', 'Edited Template');
    source.dispatchEvent(new Event('input', { bubbles: true }));
    modeSwitch(el).click();

    expect(text(el)).toContain('Edited Template');
    expect(text(el)).toContain('1 of 5 Applied');
    expect(input(el).value).toBe('Market Brief');
  });

  it('does not reset Apply state when identical content is set again', () => {
    const el = mount();
    setInputValue(el, 'Market Brief');
    button(el, 'Apply').click();

    el.setContent(TEMPLATE);

    expect(text(el)).toContain('1 of 5 Applied');
    expect(input(el).value).toBe('Market Brief');
  });

  it('warns before an incompatible raw edit discards user work', () => {
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const el = mount();
    setInputValue(el, 'Market Brief');
    button(el, 'Apply').click();

    modeSwitch(el).click();
    const source = el.shadowRoot?.querySelector<HTMLTextAreaElement>('.xmdl-editor__source');
    if (!source) throw new Error('Raw source textarea not found');
    source.value = TEMPLATE.replace(
      'name: title\n    type: string',
      'name: title\n    type: number',
    );
    source.dispatchEvent(new Event('input', { bubbles: true }));

    modeSwitch(el).click();
    expect(modeSwitch(el).getAttribute('aria-checked')).toBe('false');
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('“title”'));

    modeSwitch(el).click();
    expect(modeSwitch(el).getAttribute('aria-checked')).toBe('true');
    expect(text(el)).toContain('0 of 5 Applied');
    expect(input(el).value).toBe('');
  });

  it('retains Apply state while invalid raw source is repaired', () => {
    const el = mount();
    setInputValue(el, 'Market Brief');
    button(el, 'Apply').click();

    modeSwitch(el).click();
    let source = el.shadowRoot?.querySelector<HTMLTextAreaElement>('.xmdl-editor__source');
    if (!source) throw new Error('Raw source textarea not found');
    source.value = 'not xmdl';
    source.dispatchEvent(new Event('input', { bubbles: true }));
    modeSwitch(el).click();
    expect(text(el)).toContain('Invalid XMDL');

    modeSwitch(el).click();
    source = el.shadowRoot?.querySelector<HTMLTextAreaElement>('.xmdl-editor__source');
    if (!source) throw new Error('Raw source textarea not found');
    source.value = TEMPLATE;
    source.dispatchEvent(new Event('input', { bubbles: true }));
    modeSwitch(el).click();

    expect(text(el)).toContain('1 of 5 Applied');
    expect(input(el).value).toBe('Market Brief');
  });

  it('renders parse errors in apply mode', () => {
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
    expect(button(el, 'Apply Template').disabled).toBe(true);
  });

  it('uses a registered code-editor element for raw editing when available', () => {
    if (!customElements.get('code-editor')) {
      customElements.define(
        'code-editor',
        class CodeEditorStub extends HTMLElement {
          private value = '';

          setContent(content: string): void {
            this.value = content;
          }

          getContent(): string {
            return this.value;
          }
        },
      );
    }

    const el = mount();
    modeSwitch(el).click();

    const rawEditor = el.shadowRoot?.querySelector('code-editor') as
      (HTMLElement & { setContent(content: string): void }) | null;
    expect(rawEditor).not.toBeNull();

    rawEditor?.setContent(TEMPLATE.replace('Brief Template', 'Code Editor Template'));
    rawEditor?.dispatchEvent(new CustomEvent('content-change', { bubbles: true }));

    expect(el.getContent()).toContain('Code Editor Template');
  });
});
