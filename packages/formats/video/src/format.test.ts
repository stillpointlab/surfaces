// The descriptor suite over the `./format` entry alone, so the suite sees the tag
// as importing it left it: one file per extension the format opens, each with a
// URL and no text.
import { describeFormatDescriptor } from '@stillpointlab/common-format/testing';
import { describe, expect, it } from 'vitest';

import { videoFormat } from './format';

const svg =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 2'%3E%3Crect width='2' height='2'/%3E%3C/svg%3E";

describeFormatDescriptor(
  videoFormat,
  [
    { path: 'media/clip.video', url: '/files/media/clip.video' },
    { path: 'square.video', url: svg },
  ],
  // jsdom loads no media: finish the load the element waits for.
  { load: (element) => element.shadowRoot?.querySelector('img')?.dispatchEvent(new Event('load')) }
);

describe('videoFormat.apply', () => {
  it('sets the URL as the source and the file name as its name', async () => {
    await videoFormat.preview.load();
    const element = document.createElement(videoFormat.preview.tag);
    videoFormat.apply(element, { path: 'media/clip.video', url: '/files/clip' });

    expect(element.getAttribute('src')).toBe('/files/clip');
    expect(element.getAttribute('name')).toBe('clip.video');
  });
});
