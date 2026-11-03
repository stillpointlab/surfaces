// The keymap check defines a <code-editor> stand-in, so it has this file to itself.
import { describeKeymapModeContract } from '@stillpointlab/common-format/testing';
import { beforeAll, vi } from 'vitest';

import './editor';

import type { ProseMirrorEditor } from './editor/prosemirror-editor';

beforeAll(() => {
  // ProseMirror's focus path uses execCommand; jsdom does not provide it.
  if (typeof document.execCommand !== 'function') {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    });
  }
});

describeKeymapModeContract<ProseMirrorEditor>('md-editor', {
  content: '# Title\n\nSome **bold** text.',
});
