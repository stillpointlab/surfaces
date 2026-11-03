import { afterEach, describe, expect, it } from 'vitest';

import './xmdl-editor';

import type { XmdlEditor } from './xmdl-editor';

const TEMPLATE = `---
title: Brief Template
version: 0.1.0
outputFileType: markdown
params:
  - name: title
    type: string
    required: true
  - name: note
    type: string
    required: false
---
# {{title}} {{note}}
`;

afterEach(() => document.body.replaceChildren());

function mount(): XmdlEditor {
  const el = document.createElement('xmdl-editor') as XmdlEditor;
  el.setContent(TEMPLATE);
  document.body.append(el);
  return el;
}

const toolbar = (el: XmdlEditor) =>
  el.shadowRoot!.querySelector<HTMLElement>('.xmdl-editor__toolbar')!;
const buttons = (el: XmdlEditor) => [...toolbar(el).querySelectorAll<HTMLButtonElement>('button')];
const press = (target: HTMLElement, key: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe('xmdl-editor toolbar', () => {
  it('is a labelled toolbar with one tab stop', () => {
    const el = mount();
    expect(toolbar(el).getAttribute('role')).toBe('toolbar');
    expect(toolbar(el).getAttribute('aria-label')).toBe('Template actions');
    expect(buttons(el).filter((button) => button.tabIndex === 0)).toHaveLength(1);
  });

  it('moves focus with arrow keys, Home and End, skipping disabled buttons', () => {
    const el = mount();
    const [previous, next, applyTemplate, modeSwitch] = buttons(el);
    expect(applyTemplate.disabled).toBe(true);

    previous.focus();
    press(previous, 'ArrowRight');
    expect(el.shadowRoot!.activeElement).toBe(next);
    press(next, 'ArrowRight');
    expect(el.shadowRoot!.activeElement).toBe(modeSwitch);
    expect(modeSwitch.tabIndex).toBe(0);
    press(modeSwitch, 'Home');
    expect(el.shadowRoot!.activeElement).toBe(previous);
    press(previous, 'End');
    expect(el.shadowRoot!.activeElement).toBe(modeSwitch);
  });

  it('labels the source toolbar in raw mode and uses the shared switch', () => {
    const el = mount();
    const modeSwitch = el.shadowRoot!.querySelector<HTMLButtonElement>(
      '.xmdl-editor__mode-toggle'
    )!;
    expect(modeSwitch.classList.contains('spl-switch')).toBe(true);
    modeSwitch.click();
    expect(toolbar(el).getAttribute('aria-label')).toBe('Source actions');
  });
});
