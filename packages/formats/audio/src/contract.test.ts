// The host-contract conformance suite for the element this format ships. jsdom
// loads no media, so the hooks tell the audio's `<img>` that it loaded or
// failed; a format with other media tells its own element (`canplay` or `error`
// on a `<video>`), and says how to see what it shows.
import { describeUrlPreviewContract } from '@stillpointlab/common-format/testing';
import { expect } from 'vitest';

import './preview';

import type { AudioPreview } from './preview/audio-preview';

const mediaOf = (el: AudioPreview) => el.shadowRoot?.querySelector('img');

describeUrlPreviewContract<AudioPreview>('audio-preview', {
  src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 2'%3E%3Crect width='2' height='2' fill='%234f8cff'/%3E%3C/svg%3E",
  name: 'square.svg',
  load: (el) => mediaOf(el)?.dispatchEvent(new Event('load')),
  fail: (el) => mediaOf(el)?.dispatchEvent(new Event('error')),
  shows: (el, src, name) => {
    expect(mediaOf(el)?.getAttribute('src')).toBe(src);
    expect(mediaOf(el)?.getAttribute('alt')).toBe(name);
  },
  empty: (el) => expect(mediaOf(el)).toBeNull(),
});
