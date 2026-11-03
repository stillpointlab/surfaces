// The keymap check defines a <code-editor> stand-in, so it has this file to itself.
import { describeKeymapModeContract } from '@stillpointlab/common-format/testing';

import './editor';

import type { SheetEditor } from './editor/sheet-editor';

describeKeymapModeContract<SheetEditor>('sheet-editor', {
  content: 'Name,Value\nCoffee,12',
});
