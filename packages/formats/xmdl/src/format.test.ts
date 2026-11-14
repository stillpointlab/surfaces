// The descriptor suite over the `./format` entry alone, so the suite sees the tags
// as importing it left them.
import { describeFormatDescriptor } from '@stillpointlab/common-format/testing';

import { xmdlFormat } from './format';

describeFormatDescriptor(xmdlFormat, [
  {
    path: 'templates/brief.xmdl',
    text: [
      '---',
      'title: Brief Template',
      'version: 0.1.0',
      'outputFileType: markdown',
      'params:',
      '  - name: title',
      '    type: string',
      '    required: true',
      '---',
      '# {{title}}',
      '',
    ].join('\n'),
  },
]);
