// The descriptor suite over the `./format` entry alone, so the suite sees the tags
// as importing it left them.
import { describeFormatDescriptor } from '@stillpointlab/common-format/testing';

import { mdFormat } from './format';

describeFormatDescriptor(mdFormat, [
  { path: 'notes.md', text: '# Title\n\nSome **bold** text.\n' },
  { path: 'docs/README.markdown', text: '---\ntitle: Front\n---\n\n- one\n- two\n' },
]);
