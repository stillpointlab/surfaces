// The host-contract conformance suites for the elements this format ships.
import {
  describeEditorContract,
  describePreviewContract,
  describeRawViewContract,
} from '@stillpointlab/common-format/testing';
import { expect } from 'vitest';

import './editor';
import './preview';

import type { XmdlEditor } from './editor/xmdl-editor';
import type { XmdlPreview } from './preview/xmdl-preview';

const content = `---
title: Brief Template
version: 0.1.0
outputFileType: markdown
params:
  - name: title
    type: string
    required: true
---
# {{title}}
`;

describeEditorContract<XmdlEditor>('xmdl-editor', {
  content,
  altContent: content.replace('Brief Template', 'Other Template'),
  rendered: (el) => expect(el.shadowRoot?.textContent).toContain('Brief Template'),
  // One user edit: switch to raw and type into the source textarea. While
  // readonly the raw text is read-only, so the typing changes nothing.
  edit: (el) => {
    const toggle = el.shadowRoot?.querySelector<HTMLButtonElement>(
      '.xmdl-editor__mode-toggle[role="switch"]'
    );
    if (!toggle) throw new Error('mode switch missing');
    toggle.click();
    const source = el.shadowRoot?.querySelector<HTMLTextAreaElement>('textarea[data-spl-raw]');
    if (!source) return;
    source.value = content.replace('Brief Template', 'Edited Template');
    source.dispatchEvent(new Event('input', { bubbles: true }));
  },
});

describeRawViewContract<XmdlEditor>('xmdl-editor', {
  kind: 'editor',
  content,
  invalidContent: '---\ntitle: [unclosed\n---\n# {{title}}\n',
  otherInvalidContent: content.replace('# {{title}}', '# {{missing}}'),
});

describePreviewContract<XmdlPreview>('xmdl-preview', {
  content,
  rendered: (el) => expect(el.shadowRoot?.textContent).toContain('Brief Template'),
});
