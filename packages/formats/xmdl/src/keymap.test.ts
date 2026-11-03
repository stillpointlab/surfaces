// The keymap check defines a <code-editor> stand-in, so it has this file to itself.
import { describeKeymapModeContract } from '@stillpointlab/common-format/testing';

import './editor';

import type { XmdlEditor } from './editor/xmdl-editor';

describeKeymapModeContract<XmdlEditor>('xmdl-editor', {
  content: [
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
});
