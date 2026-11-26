// The `./format` entry: which paths this format opens and how a host mounts it
// (see `FormatDescriptor` in common). Importing it defines no element: `load()` is
// the package's `./preview` entry, which the build keeps as its own file
// (splitting is on). Preview only, so there is no editor. A host registers
// `videoFormat` with one import of this entry and one entry in its registry's list.
import { fileNameOf } from '@stillpointlab/common-format/format';

import type { VideoPreviewElement } from './preview/video-preview';
import type { FormatDescriptor } from '@stillpointlab/common-format/format';

export const videoFormat: FormatDescriptor = {
  id: 'video',
  // Every ending the stage 6 spike saw play in both Chromium and Firefox. `.ogv`
  // is not one: both have dropped Theora, and play its sound with no picture.
  // `.m3u8` is an HLS playlist: text, but the element is given its address, and
  // the engine reads it and the segments beside it.
  opens: ['.mp4', '.m4v', '.webm', '.mov', '.mkv', '.m3u8'],
  needs: 'url',
  preview: { tag: 'video-preview', load: () => import('./preview/index') },
  /** The URL is the source; the file's name labels the player. */
  apply(element, file) {
    (element as VideoPreviewElement).setSource(file.url ?? '', fileNameOf(file.path));
  },
};
