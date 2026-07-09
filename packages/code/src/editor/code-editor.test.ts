import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CodeEditor } from './code-editor';

const waitFor = async (predicate: () => boolean) => {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(predicate()).toBe(true);
};

// These exercise the string contract before the lazy-loaded CodeMirror view exists
// (the element is created but never connected, so no view is built). This is the
// state the host relies on when seeding draft content before the editor hydrates.
describe('CodeEditor content buffering (pre-view)', () => {
  beforeAll(() => {
    // Importing the module registers the element; assert it took.
    expect(customElements.get('code-editor')).toBe(CodeEditor);
  });

  const create = () => document.createElement('code-editor') as CodeEditor;

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('defaults to empty content', () => {
    expect(create().getContent()).toBe('');
  });

  it('returns content set before the view exists', () => {
    const el = create();
    el.setContent('const x = 1;');
    expect(el.getContent()).toBe('const x = 1;');
  });

  it('overwrites buffered content on repeated setContent', () => {
    const el = create();
    el.setContent('first');
    el.setContent('second');
    expect(el.getContent()).toBe('second');
  });

  it('exposes the expected observed attributes', () => {
    expect(CodeEditor.observedAttributes).toEqual(['readonly', 'language', 'keymap-mode']);
  });

  it('defaults to normal keymap mode', () => {
    const el = create();
    expect(el.getKeymapMode()).toBe('normal');
    expect(el.getSupportedKeymapModes()).toEqual(['normal']);
  });

  it('returns unsupported for reserved keymap modes until their packages are wired', () => {
    const el = create();
    const listener = vi.fn();
    el.addEventListener('keymap-mode-change', listener);

    const result = el.setKeymapMode('vim');

    expect(result).toEqual({
      requestedMode: 'vim',
      activeMode: 'normal',
      status: 'unsupported',
      reason: 'not-supported',
    });
    expect(el.getKeymapMode()).toBe('normal');
    expect(el.getAttribute('keymap-mode')).toBe('normal');
    expect(listener).not.toHaveBeenCalled();
  });

  it('normalizes invalid keymap-mode attributes back to the active mode on connect', async () => {
    const el = create();
    el.setAttribute('keymap-mode', 'sublime');

    document.body.append(el);
    await waitFor(() => el.getAttribute('keymap-mode') === 'normal');

    expect(el.getKeymapMode()).toBe('normal');
  });

  it('renders an editable toolbar with only normal enabled', async () => {
    const el = create();

    document.body.append(el);
    await waitFor(() => Boolean(el.shadowRoot?.querySelector('.code-editor-toolbar')));

    const buttons = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.code-editor-keymap-button')
    );
    expect(buttons.map((button) => button.dataset.keymapMode)).toEqual(['normal', 'vim', 'emacs']);
    expect(buttons.map((button) => button.disabled)).toEqual([false, true, true]);
    expect(buttons[0].classList.contains('is-active')).toBe(true);
  });

  it('hides the toolbar and rejects non-normal modes in readonly mode', async () => {
    const el = create();
    el.setAttribute('readonly', 'true');

    document.body.append(el);
    await waitFor(() => Boolean(el.shadowRoot?.querySelector('.code-editor-content')));

    expect(el.shadowRoot?.querySelector('.code-editor-toolbar')).toBeNull();
    expect(el.getSupportedKeymapModes()).toEqual(['normal']);
    expect(el.setKeymapMode('emacs')).toEqual({
      requestedMode: 'emacs',
      activeMode: 'normal',
      status: 'unsupported',
      reason: 'readonly',
    });
  });

  it('dispatches keymap-mode-change only when the active mode changes', () => {
    const el = create();
    const listener = vi.fn();
    el.addEventListener('keymap-mode-change', listener);

    expect(el.setKeymapMode('normal')).toEqual({
      requestedMode: 'normal',
      activeMode: 'normal',
      status: 'applied',
    });

    expect(listener).not.toHaveBeenCalled();
  });
});
