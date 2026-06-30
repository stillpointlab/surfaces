import { beforeAll, describe, expect, it } from 'vitest';

import { CodeDiff } from './code-diff';

// These exercise the string contract before the lazy-loaded MergeView exists (the
// element is created but never connected, so no view is built) — the state a host
// relies on when seeding both sides before the diff hydrates.
describe('CodeDiff content buffering (pre-view)', () => {
  beforeAll(() => {
    // Importing the module registers the element; assert it took.
    expect(customElements.get('code-diff')).toBe(CodeDiff);
  });

  const create = () => document.createElement('code-diff') as CodeDiff;

  it('defaults to empty sides', () => {
    expect(create().getContents()).toEqual({ left: '', right: '' });
  });

  it('returns both sides set before the view exists', () => {
    const el = create();
    el.setContents({ left: 'const x = 1;', right: 'const x = 2;' });
    expect(el.getContents()).toEqual({ left: 'const x = 1;', right: 'const x = 2;' });
  });

  it('overwrites buffered sides on repeated setContents', () => {
    const el = create();
    el.setContents({ left: 'a', right: 'b' });
    el.setContents({ left: 'c', right: 'd' });
    expect(el.getContents()).toEqual({ left: 'c', right: 'd' });
  });

  it('observes language + the wrap / whitespace / collapse toggles (no readonly — always read-only)', () => {
    expect(CodeDiff.observedAttributes).toEqual([
      'language',
      'wrap',
      'show-whitespace',
      'ignore-whitespace',
      'collapse-unchanged',
    ]);
  });
});
