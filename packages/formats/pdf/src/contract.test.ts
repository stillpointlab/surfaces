// The host-contract conformance suite for the element this format ships. jsdom
// has no worker and no canvas that draws, so pdf.js and the worker are stood in
// for (`testing/fake-pdfjs.ts`): the hooks say the document opened (and its
// page is drawn at once) or failed to load.
import { describeUrlPreviewContract } from '@stillpointlab/common-format/testing';
import { afterEach, expect, vi } from 'vitest';

import { answer, FakeDocument, pdfjsError, resetEngine, taskFor } from './testing/fake-pdfjs';

import './preview';

import type { PdfPreview } from './preview/pdf-preview';

vi.mock('./preview/engine', async () => (await import('./testing/fake-pdfjs')).fakeEngine);
vi.mock('./worker/start', async () => ({
  startWorker: (await import('./testing/fake-pdfjs')).startFakeWorker,
}));

afterEach(() => resetEngine());

const src = '/files/report.pdf';
const frameOf = (el: PdfPreview) => el.shadowRoot?.querySelector('.pdf-preview');

describeUrlPreviewContract<PdfPreview>('pdf-preview', {
  src,
  name: 'report.pdf',
  load: () => answer(src, new FakeDocument(2)),
  fail: () => answer(src, pdfjsError('ResponseException', 'Unexpected server response (404)')),
  shows: (el, shown, name) => {
    expect(frameOf(el)?.getAttribute('aria-label')).toBe(name);
    // Once the engine has it, it is the source the element was given.
    const task = taskFor(shown);
    if (task) expect(task.destroyed).toBe(false);
  },
  empty: (el) => {
    expect(frameOf(el)?.textContent).toBe('No PDF selected.');
    expect(el.shadowRoot?.querySelector('canvas')).toBeNull();
  },
});
