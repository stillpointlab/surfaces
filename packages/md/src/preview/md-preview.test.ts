import { afterEach, describe, expect, it } from 'vitest';

import './md-preview';
import { MdPreview } from './md-preview';
import { setPreviewRenderer } from './render';

// Restore the default renderer after each test so cases don't leak into each other.
afterEach(() => {
  setPreviewRenderer(async (content) => {
    const { renderMarkdown } = await import('../markdown');
    return renderMarkdown(content);
  });
  document.body.innerHTML = '';
});

/** Mount an <md-preview>, optionally pre-seeding content before connect. */
function mount(content?: string): MdPreview {
  const el = document.createElement('md-preview') as MdPreview;
  if (content !== undefined) el.setContent(content);
  document.body.appendChild(el);
  return el;
}

const body = (el: MdPreview): HTMLElement | null =>
  el.shadowRoot?.querySelector('.md-preview-body') ?? null;

/**
 * Poll until `predicate` is true or the timeout elapses. The preview renders
 * asynchronously (the default renderer even dynamically imports markdown-it), so a
 * fixed delay is flaky on a cold/loaded run — wait for the actual result instead.
 */
async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) return;
    await new Promise((r) => setTimeout(r, 10));
  }
}

const bodyHtml = (el: MdPreview): string => body(el)?.innerHTML ?? '';

describe('md-preview', () => {
  it('registers the custom element', () => {
    expect(customElements.get('md-preview')).toBe(MdPreview);
  });

  it('renders content set before connect (buffering) via the default renderer', async () => {
    const el = mount('# Hello');
    // The default renderer dynamically imports markdown-it; poll until it resolves.
    await waitFor(() => bodyHtml(el).includes('<h1>Hello</h1>'));
    expect(bodyHtml(el)).toContain('<h1>Hello</h1>');
  });

  it('uses an injected renderer instead of the default', async () => {
    setPreviewRenderer(async (content) => `<p class="x">${content.toUpperCase()}</p>`);
    const el = mount('hi');
    await waitFor(() => bodyHtml(el) === '<p class="x">HI</p>');
    expect(bodyHtml(el)).toBe('<p class="x">HI</p>');
  });

  it('shows the latest content when setContent races (last wins)', async () => {
    // Slow for the first content, fast for the second; the second must win.
    setPreviewRenderer(
      (content) =>
        new Promise((resolve) =>
          setTimeout(() => resolve(`<p>${content}</p>`), content === 'first' ? 30 : 0)
        )
    );
    const el = mount();
    el.setContent('first');
    el.setContent('second');
    // Wait for the fast 'second' to land, then past the slow 'first' (30ms) to
    // prove the older, slower render never clobbers it.
    await waitFor(() => bodyHtml(el) === '<p>second</p>');
    await new Promise((r) => setTimeout(r, 60));
    expect(bodyHtml(el)).toBe('<p>second</p>');
  });

  it('does not write to the root after disconnect mid-render', async () => {
    setPreviewRenderer(
      (content) => new Promise((resolve) => setTimeout(() => resolve(`<p>${content}</p>`), 20))
    );
    const el = mount('late');
    el.remove();
    await new Promise((r) => setTimeout(r, 40));
    // The render resolved after disconnect; the (now-detached) body stays empty.
    expect(body(el)?.innerHTML ?? '').toBe('');
  });
});
