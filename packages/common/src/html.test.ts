// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { escapeHtml, html, isSafeHtml } from './html';

const nasty = `<b class="x">&'</b>`;
const escaped = '&lt;b class=&quot;x&quot;&gt;&amp;&#39;&lt;/b&gt;';

describe('escapeHtml', () => {
  it('escapes the five characters that matter in text and quoted attributes', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('leaves everything else alone', () => {
    expect(escapeHtml('plain — text, 1/2 = 0.5 %')).toBe('plain — text, 1/2 = 0.5 %');
  });

  it('escapes an ampersand that already starts an entity', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });
});

describe('html', () => {
  it('keeps the literal parts as they are', () => {
    expect(String(html`<p class="a">"quoted" & 'single'</p>`)).toBe(
      `<p class="a">"quoted" & 'single'</p>`
    );
  });

  it('escapes a string in text and attribute positions', () => {
    expect(String(html`<p title="${nasty}">${nasty}</p>`)).toBe(
      `<p title="${escaped}">${escaped}</p>`
    );
  });

  it('converts numbers, bigints and true with String() and escapes them', () => {
    expect(String(html`${0}|${-1.5}|${10n}|${true}`)).toBe('0|-1.5|10|true');
  });

  it('adds nothing for null, undefined and false', () => {
    expect(String(html`[${null}${undefined}${false}]`)).toBe('[]');
  });

  it('nests markup it built without escaping it again', () => {
    const inner = html`<em>${nasty}</em>`;

    expect(String(html`<p>${inner}</p>`)).toBe(`<p><em>${escaped}</em></p>`);
  });

  it('handles an array item by item and joins it', () => {
    const items = ['a', '<b>', html`<i>c</i>`, null, false, 3];

    expect(String(html`<ul>${items}</ul>`)).toBe('<ul>a&lt;b&gt;<i>c</i>3</ul>');
  });

  it('handles nested arrays by the same rules', () => {
    expect(String(html`${[['<'], [html`<br>`, ['>']]]}`)).toBe('&lt;<br>&gt;');
  });

  it('maps a list into markup', () => {
    const rows = ['one', 'two & three'].map((text) => html`<li>${text}</li>`);

    expect(String(html`<ol>${rows}</ol>`)).toBe('<ol><li>one</li><li>two &amp; three</li></ol>');
  });

  it('escapes a string that looks like markup it built', () => {
    const forged = String(html`<b>bold</b>`);

    expect(String(html`${forged}`)).toBe('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('escapes a plain object rather than trusting it', () => {
    const lookalike = { toString: () => '<b>' } as unknown as string;

    expect(String(html`${lookalike}`)).toBe('&lt;b&gt;');
  });

  it('handles a template with no values', () => {
    expect(String(html``)).toBe('');
  });
});

describe('isSafeHtml', () => {
  it('is true only for markup html built', () => {
    expect(isSafeHtml(html`<b></b>`)).toBe(true);
    expect(isSafeHtml('<b></b>')).toBe(false);
    expect(isSafeHtml({ toString: () => '<b></b>' })).toBe(false);
    expect(isSafeHtml(null)).toBe(false);
  });

  it('cannot be satisfied by constructing the class without html', () => {
    const SafeHtmlClass = (html`` as object).constructor as new (
      key: symbol,
      markup: string
    ) => object;

    expect(() => new SafeHtmlClass(Symbol('SafeHtml'), '<b>')).toThrow(TypeError);
  });
});
