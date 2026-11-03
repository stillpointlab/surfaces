import { afterEach, describe, expect, it } from 'vitest';

import './md-preview';
import { MdPreview } from './md-preview';
import { setPreviewRenderer } from './render';

// Restore the default renderer after each test so cases don't leak into each
// other (mirrors render.ts's default, including the frontmatter mode pass-through).
afterEach(() => {
  setPreviewRenderer(async (content, options) => {
    const { renderMarkdown } = await import('../markdown');
    return renderMarkdown(content, { frontmatter: options?.frontmatter });
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

const bodyHtml = (el: MdPreview): string => body(el)?.innerHTML ?? '';

describe('md-preview', () => {
  it('registers the custom element', () => {
    expect(customElements.get('md-preview')).toBe(MdPreview);
  });

  it('renders content set before connect (buffering) via the default renderer', async () => {
    const el = mount('# Hello');
    // The default renderer dynamically imports markdown-it; ready means it landed.
    await el.whenReady();
    expect(bodyHtml(el)).toContain('<h1>Hello</h1>');
  });

  it('uses an injected renderer instead of the default', async () => {
    setPreviewRenderer(async (content) => `<p class="x">${content.toUpperCase()}</p>`);
    const el = mount('hi');
    await el.whenReady();
    expect(bodyHtml(el)).toBe('<p class="x">HI</p>');
  });

  it('dispatches md-preview-rendered with the rendered body root', async () => {
    setPreviewRenderer(async (content) => `<p>${content}</p>`);
    const rendered = new Promise<HTMLElement>((resolve) => {
      const el = document.createElement('md-preview') as MdPreview;
      el.addEventListener('md-preview-rendered', (event) => {
        resolve((event as CustomEvent<{ root: HTMLElement }>).detail.root);
      });
      el.setContent('ready');
      document.body.appendChild(el);
    });

    const root = await rendered;

    expect(root.className).toBe('md-preview-body');
    expect(root.innerHTML).toBe('<p>ready</p>');
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
    // Ready once 'second' lands; then wait past the slow 'first' (30ms) to
    // prove the older, slower render never clobbers it.
    await el.whenReady();
    expect(bodyHtml(el)).toBe('<p>second</p>');
    await new Promise((r) => setTimeout(r, 60));
    expect(bodyHtml(el)).toBe('<p>second</p>');
  });

  it('renders a frontmatter panel via the default renderer when frontmatter="panel"', async () => {
    const el = document.createElement('md-preview') as MdPreview;
    el.setAttribute('frontmatter', 'panel');
    el.setContent('---\ncolumn: briefed\n---\n\n# Hello');
    document.body.appendChild(el);

    await el.whenReady();
    expect(bodyHtml(el)).toContain('md-frontmatter-panel');
    expect(bodyHtml(el)).toContain('<dt>column</dt><dd>briefed</dd>');
  });

  it('hides frontmatter by default (no attribute)', async () => {
    const el = mount('---\ncolumn: briefed\n---\n\n# Hello');
    await el.whenReady();
    expect(bodyHtml(el)).toBe('<h1>Hello</h1>\n');
  });

  it('re-renders when the frontmatter attribute changes', async () => {
    const el = mount('---\ncolumn: briefed\n---\n\n# Hello');
    await el.whenReady();
    expect(bodyHtml(el)).not.toContain('md-frontmatter-panel');

    el.setAttribute('frontmatter', 'panel');
    await el.whenReady();
    expect(bodyHtml(el)).toContain('<dt>column</dt><dd>briefed</dd>');
  });

  it('passes the frontmatter mode to an injected renderer', async () => {
    const seen: (string | undefined)[] = [];
    setPreviewRenderer(async (content, options) => {
      seen.push(options?.frontmatter);
      return `<p>${content}</p>`;
    });
    const el = mount('hi');
    await el.whenReady();
    el.setAttribute('frontmatter', 'panel');
    await el.whenReady();

    expect(seen[0]).toBe('hidden');
    expect(seen[1]).toBe('panel');
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

  it('shows the source, frontmatter included, exactly as set in the raw view', async () => {
    const source = '---\ntitle: x\n---\n# Heading\n\n__b__\n';
    const el = document.createElement('md-preview') as MdPreview;
    el.setAttribute('view', 'raw');
    el.setContent(source);
    document.body.append(el);
    await el.whenReady();

    expect(el.shadowRoot?.querySelector('[data-spl-raw]')?.textContent).toBe(source);
    expect(el.shadowRoot?.querySelector<HTMLElement>('.md-preview-body')?.hidden).toBe(true);
  });
});
