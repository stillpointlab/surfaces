// The `./format` entry: which paths this format opens and how a host mounts it
// (see `FormatDescriptor` in common). Importing it defines no element: `load()` is
// the package's `./preview` entry, which the build keeps as its own file
// (splitting is on). Preview only, so there is no editor. A host registers
// `audioFormat` with one import of this entry and one entry in its registry's list.
import { fileNameOf } from '@stillpointlab/common-format/format';

import type { AudioPreviewElement } from './preview/audio-preview';
import type { FormatDescriptor } from '@stillpointlab/common-format/format';

export const audioFormat: FormatDescriptor = {
  id: 'audio',
  // Replace with the real extensions: lower case, with the dot.
  opens: ['.audio'],
  needs: 'url',
  preview: { tag: 'audio-preview', load: () => import('./preview/index') },
  /** The URL is the source; the file's name is what it is called. */
  apply(element, file) {
    (element as AudioPreviewElement).setSource(file.url ?? '', fileNameOf(file.path));
  },
};
