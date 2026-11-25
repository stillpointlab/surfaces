// The `./format` entry: which paths this format opens and how a host mounts it
// (see `FormatDescriptor` in common). Importing it defines no element: `load()` is
// the package's `./preview` entry, which the build keeps as its own file
// (splitting is on). Preview only, so there is no editor. A host registers
// `sampleFormat` with one import of this entry and one entry in its registry's list.
import { fileNameOf } from '@stillpointlab/common-format/format';

import type { SamplePreviewElement } from './preview/sample-url-preview';
import type { FormatDescriptor } from '@stillpointlab/common-format/format';

export const sampleFormat: FormatDescriptor = {
  id: 'sample-url',
  // Replace with the real extensions: lower case, with the dot.
  opens: ['.sample-url'],
  needs: 'url',
  preview: { tag: 'sample-url-preview', load: () => import('./preview/index') },
  /** The URL is the source; the file's name is what it is called. */
  apply(element, file) {
    (element as SamplePreviewElement).setSource(file.url ?? '', fileNameOf(file.path));
  },
};
