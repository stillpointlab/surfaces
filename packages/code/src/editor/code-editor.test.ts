import { beforeAll, describe, expect, it } from 'vitest';

import { CodeEditor } from './code-editor';

// These exercise the string contract before the lazy-loaded CodeMirror view exists
// (the element is created but never connected, so no view is built). This is the
// state the host relies on when seeding draft content before the editor hydrates.
describe('CodeEditor content buffering (pre-view)', () => {
  beforeAll(() => {
    // Importing the module registers the element; assert it took.
    expect(customElements.get('code-editor')).toBe(CodeEditor);
  });

  const create = () => document.createElement('code-editor') as CodeEditor;

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
    expect(CodeEditor.observedAttributes).toEqual(['readonly', 'language']);
  });
});
