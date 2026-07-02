import { beforeAll, describe, expect, it } from 'vitest';

import { ProseMirrorEditor } from './prosemirror-editor';

describe('ProseMirrorEditor styles', () => {
  beforeAll(() => {
    expect(customElements.get('md-editor')).toBe(ProseMirrorEditor);
  });

  it('injects editor styles into the loading shell', () => {
    const el = document.createElement('md-editor') as ProseMirrorEditor;
    document.body.appendChild(el);

    const style = el.shadowRoot?.querySelector('style');
    expect(style?.textContent).toContain('.prosemirror-editor-toolbar');
    expect(style?.textContent).toContain('.toolbar-button');

    el.remove();
  });

  it('keeps editor styles when rendering the editable shell', () => {
    const el = document.createElement('md-editor') as ProseMirrorEditor;
    (el as any)._loading = false;
    (el as any).render();

    const style = el.shadowRoot?.querySelector('style');
    expect(style?.textContent).toContain('.prosemirror-editor-toolbar');
    expect(style?.textContent).toContain('.toolbar-button');
    expect(el.shadowRoot?.querySelector('.prosemirror-editor-toolbar-container')).not.toBeNull();
  });
});
