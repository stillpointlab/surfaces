import { afterEach, describe, expect, it } from 'vitest';

import './code-editor';

import type { CodeEditor } from './code-editor';

afterEach(() => document.body.replaceChildren());

async function mount(readonly = false): Promise<CodeEditor> {
  const el = document.createElement('code-editor') as CodeEditor;
  if (readonly) el.setAttribute('readonly', 'true');
  el.setContent('const a = 1;');
  document.body.append(el);
  await el.whenReady();
  return el;
}

const keymapButtons = (el: CodeEditor) => [
  ...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.code-editor-keymap-button'),
];

describe('code-editor toolbar', () => {
  it('is a labelled toolbar whose tab stop is the active mode', async () => {
    const el = await mount();
    const toolbar = el.shadowRoot!.querySelector('.code-editor-toolbar');
    expect(toolbar?.getAttribute('role')).toBe('toolbar');
    expect(toolbar?.getAttribute('aria-label')).toBe('Editor keyboard mode');
    const [normal, vim] = keymapButtons(el);
    expect(normal.classList.contains('is-active')).toBe(true);
    expect([normal.tabIndex, vim.tabIndex]).toEqual([0, -1]);
  });

  it('moves between modes with the arrow keys', async () => {
    const el = await mount();
    const [normal, vim] = keymapButtons(el);
    normal.focus();
    normal.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    );
    expect(el.shadowRoot!.activeElement).toBe(vim);
    expect([normal.tabIndex, vim.tabIndex]).toEqual([-1, 0]);
  });

  it('has no toolbar while readonly, and CodeMirror marks the content aria-readonly', async () => {
    const el = await mount(true);
    expect(el.shadowRoot!.querySelector('.code-editor-toolbar')).toBeNull();
    expect(el.shadowRoot!.querySelector('.cm-content')?.getAttribute('aria-readonly')).toBe('true');
  });
});
