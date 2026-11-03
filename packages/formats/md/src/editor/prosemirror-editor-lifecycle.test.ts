import { TextSelection } from 'prosemirror-state';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import './prosemirror-editor';

import type { ProseMirrorEditor } from './prosemirror-editor';
import type { EditorView } from 'prosemirror-view';

beforeAll(() => {
  // ProseMirror's focus path uses execCommand for a Safari compatibility
  // workaround; jsdom does not provide the deprecated DOM method.
  if (typeof document.execCommand !== 'function') {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    });
  }
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function mount(content: string): Promise<ProseMirrorEditor> {
  const el = document.createElement('md-editor') as ProseMirrorEditor;
  el.setContent(content);
  document.body.append(el);
  await el.whenReady();
  return el;
}

describe('md-editor across connections', () => {
  it('starts no polling timer, however often it reconnects', async () => {
    const setInterval = vi.spyOn(window, 'setInterval');
    const el = await mount('# Title');
    el.remove();
    document.body.append(el);
    await el.whenReady();

    expect(setInterval).not.toHaveBeenCalled();
  });

  it('refreshes the toolbar when only the selection changes', async () => {
    const el = await mount('plain **bold** text');
    const bold = el.shadowRoot?.querySelector('.toolbar-button[data-command="toggleBold"]');
    expect(bold?.classList.contains('is-active')).toBe(false);

    // Select part of "bold" (the toolbar marks a range, not a bare caret): the
    // paragraph opens at 0 and its text starts at 1.
    const view = (el as unknown as { view: EditorView }).view;
    const start = 1 + 'plain '.length;
    const selection = TextSelection.create(view.state.doc, start + 1, start + 3);
    view.dispatch(view.state.tr.setSelection(selection));

    expect(bold?.classList.contains('is-active')).toBe(true);
  });

  it('builds no view for a connection that ended before the engine loaded', async () => {
    const detached = document.createElement('md-editor') as ProseMirrorEditor;
    document.body.append(detached);
    detached.remove();

    const live = await mount('# Live');

    expect(live.shadowRoot?.querySelector('.ProseMirror')).not.toBeNull();
    expect(detached.shadowRoot?.querySelector('.ProseMirror')).toBeNull();
  });
});
