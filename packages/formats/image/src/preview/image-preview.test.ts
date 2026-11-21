import { setErrorHandler } from '@stillpointlab/common-format';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ImagePreview } from './image-preview';

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
    await el.whenReady();

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
    await el.whenReady();

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

    expect(el.shadowRoot?.textContent).toContain("Couldn't load this image.");
    expect(handler).toHaveBeenCalledWith('Image preview failed to load', { src: '/missing.webp' });
  });

  it('reports one failure when alt and src change together, from the image it shows', () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const el = create();
    el.setSource('/first.png', 'First');
    document.body.appendChild(el);
    const first = el.shadowRoot!.querySelector('img')!;

    // The next file: its alt lands first, then its src, and each draws a new <img>.
    el.setSource('/second.png', 'Second');
    const second = el.shadowRoot!.querySelector('img')!;
    expect(second).not.toBe(first);
    expect(second.getAttribute('src')).toBe('/second.png');

    // The first image fails late: it is about a source no longer shown.
    first.dispatchEvent(new Event('error'));
    expect(handler).not.toHaveBeenCalled();
    expect(el.shadowRoot!.textContent).not.toContain("Couldn't load this image.");

    // The image that is shown fails: said once, for its own source.
    second.dispatchEvent(new Event('error'));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('Image preview failed to load', { src: '/second.png' });
    expect(el.shadowRoot!.textContent).toContain("Couldn't load this image.");
  });

  it('still hears the shown image after a change of alt alone, and a late load of the old one changes nothing', async () => {
    const el = create();
    el.setSource('/photo.png', 'A photo');
    document.body.appendChild(el);
    const before = el.shadowRoot!.querySelector('img')!;
    el.setAttribute('alt', 'The same photo');
    const after = el.shadowRoot!.querySelector('img')!;
    expect(after).not.toBe(before);

    before.dispatchEvent(new Event('load'));
    await Promise.resolve();
    expect(el.shadowRoot!.querySelector('.image-preview__loading')).not.toBeNull();

    after.dispatchEvent(new Event('load'));
    await el.whenReady();
    expect(el.shadowRoot!.querySelector('.image-preview__loading')).toBeNull();
    expect(el.shadowRoot!.querySelector('img')!.getAttribute('alt')).toBe('The same photo');
  });
});
