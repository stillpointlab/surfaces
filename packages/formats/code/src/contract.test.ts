// The host-contract conformance suites for the elements this format ships.
import {
  describeDiffContract,
  describeEditorContract,
  describePreviewContract,
} from '@stillpointlab/common-format/testing';
import { beforeAll, expect, vi } from 'vitest';

import './editor';
import './preview';
import './diff';

import type { CodeDiff } from './diff/code-diff';
import type { CodeEditor } from './editor/code-editor';
import type { CodePreview } from './preview/code-preview';

beforeAll(() => {
  // CodeMirror's selection synchronization uses execCommand for a Safari
  // compatibility path; jsdom does not provide the deprecated DOM method.
  if (typeof document.execCommand !== 'function') {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    });
  }
});

const content = 'const value = 1;';
const text = (el: HTMLElement) => el.shadowRoot?.querySelector('.cm-content')?.textContent ?? '';

describeEditorContract<CodeEditor>('code-editor', {
  content,
  rendered: (el, expected) => expect(text(el)).toContain(expected),
  // One user edit: Tab in normal mode indents the line.
  edit: (el) => {
    const surface = el.shadowRoot?.querySelector<HTMLElement>('.cm-content');
    if (!surface) throw new Error('editing surface missing');
    surface.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    Object.defineProperty(event, 'keyCode', { value: 9 });
    surface.dispatchEvent(event);
  },
});

describePreviewContract<CodePreview>('code-preview', {
  content,
  rendered: (el, expected) => expect(text(el)).toContain(expected),
});

describeDiffContract<CodeDiff>('code-diff', {
  left: 'const value = 1;',
  right: 'const value = 2;',
});
