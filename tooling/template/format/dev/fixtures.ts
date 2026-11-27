// This format in the surfaces harness (`npm run dev`), mounted through its
// descriptor as a host would: named fixtures, and any controls beyond the common
// ones. A fixture's path defaults to its name plus the first extension it opens.
import { sampleFormat } from '../src/format';

import type { HarnessFormat } from '../../../../tooling/harness/types';

export default {
  format: sampleFormat,
  fixtures: {
    // Text as the template reads it; replace these with documents of this format.
    'A document': 'A document of lines.\nEdit me and the preview follows.',
    Empty: '',
    // Lines starting with '!' do not parse, so this opens in the raw view.
    'Invalid (opens raw)':
      '!not a line that parses\nThe template refuses a line that starts with "!".',
  },
} satisfies HarnessFormat;
