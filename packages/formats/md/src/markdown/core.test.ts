import { describe, expect, it } from 'vitest';

import { createMarkdownIt } from './core';

describe('createMarkdownIt', () => {
  it('preserves fuzzy domain and email autolinking', () => {
    const md = createMarkdownIt();

    expect(md.renderInline('example.com')).toBe('<a href="http://example.com">example.com</a>');
    expect(md.renderInline('person@example.com')).toBe(
      '<a href="mailto:person@example.com">person@example.com</a>'
    );
  });

  it('preserves explicit links', () => {
    const md = createMarkdownIt();

    expect(md.renderInline('[Example](https://example.com)')).toBe(
      '<a href="https://example.com">Example</a>'
    );
  });
});
