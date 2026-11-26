// The descriptor suite over the `./format` entry alone, so the suite sees the tag
// as importing it left it: one file per extension the format opens, each with a
// URL and no text.
import { createFormatRegistry } from '@stillpointlab/common-format/format';
import { describeFormatDescriptor } from '@stillpointlab/common-format/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { audioFormat } from './format';

// jsdom plays nothing: the pause for an element taken out of the page is stood in for.
beforeAll(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

const ENDINGS = ['.mp3', '.wav', '.flac', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.weba'];

describeFormatDescriptor(
  audioFormat,
  ENDINGS.map((ending) => ({ path: `media/tone${ending}`, url: `/files/media/tone${ending}` })),
  // jsdom loads no media: tell the player its length is known, which it waits for.
  {
    load: (element) =>
      element.shadowRoot?.querySelector('audio')?.dispatchEvent(new Event('loadedmetadata')),
  }
);

describe('audioFormat', () => {
  it('opens the nine endings, in any case, and nothing else', () => {
    const registry = createFormatRegistry([audioFormat]);
    for (const ending of ENDINGS) {
      expect(registry.find(`a/b${ending}`)).toBe(audioFormat);
      expect(registry.find(`a/b${ending.toUpperCase()}`)).toBe(audioFormat);
    }
    for (const other of ['x.aiff', 'x.mp4', 'x.ogv', 'x.webm', 'x.mid']) {
      expect(registry.find(other)).toBeNull();
    }
  });

  it('sets the URL as the source and the file name as its name', async () => {
    await audioFormat.preview.load();
    const element = document.createElement(audioFormat.preview.tag);
    audioFormat.apply(element, { path: 'media/clip.mp3', url: '/files/clip' });

    expect(element.getAttribute('src')).toBe('/files/clip');
    expect(element.getAttribute('name')).toBe('clip.mp3');
  });
});
