// The `./format` entry: which paths this format opens and how a host mounts it
// (see `FormatDescriptor` in common). Importing it defines no element and loads no
// ProseMirror or markdown-it: each `load()` is the package's `./preview` or
// `./editor` entry, which the build keeps as its own file (splitting is on).
import type { PreviewElement } from '@stillpointlab/common-format';
import type { FormatDescriptor } from '@stillpointlab/common-format/format';

export const mdFormat: FormatDescriptor = {
  id: 'md',
  opens: ['.md', '.markdown'],
  needs: 'text',
  preview: { tag: 'md-preview', load: () => import('./preview/index') },
  editor: { tag: 'md-editor', load: () => import('./editor/index') },
  apply(element, file) {
    (element as PreviewElement).setContent(file.text ?? '');
  },
};
