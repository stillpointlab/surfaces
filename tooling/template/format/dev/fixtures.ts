// This format in the surfaces harness (`npm run dev`), mounted through its
// descriptor as a host would: named fixtures, and any controls beyond the common
// ones. A fixture's path defaults to its name plus the first extension it opens.
import { sampleFormat } from '../src/format';

import type { HarnessFormat } from '../../../../tooling/harness/types';

export default {
  format: sampleFormat,
  fixtures: {
    'Sample document': 'A sample document.\nEdit me and the preview follows.',
    Empty: '',
    // Lines starting with '!' do not parse, so this opens in the raw view.
    'Invalid (opens raw)': '!not a sample line\nThe sample rejects lines starting with "!".',
  },
} satisfies HarnessFormat;
