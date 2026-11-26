// The host-contract conformance suite for the element this format ships. jsdom
// loads no media, so the hooks tell the `<video>` that its length is known
// (`loadedmetadata`) or that it failed (`error`; jsdom gives no `MediaError`, so
// the element takes it as a file that did not arrive). jsdom plays nothing
// either: pausing and loading are stood in for.
import { describeUrlPreviewContract } from '@stillpointlab/common-format/testing';
import { beforeAll, expect, vi } from 'vitest';

import './preview';

import type { VideoPreview } from './preview/video-preview';

beforeAll(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
});

const mediaOf = (el: VideoPreview) => el.shadowRoot?.querySelector('video');

describeUrlPreviewContract<VideoPreview>('video-preview', {
  src: '/files/clip.webm',
  name: 'clip.webm',
  load: (el) => mediaOf(el)?.dispatchEvent(new Event('loadedmetadata')),
  fail: (el) => mediaOf(el)?.dispatchEvent(new Event('error')),
  shows: (el, src, name) => {
    expect(mediaOf(el)?.getAttribute('src')).toBe(src);
    expect(mediaOf(el)?.getAttribute('aria-label')).toBe(name);
  },
  empty: (el) => expect(mediaOf(el)).toBeNull(),
});
