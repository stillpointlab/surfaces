// The keymap check defines a <code-editor> stand-in, so it has this file to itself.
import { describeKeymapModeContract } from '@stillpointlab/common-format/testing';

import './editor';

import type { SampleEditor } from './editor/sample-editor';

describeKeymapModeContract<SampleEditor>('sample-editor', {
  content: 'one\ntwo',
});
