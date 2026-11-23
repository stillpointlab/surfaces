// What the writer must give back as it read it: a link whose text is code, an
// autolink's address, and text that says a character reference or an autolink.
import { describe, expect, it } from 'vitest';

import { escapeReferences, getMarkdownParser, getMarkdownSerializer } from './prosemirror-markdown';

const parse = (markdown: string) => getMarkdownParser().parse(markdown);
const written = (markdown: string) => getMarkdownSerializer().serialize(parse(markdown));

/** `markdown` comes back as written, and reads as the same document. */
function keeps(markdown: string, as = markdown): void {
  const out = written(markdown);
  expect(out.trimEnd()).toBe(as);
  expect(parse(out).eq(parse(markdown))).toBe(true);
}

describe('a link whose text is code', () => {
  it('stays a link, in a paragraph, a list and beside other marks', () => {
    keeps('See [`parse()`](https://e.com/api#parse) for more.');
    keeps(
      '- [`parse()`](https://e.com/api#parse) reads a file\n- [`write()`](https://e.com/api#write) writes one'
    );
    keeps('**[`a`](https://e.com)**');
    keeps('[`a` and b](https://e.com "A title")');
  });

  it('stays a link in a table cell, with its address', () => {
    keeps('| a | b |\n| --- | --- |\n| [`write()`](https://e.com/w) | **`x`** |');
  });

  it('leaves code under the other marks as it was', () => {
    keeps('**`bold code`** and *`em code`* and ~~`gone`~~');
  });
});

describe('an autolink', () => {
  it('keeps its address as written: no backslash before `~` or `_`', () => {
    keeps('<https://example.edu/~user/notes>');
    keeps('<https://e.com/__init__.py>');
  });

  it('a bare address gains its angle brackets, and nothing inside', () => {
    expect(written('See https://example.edu/~user/notes here').trimEnd()).toBe(
      'See <https://example.edu/~user/notes> here'
    );
  });
});

describe('text that says a reference or an autolink', () => {
  it('an `&` before a character reference is escaped, so it reads back as the text', () => {
    keeps('Text &amp;lt; here', 'Text \\&lt; here');
    keeps('&amp;#35; and &amp;#x23; and &amp;copy;', '\\&#35; and \\&#x23; and \\&copy;');
  });

  it('a `<` before an autolink is escaped, so it reads back as the text', () => {
    keeps('&lt;me@example.com&gt;', '\\<me@example.com>');
    keeps('&lt;irc:room&gt;', '\\<irc:room>');
  });

  it('an `&` or a `<` that starts neither is left alone', () => {
    keeps(
      'a &amp; b, 1 < 2, AT&T, x <- y, &nosemicolon',
      'a & b, 1 < 2, AT&T, x <- y, &nosemicolon'
    );
    expect(escapeReferences('a & b < c &; <> <a b>')).toBe('a & b < c &; <> <a b>');
  });
});
