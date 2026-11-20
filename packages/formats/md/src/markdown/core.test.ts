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

  it('renders a line break inside a paragraph as a space, as GitHub renders a file', () => {
    const html = createMarkdownIt().render(
      'A paragraph wrapped\nby hand, on three\nshort lines.\n'
    );

    expect(html).not.toContain('<br');
    expect(html.replace(/\s+/g, ' ').trim()).toBe(
      '<p>A paragraph wrapped by hand, on three short lines.</p>'
    );
  });

  it('keeps a break the writer asked for, and starts a paragraph at a blank line', () => {
    const md = createMarkdownIt();

    // Two trailing spaces, and a backslash, each before the line break.
    expect(
      md.render('Roses are red,  \nviolets are blue,\\\nand so on.\n').match(/<br/g)
    ).toHaveLength(2);
    expect(md.render('One.\n\nTwo.\n').match(/<p>/g)).toHaveLength(2);
  });

  it('shows every line break when a host asks, for text typed line by line', () => {
    const html = createMarkdownIt({ breaks: true }).render('first line\nsecond line\n');

    expect(html.match(/<br/g)).toHaveLength(1);
  });

  it('preserves explicit links', () => {
    const md = createMarkdownIt();

    expect(md.renderInline('[Example](https://example.com)')).toBe(
      '<a href="https://example.com">Example</a>'
    );
  });
});
