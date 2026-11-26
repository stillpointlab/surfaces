// What jsdom cannot show: pdf.js, in its worker, really draws a page, a later
// page once it is scrolled to, text through a character map and a JPEG 2000
// image through its JavaScript fallback; and a password, a file that is not a
// PDF and a missing file each fail as themselves. Nothing is dispatched by
// hand, and each test waits for the element's ready signal or for a canvas to
// arrive, never for a time. The PDFs are files of this package; the README has
// the command that made each.
import { setErrorHandler } from '@stillpointlab/common-format';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PackageFiles } from './files';

import './pdf-preview';

import type { PdfPreview } from './pdf-preview';

const text = new URL('../../dev/media/text.pdf', import.meta.url).href;
const pages = new URL('../../dev/media/pages.pdf', import.meta.url).href;
const cjk = new URL('../../dev/media/cjk.pdf', import.meta.url).href;
const jpx = new URL('../../dev/media/jpx.pdf', import.meta.url).href;
const embedded = new URL('../../dev/media/embedded-fonts.pdf', import.meta.url).href;
const password = new URL('../../dev/media/password.pdf', import.meta.url).href;
const notPdf = new URL('../../dev/media/not-a-pdf.pdf', import.meta.url).href;
const missing = new URL('../../dev/media/no-such-file.pdf', import.meta.url).href;

const create = (): PdfPreview => document.createElement('pdf-preview') as PdfPreview;
const statusOf = (el: PdfPreview) => el.shadowRoot!.querySelector('.pdf-preview > .spl-status');
const pagesOf = (el: PdfPreview) => [
  ...el.shadowRoot!.querySelectorAll<HTMLElement>('.pdf-preview__page'),
];
const canvasOf = (page: HTMLElement) => page.querySelector('canvas');

async function shown(src: string, name: string, height = 600): Promise<PdfPreview> {
  const el = create();
  el.style.height = `${height}px`;
  el.style.width = '640px';
  el.setSource(src, name);
  document.body.append(el);
  await el.whenReady();
  return el;
}

/**
 * The share of the pixels in a part of a canvas that are not white, and of those
 * that have colour (not grey). The part is given in fractions of the page, from
 * its top left.
 */
function inkOf(canvas: HTMLCanvasElement, [left, top, right, bottom] = [0, 0, 1, 1]) {
  const x = Math.floor(left * canvas.width);
  const y = Math.floor(top * canvas.height);
  const width = Math.max(1, Math.floor((right - left) * canvas.width));
  const height = Math.max(1, Math.floor((bottom - top) * canvas.height));
  const { data } = canvas.getContext('2d')!.getImageData(x, y, width, height);
  let ink = 0;
  let colour = 0;
  for (let at = 0; at < data.length; at += 4) {
    const [r, g, b] = [data[at], data[at + 1], data[at + 2]];
    if (r < 240 || g < 240 || b < 240) ink += 1;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) colour += 1;
  }
  const pixels = data.length / 4;
  return { ink: ink / pixels, colour: colour / pixels };
}

/** Resolves once `page` holds a canvas: the page has been drawn. */
function drawn(page: HTMLElement): Promise<HTMLCanvasElement> {
  return new Promise((done) => {
    const found = () => {
      const canvas = canvasOf(page);
      if (!canvas) return false;
      observer.disconnect();
      done(canvas);
      return true;
    };
    const observer = new MutationObserver(found);
    if (!found()) observer.observe(page, { childList: true });
  });
}

/** What pdf.js asked the package for, by kind and name. */
function asked(): { calls: string[] } & { restore: () => void } {
  const calls: string[] = [];
  const original = PackageFiles.prototype.fetch;
  const spy = vi.spyOn(PackageFiles.prototype, 'fetch').mockImplementation(function (
    this: PackageFiles,
    request
  ) {
    calls.push(`${request.kind} ${request.filename}`);
    return original.call(this, request);
  });
  return { calls, restore: () => spy.mockRestore() };
}

describe('pdf-preview in a browser', () => {
  afterEach(() => {
    document.body.replaceChildren();
    setErrorHandler(null);
    vi.restoreAllMocks();
  });

  it('draws a page with ink, sharp at the screen’s pixel ratio, and fetches the two standard fonts it needs', async () => {
    const files = asked();
    const el = await shown(text, 'text.pdf');

    const [first] = pagesOf(el);
    const canvas = canvasOf(first)!;
    expect(first.getAttribute('aria-label')).toBe('Page 1 of 1');
    expect(inkOf(canvas).ink).toBeGreaterThan(0.005);
    expect(canvas.width).toBe(Math.floor(first.clientWidth * devicePixelRatio));
    expect(el.shadowRoot!.querySelector('.pdf-preview__loading')).toBeNull();
    // Symbol and ZapfDingbats; Helvetica, Times and Courier are the browser's own.
    expect(files.calls.sort()).toEqual([
      'standardFontDataUrl FoxitDingbats.pfb',
      'standardFontDataUrl FoxitSymbol.pfb',
    ]);
  });

  it('fetches none of its files for a PDF whose fonts are embedded', async () => {
    const files = asked();
    const el = await shown(embedded, 'embedded-fonts.pdf');

    expect(inkOf(canvasOf(pagesOf(el)[0])!).ink).toBeGreaterThan(0.001);
    expect(files.calls).toEqual([]);
  });

  it('draws a later page when it is scrolled to, and not before', async () => {
    const el = await shown(pages, 'pages.pdf', 400);
    const all = pagesOf(el);
    expect(all).toHaveLength(12);
    expect(canvasOf(all[11])).toBeNull();
    // Each page has its place before it is drawn: the column is twelve pages long.
    const column = el.shadowRoot!.querySelector<HTMLElement>('.pdf-preview__pages')!;
    expect(column.scrollHeight).toBeGreaterThan(11 * all[0].clientHeight);

    column.scrollTop = column.scrollHeight;
    const last = await drawn(all[11]);

    expect(inkOf(last).ink).toBeGreaterThan(0.005);
    // The first page, far off now, gave its canvas back.
    expect(canvasOf(all[0])).toBeNull();
    expect(el.shadowRoot!.querySelectorAll('canvas').length).toBeLessThanOrEqual(5);
  });

  it('draws text that needs a character map', async () => {
    const files = asked();
    const el = await shown(cjk, 'cjk.pdf');

    expect(files.calls).toContain('cMapUrl UniJIS-UCS2-H.bcmap');
    // The Japanese line, 32 units high from 680 up on a page 792 high.
    const line = inkOf(canvasOf(pagesOf(el)[0])!, [0.1, 0.08, 0.9, 0.16]);
    expect(line.ink).toBeGreaterThan(0.01);
  });

  it('draws a JPEG 2000 image without WebAssembly, and asks for no .wasm', async () => {
    const files = asked();
    const el = await shown(jpx, 'jpx.pdf');

    // The image: 400 by 300 from (106, 400), on a page 612 by 792.
    const image = inkOf(canvasOf(pagesOf(el)[0])!, [0.2, 0.15, 0.8, 0.45]);
    expect(image.ink).toBeGreaterThan(0.9);
    expect(image.colour).toBeGreaterThan(0.5);
    expect(files.calls.filter((call) => call.startsWith('wasmUrl'))).toEqual([]);
    const wasm = performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('.wasm'));
    expect(wasm).toEqual([]);
  });

  it.each([
    [
      'a PDF with a password',
      password,
      "This PDF needs a password, and this preview can't ask for one yet.",
    ],
    ['a file that is not a PDF', notPdf, "This file can't be read as a PDF."],
    ['a missing file', missing, "Couldn't load this PDF."],
  ])('says %s in its sentence, and reports it once', async (_, src, words) => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const el = await shown(src, 'file.pdf');

    expect(statusOf(el)?.textContent).toBe(words);
    expect(pagesOf(el)).toHaveLength(0);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('PDF preview failed to load', { src });
  });
});
