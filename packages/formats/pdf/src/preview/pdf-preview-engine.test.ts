// pdf.js itself not arriving (its module's import failed, a host that went
// away) is the first sentence, and the next PDF tries the import again. In a
// file of its own: the engine is imported once a page, and here it fails.
import { setErrorHandler } from '@stillpointlab/common-format';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answer, FakeDocument } from '../testing/fake-pdfjs';

import './pdf-preview';

import type { PdfPreview } from './pdf-preview';

const imports = vi.hoisted(() => ({ count: 0 }));

vi.mock('./engine', async () => {
  imports.count += 1;
  if (imports.count === 1) throw new TypeError('Failed to fetch dynamically imported module');
  return (await import('../testing/fake-pdfjs')).fakeEngine;
});
vi.mock('../worker/start', async () => ({
  startWorker: (await import('../testing/fake-pdfjs')).startFakeWorker,
}));

describe('pdf-preview when pdf.js does not arrive', () => {
  afterEach(() => {
    document.body.replaceChildren();
    setErrorHandler(null);
  });

  it('says the first sentence, reports it once, and the next PDF imports it again', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const el = document.createElement('pdf-preview') as PdfPreview;
    el.setSource('/files/a.pdf', 'a.pdf');
    document.body.append(el);
    await el.whenReady();

    expect(el.shadowRoot!.querySelector('.spl-status')?.textContent).toBe(
      "Couldn't load this PDF."
    );
    expect(handler).toHaveBeenCalledTimes(1);

    const next = document.createElement('pdf-preview') as PdfPreview;
    next.setSource('/files/b.pdf', 'b.pdf');
    document.body.append(next);
    answer('/files/b.pdf', new FakeDocument(1));
    await next.whenReady();
    expect(next.shadowRoot!.querySelector('canvas')).not.toBeNull();
  });
});
