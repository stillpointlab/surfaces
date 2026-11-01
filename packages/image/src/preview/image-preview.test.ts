import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ImagePreview } from './image-preview';
import { setErrorHandler } from './log';

describe('image-preview', () => {
  beforeAll(() => {
    expect(customElements.get('image-preview')).toBe(ImagePreview);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setErrorHandler(null);
  });

  const create = (): ImagePreview => document.createElement('image-preview') as ImagePreview;

  it('renders an empty state without a source', () => {
    const el = create();
    document.body.appendChild(el);

    expect(el.shadowRoot?.textContent).toContain('No image selected.');
    expect(el.shadowRoot?.querySelector('img')).toBeNull();
  });

  it('sets source and alt through setSource', () => {
    const el = create();
    el.setSource('/preview.png', 'Preview image');
    document.body.appendChild(el);

    const img = el.shadowRoot?.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/preview.png');
    expect(img?.getAttribute('alt')).toBe('Preview image');
  });

  it('uses an img element for svg sources', () => {
    const el = create();
    el.setSource('/diagram.svg', '<svg onload="bad">');
    document.body.appendChild(el);

    expect(el.shadowRoot?.querySelector('img')?.getAttribute('src')).toBe('/diagram.svg');
    expect(el.shadowRoot?.querySelector('svg')).toBeNull();
  });

  it('keeps fixed-size svgs at their default image size', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () => '<svg width="320" height="180" viewBox="0 0 320 180"></svg>',
      }))
    );
    const el = create();
    el.setSource('/diagram.svg', 'Diagram');
    document.body.appendChild(el);

    el.shadowRoot?.querySelector('img')?.dispatchEvent(new Event('load'));
    await flushAsync();

    expect(el.shadowRoot?.querySelector('img')?.className).toBe('image-preview__image');
  });

  it('allows svgs without fixed dimensions to scale inside the preview frame', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () => '<svg viewBox="0 0 320 180"></svg>',
      }))
    );
    const el = create();
    el.setSource('/diagram.svg', 'Diagram');
    document.body.appendChild(el);

    el.shadowRoot?.querySelector('img')?.dispatchEvent(new Event('load'));
    await flushAsync();

    expect(
      el.shadowRoot?.querySelector('img')?.classList.contains('image-preview__image--scalable')
    ).toBe(true);
  });

  it('shows an error state and reports load failures', () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const el = create();
    el.setSource('/missing.webp', 'Missing image');
    document.body.appendChild(el);

    el.shadowRoot?.querySelector('img')?.dispatchEvent(new Event('error'));

    expect(el.shadowRoot?.textContent).toContain('Could not load this image.');
    expect(handler).toHaveBeenCalledWith('Image preview failed to load', { src: '/missing.webp' });
  });
});

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
