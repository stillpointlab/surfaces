import { beforeAll, describe, expect, it } from 'vitest';

import { CodePreview } from './code-preview';

// These exercise the string contract before the lazy-loaded CodeMirror view exists
// (the element is created but never connected, so no view is built) — the state the
// host relies on when seeding content before the preview hydrates.
describe('CodePreview content buffering (pre-view)', () => {
  beforeAll(() => {
    // Importing the module registers the element; assert it took.
    expect(customElements.get('code-preview')).toBe(CodePreview);
  });

  const create = () => document.createElement('code-preview') as CodePreview;

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

  it('observes only language (no readonly attribute — it is always read-only)', () => {
    expect(CodePreview.observedAttributes).toEqual(['language']);
  });
});
