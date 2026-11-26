// The descriptor suite over the `./format` entry alone, so the suite sees the tag
// as importing it left it: one file per extension the format opens, each with a
// URL and no text.
import { createFormatRegistry } from '@stillpointlab/common-format/format';
import { describeFormatDescriptor } from '@stillpointlab/common-format/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { videoFormat } from './format';

// jsdom has no Media Source Extensions: a playlist is given to the player itself,
// as in a browser that plays HLS on its own, and hls.js is not loaded here.
vi.mock('./preview/hls-engine', () => ({ startHls: () => null }));

// jsdom plays nothing: the pause for an element taken out of the page is stood in for.
beforeAll(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

const ENDINGS = ['.mp4', '.m4v', '.webm', '.mov', '.mkv', '.m3u8'];

describeFormatDescriptor(
  videoFormat,
  ENDINGS.map((ending) => ({ path: `media/clip${ending}`, url: `/files/media/clip${ending}` })),
  // jsdom loads no media: tell the player its length is known, which it waits for.
  {
    load: (element) =>
      element.shadowRoot?.querySelector('video')?.dispatchEvent(new Event('loadedmetadata')),
  }
);

describe('videoFormat', () => {
  it('opens the five endings and a playlist, in any case, and nothing else', () => {
    const registry = createFormatRegistry([videoFormat]);
    for (const ending of ENDINGS) {
      expect(registry.find(`a/b${ending}`)).toBe(videoFormat);
      expect(registry.find(`a/b${ending.toUpperCase()}`)).toBe(videoFormat);
    }
    // `.ogv` plays its sound alone in both browsers, so it is not opened.
    // A segment of a stream is not opened: its playlist is.
    for (const other of [
      'x.ogv',
      'x.3gp',
      'x.mpg',
      'x.ts',
      'x.m4s',
      'x.m2t',
      'x.mpd',
      'x.mp3',
      'x.ogg',
    ]) {
      expect(registry.find(other)).toBeNull();
    }
  });

  it('sets the URL as the source and the file name as its name', async () => {
    await videoFormat.preview.load();
    const element = document.createElement(videoFormat.preview.tag);
    videoFormat.apply(element, { path: 'media/clip.mp4', url: '/files/clip' });

    expect(element.getAttribute('src')).toBe('/files/clip');
    expect(element.getAttribute('name')).toBe('clip.mp4');
  });
});
