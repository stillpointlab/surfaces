import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CodeEditor } from './code-editor';
import * as keymapLoaders from './keymap-loaders';

import type { EditorView } from '@codemirror/view';

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
  const getView = (el: CodeEditor) => (el as unknown as { view: EditorView | null }).view;
  const dispatchKey = (
    view: EditorView,
    key: string,
    options: KeyboardEventInit = {}
  ): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    view.contentDOM.dispatchEvent(event);
    return event;
  };

  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(el.getSupportedKeymapModes()).toEqual(['normal', 'vim', 'emacs']);
  });

  it('enables vim keymap mode through the loader', async () => {
    const el = create();
    const listener = vi.fn();
    el.addEventListener('keymap-mode-change', listener);

    const result = await el.setKeymapMode('vim');

    expect(result).toEqual({
      requestedMode: 'vim',
      activeMode: 'vim',
      status: 'applied',
    });
    expect(el.getKeymapMode()).toBe('vim');
    expect(el.getAttribute('keymap-mode')).toBe('vim');
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual(result);
  });

  it('returns unsupported when the vim loader fails', async () => {
    const el = create();
    const listener = vi.fn();
    el.addEventListener('keymap-mode-change', listener);
    const load = vi
      .spyOn(keymapLoaders, 'loadVimKeymapExtension')
      .mockRejectedValueOnce(new Error('load failed'));

    const result = await el.setKeymapMode('vim');

    expect(result).toEqual({
      requestedMode: 'vim',
      activeMode: 'normal',
      status: 'unsupported',
      reason: 'load-failed',
    });
    expect(el.getKeymapMode()).toBe('normal');
    expect(el.getAttribute('keymap-mode')).toBe('normal');
    expect(listener).not.toHaveBeenCalled();
    load.mockRestore();
  });

  it('enables emacs keymap mode through first-party shortcuts', async () => {
    const el = create();
    const listener = vi.fn();
    el.addEventListener('keymap-mode-change', listener);

    const result = await el.setKeymapMode('emacs');

    expect(result).toEqual({
      requestedMode: 'emacs',
      activeMode: 'emacs',
      status: 'applied',
    });
    expect(el.getKeymapMode()).toBe('emacs');
    expect(el.getAttribute('keymap-mode')).toBe('emacs');
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual(result);
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
    expect(buttons.map((button) => button.disabled)).toEqual([false, false, false]);
    expect(buttons[0].classList.contains('is-active')).toBe(true);
  });

  it('applies initial keymap-mode="vim" after the editor hydrates', async () => {
    const el = create();
    el.setAttribute('keymap-mode', 'vim');

    document.body.append(el);
    await waitFor(() => el.getKeymapMode() === 'vim');

    const active = el.shadowRoot!.querySelector<HTMLButtonElement>(
      '.code-editor-keymap-button.is-active'
    );
    expect(active?.dataset.keymapMode).toBe('vim');
  });

  it('applies initial keymap-mode="emacs" after the editor hydrates', async () => {
    const el = create();
    el.setAttribute('keymap-mode', 'emacs');

    document.body.append(el);
    await waitFor(() => el.getKeymapMode() === 'emacs');

    const active = el.shadowRoot!.querySelector<HTMLButtonElement>(
      '.code-editor-keymap-button.is-active'
    );
    expect(active?.dataset.keymapMode).toBe('emacs');
  });

  it('gives initial emacs keybindings precedence over default keymaps', async () => {
    const el = create();
    el.setContent('abc\ndef');
    el.setAttribute('keymap-mode', 'emacs');

    document.body.append(el);
    await waitFor(() => el.getKeymapMode() === 'emacs' && Boolean(getView(el)));
    const view = getView(el)!;
    view.dispatch({ selection: { anchor: 2 } });

    const event = dispatchKey(view, 'a', { code: 'KeyA', ctrlKey: true });

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(0);
    expect(event.defaultPrevented).toBe(true);
  });

  it('gives dynamically applied emacs keybindings precedence over default keymaps', async () => {
    const el = create();
    el.setContent('abc\ndef');

    document.body.append(el);
    await waitFor(() => Boolean(getView(el)));
    await el.setKeymapMode('emacs');
    await waitFor(() => el.getKeymapMode() === 'emacs');

    const view = getView(el)!;
    view.dispatch({ selection: { anchor: 2 } });

    const event = dispatchKey(view, 'a', { code: 'KeyA', ctrlKey: true });

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(0);
    expect(event.defaultPrevented).toBe(true);
  });

  it('handles common emacs movement shortcuts and prevents default browser behavior', async () => {
    const el = create();
    el.setContent('one two\nthree');

    document.body.append(el);
    await waitFor(() => Boolean(getView(el)));
    await el.setKeymapMode('emacs');
    const view = getView(el)!;
    const documentShortcut = vi.fn();
    document.addEventListener('keydown', documentShortcut);

    view.dispatch({ selection: { anchor: 1 } });
    expect(dispatchKey(view, 'f', { code: 'KeyF', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(view.state.selection.main.head).toBe(2);
    expect(dispatchKey(view, 'b', { code: 'KeyB', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(view.state.selection.main.head).toBe(1);
    expect(dispatchKey(view, 'e', { code: 'KeyE', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(view.state.selection.main.head).toBe(7);
    expect(dispatchKey(view, 'a', { code: 'KeyA', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(view.state.selection.main.head).toBe(0);
    expect(dispatchKey(view, 'f', { code: 'KeyF', altKey: true }).defaultPrevented).toBe(true);
    expect(view.state.selection.main.head).toBeGreaterThan(0);
    expect(dispatchKey(view, 'b', { code: 'KeyB', altKey: true }).defaultPrevented).toBe(true);
    expect(view.state.selection.main.head).toBe(0);

    view.dispatch({ selection: { anchor: 11 } });
    expect(dispatchKey(view, 'p', { code: 'KeyP', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(view.state.selection.main.head).toBeLessThan(8);
    expect(dispatchKey(view, 'n', { code: 'KeyN', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(view.state.selection.main.head).toBeGreaterThanOrEqual(8);
    expect(documentShortcut).not.toHaveBeenCalled();
    document.removeEventListener('keydown', documentShortcut);
  });

  it('handles common emacs editing shortcuts and prevents default browser behavior', async () => {
    const el = create();
    el.setContent('abc\ndef');

    document.body.append(el);
    await waitFor(() => Boolean(getView(el)));
    await el.setKeymapMode('emacs');
    const view = getView(el)!;

    view.dispatch({ selection: { anchor: 1 } });
    expect(dispatchKey(view, 'd', { code: 'KeyD', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(el.getContent()).toBe('ac\ndef');
    expect(dispatchKey(view, 'Backspace', { code: 'Backspace' }).defaultPrevented).toBe(true);
    expect(el.getContent()).toBe('c\ndef');
    view.dispatch({ selection: { anchor: 0 } });
    expect(dispatchKey(view, 'k', { code: 'KeyK', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(el.getContent()).toBe('\ndef');
    expect(dispatchKey(view, 'y', { code: 'KeyY', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(el.getContent()).toBe('c\ndef');
    expect(dispatchKey(view, 'g', { code: 'KeyG', ctrlKey: true }).defaultPrevented).toBe(true);
  });

  it('handles emacs save chord without letting browser save run', async () => {
    const el = create();
    const listener = vi.fn();
    const documentShortcut = vi.fn();
    el.addEventListener('save-request', listener);
    document.addEventListener('keydown', documentShortcut);

    document.body.append(el);
    await waitFor(() => Boolean(getView(el)));
    await el.setKeymapMode('emacs');
    const view = getView(el)!;

    const prefix = dispatchKey(view, 'x', { code: 'KeyX', ctrlKey: true });
    const save = dispatchKey(view, 's', { code: 'KeyS', ctrlKey: true });

    expect(prefix.defaultPrevented).toBe(true);
    expect(save.defaultPrevented).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(documentShortcut).not.toHaveBeenCalled();
    document.removeEventListener('keydown', documentShortcut);
  });

  it('hides the toolbar and rejects non-normal modes in readonly mode', async () => {
    const el = create();
    el.setAttribute('readonly', 'true');

    document.body.append(el);
    await waitFor(() => Boolean(el.shadowRoot?.querySelector('.code-editor-content')));

    expect(el.shadowRoot?.querySelector('.code-editor-toolbar')).toBeNull();
    expect(el.getSupportedKeymapModes()).toEqual(['normal']);
    await expect(el.setKeymapMode('emacs')).resolves.toEqual({
      requestedMode: 'emacs',
      activeMode: 'normal',
      status: 'unsupported',
      reason: 'readonly',
    });
  });

  it('dispatches keymap-mode-change only when the active mode changes', async () => {
    const el = create();
    const listener = vi.fn();
    el.addEventListener('keymap-mode-change', listener);

    await expect(el.setKeymapMode('normal')).resolves.toEqual({
      requestedMode: 'normal',
      activeMode: 'normal',
      status: 'applied',
    });

    expect(listener).not.toHaveBeenCalled();
  });
});
