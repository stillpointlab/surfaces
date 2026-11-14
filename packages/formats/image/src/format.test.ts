// The descriptor suite over the `./format` entry alone, so the suite sees the tag
// as importing it left it: one sample per image type the format opens.
import { describeFormatDescriptor } from '@stillpointlab/common-format/testing';
import { describe, expect, it } from 'vitest';

import { imageFormat } from './format';

const svg =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 2'%3E%3Crect width='2' height='2'/%3E%3C/svg%3E";

describeFormatDescriptor(
  imageFormat,
  [
    { path: 'photos/beach.JPG', url: '/files/photos/beach.JPG' },
    { path: 'photos/beach.jpeg', url: '/files/photos/beach.jpeg' },
    { path: 'logo.png', url: '/files/logo.png' },
    { path: 'spinner.gif', url: '/files/spinner.gif' },
    { path: 'hero.webp', url: '/files/hero.webp' },
    { path: 'hero.avif', url: '/files/hero.avif' },
    { path: 'old.bmp', url: '/files/old.bmp' },
    { path: 'icons/square.svg', url: svg },
  ],
  // jsdom fetches no image: finish the load the element waits for.
  { load: (element) => element.shadowRoot?.querySelector('img')?.dispatchEvent(new Event('load')) }
);

describe('imageFormat.apply', () => {
  it('sets the URL as the source and the file name as its alternative text', async () => {
    await imageFormat.preview.load();
    const element = document.createElement(imageFormat.preview.tag);
    imageFormat.apply(element, { path: 'photos/beach.jpg', url: '/files/beach.jpg' });

    expect(element.getAttribute('src')).toBe('/files/beach.jpg');
    expect(element.getAttribute('alt')).toBe('beach.jpg');
  });
});
