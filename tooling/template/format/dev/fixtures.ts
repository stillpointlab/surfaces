// This format in the surfaces harness (`npm run dev`): the elements to mount by
// role, named fixtures, and any controls beyond the common ones.
import '../src/editor';
import '../src/preview';

import type { HarnessFormat } from '../../../../tooling/harness/types';

export default {
  elements: { editor: 'sample-editor', preview: 'sample-preview' },
  fixtures: {
    'Sample document': 'A sample document.\nEdit me and the preview follows.',
    Empty: '',
  },
} satisfies HarnessFormat;
