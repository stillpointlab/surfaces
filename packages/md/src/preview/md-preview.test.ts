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

describe('md-preview', () => {
  it('registers the custom element', () => {
    expect(customElements.get('md-preview')).toBe(MdPreview);
  });

  it('renders content set before connect (buffering) via the default renderer', async () => {
    const el = mount('# Hello');
    // The default renderer dynamically imports markdown-it; give it a real tick.
    await new Promise((r) => setTimeout(r, 50));
    expect(body(el)?.innerHTML).toContain('<h1>Hello</h1>');
  });

  it('uses an injected renderer instead of the default', async () => {
    setPreviewRenderer(async (content) => `<p class="x">${content.toUpperCase()}</p>`);
    const el = mount('hi');
    await new Promise((r) => setTimeout(r, 0));
    expect(body(el)?.innerHTML).toBe('<p class="x">HI</p>');
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
    await new Promise((r) => setTimeout(r, 50));
    expect(body(el)?.innerHTML).toBe('<p>second</p>');
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
