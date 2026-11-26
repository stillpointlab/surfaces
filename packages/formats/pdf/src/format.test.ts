// The descriptor suite over the `./format` entry alone, so the suite sees the tag
// as importing it left it: a file the format opens, with a URL and no text.
// pdf.js and the worker are stood in for, as in the element's own tests.
import { createFormatRegistry } from '@stillpointlab/common-format/format';
import { describeFormatDescriptor } from '@stillpointlab/common-format/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pdfFormat } from './format';
import { answer, FakeDocument, resetEngine } from './testing/fake-pdfjs';

vi.mock('./preview/engine', async () => (await import('./testing/fake-pdfjs')).fakeEngine);
vi.mock('./worker/start', async () => ({
  startWorker: (await import('./testing/fake-pdfjs')).startFakeWorker,
}));

afterEach(() => resetEngine());

describeFormatDescriptor(
  pdfFormat,
  [
    { path: 'media/report.pdf', url: '/files/media/report.pdf' },
    { path: 'media/Scan.PDF', url: '/files/media/Scan.PDF' },
  ],
  // jsdom draws nothing: open the document the element waits for.
  {
    load: (element) => answer(element.getAttribute('src') ?? '', new FakeDocument(1)),
  }
);

describe('pdfFormat', () => {
  it('opens .pdf, in any case, and nothing else', () => {
    const registry = createFormatRegistry([pdfFormat]);
    expect(registry.find('a/b.pdf')).toBe(pdfFormat);
    expect(registry.find('a/b.PDF')).toBe(pdfFormat);
    for (const other of ['x.ps', 'x.eps', 'x.xps', 'x.djvu', 'x.pdf.txt']) {
      expect(registry.find(other)).toBeNull();
    }
  });

  it('sets the URL as the source and the file name as its name', async () => {
    await pdfFormat.preview.load();
    const element = document.createElement(pdfFormat.preview.tag);
    pdfFormat.apply(element, { path: 'media/report.pdf', url: '/files/report' });

    expect(element.getAttribute('src')).toBe('/files/report');
    expect(element.getAttribute('name')).toBe('report.pdf');
  });
});
