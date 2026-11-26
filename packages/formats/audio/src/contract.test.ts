// The host-contract conformance suite for the element this format ships. jsdom
// loads no media, so the hooks tell the `<audio>` that its length is known
// (`loadedmetadata`) or that it failed (`error`; jsdom gives no `MediaError`, so
// the element takes it as a file that did not arrive). jsdom plays nothing
// either: pausing and loading are stood in for.
import { describeUrlPreviewContract } from '@stillpointlab/common-format/testing';
import { beforeAll, expect, vi } from 'vitest';

import './preview';

import type { AudioPreview } from './preview/audio-preview';

beforeAll(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
});

const mediaOf = (el: AudioPreview) => el.shadowRoot?.querySelector('audio');

describeUrlPreviewContract<AudioPreview>('audio-preview', {
  src: '/files/tone.mp3',
  name: 'tone.mp3',
  load: (el) => mediaOf(el)?.dispatchEvent(new Event('loadedmetadata')),
  fail: (el) => mediaOf(el)?.dispatchEvent(new Event('error')),
  shows: (el, src, name) => {
    expect(mediaOf(el)?.getAttribute('src')).toBe(src);
    expect(mediaOf(el)?.getAttribute('aria-label')).toBe(name);
    expect(el.shadowRoot?.querySelector('.audio-preview__name')?.textContent).toBe(name);
  },
  empty: (el) => expect(mediaOf(el)).toBeNull(),
});
