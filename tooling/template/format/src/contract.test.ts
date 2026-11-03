// The host-contract conformance suites for the elements this format ships. A
// format's own tests cover what the contract does not: see core/parse.test.ts.
import {
  describeEditorContract,
  describePreviewContract,
  describeRawViewContract,
} from '@stillpointlab/common-format/testing';
import { expect } from 'vitest';

import './editor';
import './preview';

import type { SampleEditor } from './editor/sample-editor';
import type { SamplePreview } from './preview/sample-preview';

const content = 'one\ntwo';

describeEditorContract<SampleEditor>('sample-editor', {
  content,
  rendered: (el, expected) =>
    expect(el.shadowRoot?.querySelector('textarea')?.value).toBe(expected),
  // One user edit: type into the textarea.
  edit: (el) => {
    const area = el.shadowRoot?.querySelector('textarea');
    if (!area) throw new Error('textarea missing');
    if (area.readOnly) return;
    area.value = 'edited';
    area.dispatchEvent(new Event('input'));
  },
});

describePreviewContract<SamplePreview>('sample-preview', {
  content,
  rendered: (el, expected) =>
    expect(el.shadowRoot?.querySelector('pre')?.textContent).toBe(expected),
});

describeRawViewContract<SampleEditor>('sample-editor', {
  kind: 'editor',
  content,
  invalidContent: '!bad',
  otherInvalidContent: 'fine\n!worse',
});

describeRawViewContract<SamplePreview>('sample-preview', {
  kind: 'preview',
  content,
  invalidContent: '!bad',
});
