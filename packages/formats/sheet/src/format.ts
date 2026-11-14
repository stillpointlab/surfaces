// The `./format` entry: which paths this format opens and how a host mounts it
// (see `FormatDescriptor` in common). Importing it defines no element and loads
// no grid: each `load()` is the package's `./preview` or `./editor` entry, which
// the build keeps as its own file (splitting is on).
import { extensionOf } from '@stillpointlab/common-format/format';

import type { SheetEditor } from './editor/sheet-editor';
import type { SheetPreview } from './preview/sheet-preview';
import type { FormatDescriptor } from '@stillpointlab/common-format/format';

export const sheetFormat: FormatDescriptor = {
  id: 'sheet',
  opens: ['.csv', '.sheet'],
  needs: 'text',
  preview: { tag: 'sheet-preview', load: () => import('./preview/index') },
  editor: { tag: 'sheet-editor', load: () => import('./editor/index') },
  /** A `.sheet` file is a Stillpoint sheet document; anything else is plain CSV. */
  apply(element, file) {
    const sheet = element as SheetPreview | SheetEditor;
    const text = file.text ?? '';
    if (extensionOf(file.path) === '.sheet') sheet.setDocumentSource(text);
    else sheet.setContent(text);
  },
};
