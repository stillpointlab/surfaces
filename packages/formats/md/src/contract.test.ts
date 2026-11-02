// The host-contract conformance suites for the elements this format ships.
import {
  describeEditorContract,
  describePreviewContract,
} from '@stillpointlab/common-format/testing';
import { beforeAll, expect, vi } from 'vitest';

import './editor';
import './preview';

import type { ProseMirrorEditor } from './editor/prosemirror-editor';
import type { MdPreview } from './preview/md-preview';

beforeAll(() => {
  // ProseMirror's focus path uses execCommand for a Safari compatibility
  // workaround; jsdom does not provide the deprecated DOM method.
  if (typeof document.execCommand !== 'function') {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    });
  }
});

const content = '# Title\n\nSome **bold** text.';

describeEditorContract<ProseMirrorEditor>('md-editor', {
  content,
  altContent: '# Other\n\nMore text.',
  rendered: (el) => {
    expect(el.shadowRoot?.querySelector('.ProseMirror')?.textContent).toContain('Some bold text.');
  },
  // One user edit through the toolbar: wrap the current block in a blockquote.
  // While readonly the button is disabled, so the click is a no-op.
  edit: (el) => {
    const button = el.shadowRoot?.querySelector<HTMLButtonElement>(
      '.toolbar-button[data-command="toggleBlockquote"]'
    );
    if (!button) throw new Error('toolbar button missing');
    button.click();
  },
});

describePreviewContract<MdPreview>('md-preview', {
  content,
  rendered: (el) => {
    expect(el.shadowRoot?.querySelector('.md-preview-body')?.innerHTML).toContain('<h1>Title</h1>');
  },
});
