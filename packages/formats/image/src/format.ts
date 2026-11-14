// The `./format` entry: which paths this format opens and how a host mounts it
// (see `FormatDescriptor` in common). Importing it defines no element: `load()` is
// the package's `./preview` entry, which the build keeps as its own file
// (splitting is on). Preview only, so there is no editor.
import { fileNameOf } from '@stillpointlab/common-format/format';

import type { ImagePreviewElement } from '@stillpointlab/common-format';
import type { FormatDescriptor } from '@stillpointlab/common-format/format';

export const imageFormat: FormatDescriptor = {
  id: 'image',
  // Context Manager's image extensions at e82fd321, so both hosts class a path
  // the same way.
  opens: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.svg'],
  needs: 'url',
  preview: { tag: 'image-preview', load: () => import('./preview/index') },
  /** The URL is the source; the file's name is its alternative text. */
  apply(element, file) {
    (element as ImagePreviewElement).setSource(file.url ?? '', fileNameOf(file.path));
  },
};
