import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ProseMirrorEditor } from './prosemirror-editor';

describe('ProseMirrorEditor styles', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  beforeAll(() => {
    expect(customElements.get('md-editor')).toBe(ProseMirrorEditor);
  });

  it('injects editor styles into the loading shell', () => {
    const el = document.createElement('md-editor') as ProseMirrorEditor;
    document.body.appendChild(el);

    // The shell renders synchronously on connect; the engine loads afterwards.
    const style = el.shadowRoot?.querySelector('style');
    expect(style?.textContent).toContain('.prosemirror-editor-toolbar');
    expect(style?.textContent).toContain('.toolbar-button');
  });

  it('keeps editor styles when rendering the editable shell', async () => {
    const el = document.createElement('md-editor') as ProseMirrorEditor;
    document.body.appendChild(el);
    await el.whenReady();

    const style = el.shadowRoot?.querySelector('style');
    expect(style?.textContent).toContain('.prosemirror-editor-toolbar');
    expect(style?.textContent).toContain('.toolbar-button');
    expect(el.shadowRoot?.querySelector('.prosemirror-editor-toolbar-container')).not.toBeNull();
  });
});
