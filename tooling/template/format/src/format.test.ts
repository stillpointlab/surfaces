// The descriptor suite over the `./format` entry alone, so the suite sees the tags
// as importing it left them: one file per extension the format opens.
import { describeFormatDescriptor } from '@stillpointlab/common-format/testing';

import { sampleFormat } from './format';

describeFormatDescriptor(sampleFormat, [
  { path: 'notes.sample', text: 'one\ntwo\n' },
  { path: 'docs/empty.sample', text: '' },
]);
