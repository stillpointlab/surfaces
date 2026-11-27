// A page's text, with pdf.js stood in for (`testing/fake-pdfjs.ts`): laid over a
// drawn page once its canvas is shown, and after ready; given back with the
// canvas; cancelled with the drawing; brought to a new width with the canvas; and
// none for a page with none, which stays a picture to a reader.
import { setErrorHandler } from '@stillpointlab/common-format';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { answer, FakeDocument, resetEngine } from '../testing/fake-pdfjs';

import { SELECTING } from './pages';

import './pdf-preview';

import type { PdfPreview } from './pdf-preview';

vi.mock('./engine', async () => (await import('../testing/fake-pdfjs')).fakeEngine);
vi.mock('../worker/start', async () => {
  const fake = await import('../testing/fake-pdfjs');
  return { startWorker: vi.fn(fake.startFakeWorker) };
});

const pagesOf = (el: PdfPreview) => [
  ...el.shadowRoot!.querySelectorAll<HTMLElement>('.pdf-preview__page'),
];
const textOf = (page: HTMLElement) => page.querySelector<HTMLElement>('.pdf-preview__text');
const spansOf = (page: HTMLElement) =>
  [...(textOf(page)?.querySelectorAll('span') ?? [])].map((span) => span.textContent);

/** A tick, for the microtasks between an answer and what the element does with it. */
const tick = () => new Promise<void>((done) => setTimeout(done, 0));

async function opens(doc: FakeDocument, src = '/files/a.pdf'): Promise<PdfPreview> {
  const el = document.createElement('pdf-preview') as PdfPreview;
  el.setSource(src, 'a.pdf');
  document.body.append(el);
  answer(src, doc);
  await el.whenReady();
  return el;
}

/** A document of `count` pages, each with two lines of text. */
function withText(count: number): FakeDocument {
  const doc = new FakeDocument(count);
  for (const page of doc.pages) page.text = [`Page ${page.number}, line one`, 'line two'];
  return doc;
}

describe('pdf-preview text', () => {
  beforeEach(() => resetEngine());

  afterEach(async () => {
    document.body.replaceChildren();
    await tick();
    setErrorHandler(null);
    vi.unstubAllGlobals();
  });

  it('lays a drawn page’s text over its canvas: a group labelled with its page, the canvas hidden', async () => {
    const doc = withText(1);
    const el = await opens(doc);
    await tick();

    const [page] = pagesOf(el);
    expect(spansOf(page)).toEqual(['Page 1, line one', 'line two']);
    expect(page.getAttribute('role')).toBe('group');
    expect(page.getAttribute('aria-label')).toBe('Page 1 of 1');
    expect(page.querySelector('canvas')!.getAttribute('aria-hidden')).toBe('true');
    // Over the canvas, after it, with the end pdf.js's viewer puts after the text.
    expect([...page.children].map((child) => child.className || child.tagName)).toEqual([
      'CANVAS',
      'pdf-preview__text',
    ]);
    expect(textOf(page)!.lastElementChild!.className).toBe('pdf-preview__text-end');
    // At the width the canvas is drawn at: jsdom lays nothing out, so its size at 100%.
    const [layer] = doc.pages[0].texts;
    expect(layer.container).toBe(textOf(page));
    expect(layer.viewports[0].scale).toBeCloseTo(96 / 72);
    expect(Number(textOf(page)!.style.getPropertyValue('--total-scale-factor'))).toBeCloseTo(
      96 / 72
    );
  });

  it('draws every page near view before laying any page’s text, and lays it one page at a time', async () => {
    const doc = withText(3);
    for (const page of doc.pages) page.textAtOnce = false;
    const el = await opens(doc);
    await tick();

    expect(pagesOf(el).map((page) => page.querySelector('canvas') !== null)).toEqual([
      true,
      true,
      true,
    ]);
    expect(doc.pages.map((page) => page.texts.length)).toEqual([1, 0, 0]);

    doc.pages[0].texts[0].lay();
    await tick();
    expect(doc.pages.map((page) => page.texts.length)).toEqual([1, 1, 0]);
    expect(spansOf(pagesOf(el)[0])).toEqual(['Page 1, line one', 'line two']);
  });

  it('is ready on the first page drawn, not on its text', async () => {
    const doc = withText(1);
    doc.pages[0].textAtOnce = false;
    const el = await opens(doc);
    await tick();

    const [page] = pagesOf(el);
    expect(el.hasAttribute('ready')).toBe(true);
    expect(page.querySelector('canvas')).not.toBeNull();
    expect(textOf(page)).toBeNull();
    expect(page.getAttribute('role')).toBe('img');

    doc.pages[0].texts[0].lay();
    await tick();
    expect(spansOf(page)).toEqual(['Page 1, line one', 'line two']);
    expect(page.getAttribute('role')).toBe('group');
  });

  it('gives a page with no text none, and leaves it a picture', async () => {
    const doc = new FakeDocument(1);
    const el = await opens(doc);
    await tick();

    const [page] = pagesOf(el);
    expect(doc.pages[0].texts).toHaveLength(1);
    expect(textOf(page)).toBeNull();
    expect(page.getAttribute('role')).toBe('img');
    expect(page.querySelector('canvas')).not.toBeNull();
  });

  it('says nothing of a page whose text pdf.js cannot read, and draws it', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const doc = withText(1);
    doc.pages[0].textAtOnce = false;
    const el = await opens(doc);
    await tick();

    doc.pages[0].texts[0].fail();
    await tick();

    const [page] = pagesOf(el);
    expect(textOf(page)).toBeNull();
    expect(page.getAttribute('role')).toBe('img');
    expect(page.querySelector('.spl-status')).toBeNull();
    expect(page.querySelector('canvas')).not.toBeNull();
    expect(handler).not.toHaveBeenCalled();
    // Not asked for again.
    expect(doc.pages[0].texts).toHaveLength(1);
  });

  it('cancels the text being laid when it leaves the page, and lays it again when put back', async () => {
    const doc = withText(1);
    doc.pages[0].textAtOnce = false;
    const el = await opens(doc);
    await tick();
    const [first] = doc.pages[0].texts;

    el.remove();
    await tick();
    expect(first.cancelled).toBe(true);

    doc.pages[0].textAtOnce = true;
    document.body.append(el);
    await tick();
    // The canvas was kept, and drawn again for nothing; the text is laid anew.
    expect(doc.pages[0].renders).toHaveLength(1);
    expect(doc.pages[0].texts).toHaveLength(2);
    expect(spansOf(pagesOf(el)[0])).toEqual(['Page 1, line one', 'line two']);
  });

  it('keeps a page’s text laid when it leaves the page, as it keeps the canvas', async () => {
    const doc = withText(1);
    const el = await opens(doc);
    await tick();

    el.remove();
    await tick();
    document.body.append(el);
    await tick();

    expect(doc.pages[0].texts).toHaveLength(1);
    expect(doc.pages[0].texts[0].cancelled).toBe(false);
    expect(spansOf(pagesOf(el)[0])).toEqual(['Page 1, line one', 'line two']);
  });

  it('gives the text back with the old source', async () => {
    const doc = withText(2);
    const el = await opens(doc);
    await tick();

    el.setSource('/files/b.pdf', 'b.pdf');

    expect(el.shadowRoot!.querySelectorAll('.pdf-preview__text')).toHaveLength(0);
  });

  it('marks the column while the mouse is down in it, until it comes up anywhere', async () => {
    const el = await opens(withText(1));
    await tick();
    const column = el.shadowRoot!.querySelector('.pdf-preview__pages')!;

    textOf(pagesOf(el)[0])!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, composed: true })
    );
    expect(column.classList.contains(SELECTING)).toBe(true);

    document.body.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(column.classList.contains(SELECTING)).toBe(false);

    column.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    window.dispatchEvent(new Event('blur'));
    expect(column.classList.contains(SELECTING)).toBe(false);
  });
});

describe('pdf-preview text near view', () => {
  let observers: { callback: IntersectionObserverCallback; targets: Element[] }[] = [];

  function scrollTo(...pages: number[]): void {
    for (const { callback, targets } of observers) {
      const entries = targets.map((target) => ({
        target,
        isIntersecting: pages.includes(Number((target as HTMLElement).dataset.page)),
      }));
      callback(entries as unknown as IntersectionObserverEntry[], {} as IntersectionObserver);
    }
  }

  beforeEach(() => {
    resetEngine();
    observers = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        private readonly seen: { callback: IntersectionObserverCallback; targets: Element[] };
        constructor(callback: IntersectionObserverCallback) {
          this.seen = { callback, targets: [] };
          observers.push(this.seen);
        }
        observe(target: Element) {
          this.seen.targets.push(target);
        }
        disconnect() {
          observers = observers.filter((observer) => observer !== this.seen);
        }
      }
    );
  });

  afterEach(async () => {
    document.body.replaceChildren();
    await tick();
    vi.unstubAllGlobals();
  });

  const withTextNow = (el: PdfPreview) =>
    pagesOf(el)
      .filter((page) => textOf(page))
      .map((page) => Number(page.dataset.page));

  it('holds text for the pages that hold a canvas, and gives it back with the canvas', async () => {
    const doc = withText(200);
    const el = await opens(doc);
    scrollTo(1);
    await tick();
    expect(withTextNow(el)).toEqual([1, 2, 3]);

    scrollTo(100, 101);
    await tick();
    expect(withTextNow(el)).toEqual([98, 99, 100, 101, 102, 103]);
    const first = pagesOf(el)[0];
    expect(first.querySelector('canvas')).toBeNull();
    expect(textOf(first)).toBeNull();
    expect(first.getAttribute('role')).toBe('img');
    expect(first.getAttribute('aria-label')).toBe('Page 1 of 200');
  });

  it('cancels the text of a page that leaves the neighbourhood while it is laid', async () => {
    const doc = withText(50);
    const el = await opens(doc);
    scrollTo(1);
    await tick();
    doc.pages[29].textAtOnce = false;

    scrollTo(30);
    await tick();
    const laying = doc.pages[29].texts[0];
    scrollTo(1);
    await tick();

    expect(laying.cancelled).toBe(true);
    expect(textOf(pagesOf(el)[29])).toBeNull();
    expect(withTextNow(el)).toEqual([1, 2, 3]);
  });

  it('draws a page that comes near while text is laid before laying more text', async () => {
    const doc = withText(20);
    for (const page of doc.pages) page.textAtOnce = false;
    const el = await opens(doc);
    scrollTo(1);
    await tick();
    expect(doc.pages[0].texts).toHaveLength(1);
    doc.pages[3].drawAtOnce = false;

    scrollTo(2);
    doc.pages[0].texts[0].lay();
    await tick();
    // Page 4's canvas first: page 2's text waits for it.
    expect(doc.pages[3].renders).toHaveLength(1);
    expect(doc.pages[1].texts).toHaveLength(0);

    doc.pages[3].renders[0].draw();
    await tick();
    expect(pagesOf(el)[3].querySelector('canvas')).not.toBeNull();
    expect(doc.pages[1].texts).toHaveLength(1);
  });

  it('cancels nothing of a page’s text when its canvas is cancelled before it is drawn', async () => {
    const doc = withText(50);
    await opens(doc);
    scrollTo(1);
    await tick();
    doc.pages[29].drawAtOnce = false;

    scrollTo(30);
    await tick();
    scrollTo(1);
    await tick();

    // Its text is laid only once its canvas is shown, so there was none to cancel.
    expect(doc.pages[29].renders[0].cancelled).toBe(true);
    expect(doc.pages[29].texts).toHaveLength(0);
  });
});

describe('pdf-preview text as its width changes', () => {
  let resized: ResizeObserverCallback | null = null;

  beforeEach(() => {
    resetEngine();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resized = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
  });

  afterEach(async () => {
    vi.useRealTimers();
    document.body.replaceChildren();
    await tick();
    vi.unstubAllGlobals();
  });

  it('brings the text to the width its canvas is drawn at again', async () => {
    const doc = withText(1);
    const el = await opens(doc);
    await tick();
    const column = el.shadowRoot!.querySelector<HTMLElement>('.pdf-preview__pages')!;
    const page = pagesOf(el)[0];
    const text = textOf(page)!;
    Object.defineProperty(column, 'clientWidth', { get: () => 432 });
    page.getBoundingClientRect = () => ({ width: 400 }) as DOMRect;
    vi.useFakeTimers();

    resized!([], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(200);
    vi.useRealTimers();
    await tick();

    expect(doc.pages[0].renders).toHaveLength(2);
    // The same text, at the new width, over the new canvas.
    expect(doc.pages[0].texts).toHaveLength(1);
    expect(textOf(page)).toBe(text);
    expect(doc.pages[0].texts[0].viewports.at(-1)!.scale).toBeCloseTo(400 / 612);
    expect(Number(text.style.getPropertyValue('--total-scale-factor'))).toBeCloseTo(400 / 612);
    expect(page.querySelector('canvas')).toBe(doc.pages[0].renders[1].canvas);
    expect(page.querySelectorAll('canvas')).toHaveLength(1);
  });
});
