// The `./format` entry: which paths this format opens and how a host mounts it
// (see `FormatDescriptor` in common). Importing it defines no element: `load()` is
// the package's `./preview` entry, which the build keeps as its own file
// (splitting is on). Preview only, so there is no editor. A host registers
// `pdfFormat` with one import of this entry and one entry in its registry's list.
import { fileNameOf } from '@stillpointlab/common-format/format';

import type { PdfPreviewElement } from './preview/pdf-preview';
import type { FormatDescriptor } from '@stillpointlab/common-format/format';

export const pdfFormat: FormatDescriptor = {
  id: 'pdf',
  opens: ['.pdf'],
  needs: 'url',
  preview: { tag: 'pdf-preview', load: () => import('./preview/index') },
  /** The URL is the source; the file's name labels the pages. */
  apply(element, file) {
    (element as PdfPreviewElement).setSource(file.url ?? '', fileNameOf(file.path));
  },
};
