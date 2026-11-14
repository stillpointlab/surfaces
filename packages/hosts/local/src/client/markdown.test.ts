// @vitest-environment jsdom
import { mdFormat } from '@stillpointlab/md-format/format';
import { renderMarkdown } from '@stillpointlab/md-format/markdown';
import { describe, expect, it } from 'vitest';

import { installMarkdownRenderer, sanitizeMarkdownHtml } from './markdown';

import type { PreviewElement } from '@stillpointlab/common-format';

declare global {
  interface Window {
    __pwned?: string;
  }
}

const HOSTILE = `---
title: "<img src=x onerror=\\"window.__pwned='frontmatter'\\">"
note: <script>window.__pwned='frontmatter script'</script>
---

# Notes

<script>window.__pwned = 'script'</script>

<img src="x" onerror="window.__pwned = 'onerror'">

[a link](javascript:window.__pwned='link') and [another](https://example.com)
`;

/** Everything a rendering could run: script elements, handler attributes, script URLs. */
function scripted(root: ParentNode): string[] {
  const found: string[] = [];
  for (const el of root.querySelectorAll('*')) {
    if (['script', 'iframe', 'object', 'embed', 'style'].includes(el.localName)) {
      found.push(el.localName);
    }
    for (const attribute of el.attributes) {
      if (attribute.name.startsWith('on')) found.push(`${el.localName}[${attribute.name}]`);
      if (/^\s*(javascript|vbscript|data:text)/i.test(attribute.value)) {
        found.push(`${el.localName}[${attribute.name}=${attribute.value}]`);
      }
    }
  }
  return found;
}

function parse(markup: string): HTMLElement {
  const holder = document.createElement('div');
  holder.innerHTML = markup;
  return holder;
}

describe('sanitizeMarkdownHtml', () => {
  it('removes scripts, handlers, script URLs and styles from markup', () => {
    const clean = sanitizeMarkdownHtml(
      `<p>ok</p><script>alert(1)</script><img src="x" onerror="alert(1)">` +
        `<a href="javascript:alert(1)">a</a><a href=" JaVaScRiPt:alert(1)">b</a>` +
        `<svg onload="alert(1)"><circle /></svg><iframe src="https://x"></iframe>` +
        `<p style="position:fixed">s</p><style>body{}</style><form action="/x"><input></form>` +
        `<object data="x"></object><math><mtext><script>alert(1)</script></mtext></math>`
    );
    const holder = parse(clean);
    expect(scripted(holder)).toEqual([]);
    expect(holder.querySelector('[style], form, input')).toBeNull();
    expect(holder.textContent).toContain('ok');
  });

  it('opens a link in a tab of its own, and leaves an anchor on the page', () => {
    const holder = parse(
      sanitizeMarkdownHtml('<a href="https://example.com">x</a><a href="#top">y</a>')
    );
    const [external, anchor] = holder.querySelectorAll('a');
    expect(external.target).toBe('_blank');
    expect(external.rel).toBe('noopener noreferrer');
    expect(anchor.hasAttribute('target')).toBe(false);
  });

  it('cleans what the markdown renders, frontmatter panel included', async () => {
    for (const frontmatter of ['hidden', 'panel'] as const) {
      const holder = parse(sanitizeMarkdownHtml(await renderMarkdown(HOSTILE, { frontmatter })));
      expect(scripted(holder)).toEqual([]);
    }
  });
});

describe('installMarkdownRenderer', () => {
  it("is the renderer <md-preview> uses once the format's own entry has loaded it", async () => {
    await installMarkdownRenderer();
    await mdFormat.preview.load();
    const preview = document.createElement(mdFormat.preview.tag) as PreviewElement;
    preview.setAttribute('frontmatter', 'panel');
    document.body.append(preview);
    mdFormat.apply(preview, { path: 'notes.md', text: HOSTILE });
    await preview.whenReady();
    const body = preview.shadowRoot!.querySelector('.md-preview-body')!;
    expect(body.querySelector('h1')?.textContent).toBe('Notes');
    expect(scripted(body)).toEqual([]);
    // Only the page's renderer sends a link to a tab of its own.
    expect(body.querySelector('a[href="https://example.com"]')?.getAttribute('target')).toBe(
      '_blank'
    );
    await new Promise((done) => setTimeout(done, 20));
    expect(window.__pwned).toBeUndefined();
    preview.remove();
  });
});
