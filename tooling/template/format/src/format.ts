// The `./format` entry: which paths this format opens and how a host mounts it
// (see `FormatDescriptor` in common). Importing it defines no element: each
// `load()` is the package's `./preview` or `./editor` entry, which the build keeps
// as its own file (splitting is on). A host registers `sampleFormat` with one
// import of this entry and one entry in its registry's list.
import type { PreviewElement } from '@stillpointlab/common-format';
import type { FormatDescriptor } from '@stillpointlab/common-format/format';

export const sampleFormat: FormatDescriptor = {
  id: 'sample',
  // Replace with the real extensions: lower case, with the dot.
  opens: ['.sample'],
  needs: 'text',
  preview: { tag: 'sample-preview', load: () => import('./preview/index') },
  editor: { tag: 'sample-editor', load: () => import('./editor/index') },
  apply(element, file) {
    (element as PreviewElement).setContent(file.text ?? '');
  },
};
