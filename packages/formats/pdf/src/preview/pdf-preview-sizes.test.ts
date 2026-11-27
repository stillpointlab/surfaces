// The pages' sizes, with pdf.js stood in for (`testing/fake-pdfjs.ts`): the first
// page's alone read before it is drawn, the others laid out at it and read once
// it is drawn, fifty at a time; no page drawn before its own size is read; a page
// that cannot be read in its place; and the page in view kept where it is on the
// screen as the boxes above it take their sizes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { answer, FakeDocument, resetEngine } from '../testing/fake-pdfjs';

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
const columnOf = (el: PdfPreview) =>
  el.shadowRoot!.querySelector<HTMLElement>('.pdf-preview__pages')!;
const ratios = (el: PdfPreview) => pagesOf(el).map((page) => page.style.aspectRatio);
const tick = () => new Promise<void>((done) => setTimeout(done, 0));
const numbers = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, at) => from + at);

function shown(doc: FakeDocument, src = '/files/a.pdf'): PdfPreview {
  const el = document.createElement('pdf-preview') as PdfPreview;
  el.setSource(src, 'a.pdf');
  document.body.append(el);
  answer(src, doc);
  return el;
}

describe('pdf-preview page sizes', () => {
  beforeEach(() => resetEngine());

  afterEach(async () => {
    document.body.replaceChildren();
    await tick();
    vi.unstubAllGlobals();
  });

  it('draws the first page having read its size alone, the others laid out at it', async () => {
    const doc = new FakeDocument(120);
    Object.assign(doc.pages[0], { width: 792, height: 612 });
    doc.pages[0].drawAtOnce = false;
    const el = shown(doc);
    await tick();

    expect(doc.asked).toEqual([1]);
    expect(pagesOf(el)).toHaveLength(120);
    expect(new Set(ratios(el))).toEqual(new Set(['792 / 612']));
    expect(pagesOf(el)[119].style.width).toBe('min(100%, 1056px)');
    expect(pagesOf(el)[119].getAttribute('aria-label')).toBe('Page 120 of 120');
    expect(doc.pages[0].renders).toHaveLength(1);
    expect(el.hasAttribute('ready')).toBe(false);
  });

  it('reads the other sizes once the first page is drawn, fifty at a time, and gives each box its own', async () => {
    const doc = new FakeDocument(120);
    Object.assign(doc.pages[0], { width: 792, height: 612 });
    doc.pages[0].drawAtOnce = false;
    const el = shown(doc);
    await tick();
    doc.readAtOnce = false;

    doc.pages[0].renders[0].draw();
    await el.whenReady();
    await tick();
    // Pages 2 and 3, near view, to draw them; and the first fifty, in the background.
    expect(doc.asked.slice(1).sort((a, b) => a - b)).toEqual([2, 2, 3, 3, ...numbers(4, 50)]);
    expect(doc.pages[1].renders).toHaveLength(0);

    doc.answerReads();
    await tick();
    expect(doc.asked.slice(-50)).toEqual(numbers(51, 100));
    doc.answerReads();
    await tick();
    expect(doc.asked.slice(-20)).toEqual(numbers(101, 120));
    doc.answerReads();
    await tick();

    expect(doc.unanswered).toBe(0);
    expect(ratios(el)).toEqual(['792 / 612', ...Array(119).fill('612 / 792')]);
    expect(doc.pages[1].renders).toHaveLength(1);
  });

  it('draws no page before its own size is read, and draws it at that size', async () => {
    const doc = new FakeDocument(3);
    Object.assign(doc.pages[1], { width: 400, height: 600 });
    doc.pages[0].drawAtOnce = false;
    const el = shown(doc);
    await tick();
    doc.readAtOnce = false;
    // Page 1's size was read; pages 2 and 3 wait for theirs.
    doc.pages[0].renders[0].draw();
    await el.whenReady();
    await tick();
    expect(doc.pages[1].renders).toHaveLength(0);
    expect(pagesOf(el)[1].style.aspectRatio).toBe('612 / 792');

    doc.answerReads();
    await tick();
    expect(pagesOf(el)[1].style.aspectRatio).toBe('400 / 600');
    // jsdom lays nothing out: drawn at its own size at 100%, 533 CSS pixels.
    expect(doc.pages[1].renders[0].scale).toBeCloseTo(533 / 400);
  });

  it('says a page pdf.js cannot read in its own place, at the size it was laid out at', async () => {
    const doc = new FakeDocument(3, [2]);
    Object.assign(doc.pages[0], { width: 792, height: 612 });
    const el = shown(doc);
    await el.whenReady();
    await tick();

    const pages = pagesOf(el);
    expect(pages[1].textContent).toBe("This page couldn't be drawn.");
    expect(pages[1].getAttribute('aria-label')).toBe('Page 2 of 3');
    expect(pages[1].style.aspectRatio).toBe('792 / 612');
    expect(pages[0].querySelector('canvas')).not.toBeNull();
    expect(pages[2].querySelector('canvas')).not.toBeNull();
  });

  it('lays the pages out at a letter page’s size when the first cannot be read, and draws the others', async () => {
    const doc = new FakeDocument(3, [1]);
    Object.assign(doc.pages[1], { width: 400, height: 600 });
    const el = shown(doc);
    await el.whenReady();
    await tick();

    expect(pagesOf(el)[0].textContent).toBe("This page couldn't be drawn.");
    expect(ratios(el)).toEqual(['612 / 792', '400 / 600', '612 / 792']);
    expect(pagesOf(el)[1].querySelector('canvas')).not.toBeNull();
  });

  it('is ready when no page can be read', async () => {
    const el = shown(new FakeDocument(2, [1, 2]));
    await el.whenReady();

    expect(pagesOf(el).map((page) => page.textContent)).toEqual([
      "This page couldn't be drawn.",
      "This page couldn't be drawn.",
    ]);
  });
});

describe('pdf-preview page sizes, in view', () => {
  // The pages in view, as an IntersectionObserver of the column would say.
  let observe: IntersectionObserverCallback | null = null;
  let targets: Element[] = [];

  beforeEach(() => {
    resetEngine();
    targets = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          observe = callback;
        }
        observe(target: Element) {
          targets.push(target);
        }
        disconnect() {}
      }
    );
  });

  afterEach(async () => {
    document.body.replaceChildren();
    await tick();
    vi.unstubAllGlobals();
  });

  function scrollTo(page: number): void {
    const entries = targets.map((target) => ({
      target,
      isIntersecting: Number((target as HTMLElement).dataset.page) === page,
    }));
    observe!(entries as unknown as IntersectionObserverEntry[], {} as IntersectionObserver);
  }

  /**
   * A layout jsdom does not do: the pages one under another, 600 CSS pixels
   * wide, each as high as its aspect ratio makes it, under the column's scroll,
   * in a column 600 high.
   */
  function laidOut(el: PdfPreview): void {
    const column = columnOf(el);
    column.getBoundingClientRect = () => ({ top: 0, bottom: 600 }) as DOMRect;
    const height = (page: HTMLElement) => {
      const [width, high] = page.style.aspectRatio.split(' / ').map(Number);
      return (600 * high) / width;
    };
    for (const page of pagesOf(el)) {
      page.getBoundingClientRect = () => {
        let top = -column.scrollTop;
        for (let above = page.previousElementSibling; above; above = above.previousElementSibling) {
          top += height(above as HTMLElement);
        }
        return { top, bottom: top + height(page), width: 600, height: height(page) } as DOMRect;
      };
    }
  }

  it.each([
    ['once the observer has said it is in view', true],
    ['before the observer has said what is in view', false],
  ])(
    'keeps the page in view where it is on the screen as the boxes above it take their sizes, %s',
    async (_, observed) => {
      // A tall first page, and shorter ones after it.
      const doc = new FakeDocument(100);
      Object.assign(doc.pages[0], { width: 612, height: 1584 });
      doc.pages[0].drawAtOnce = false;
      const el = shown(doc);
      await tick();
      laidOut(el);
      const column = columnOf(el);
      const page40 = pagesOf(el)[39];

      // Scrolled to page 40 while every box above it is as tall as the first page.
      column.scrollTop = 39 * 1552.94;
      if (observed) scrollTo(40);
      expect(page40.getBoundingClientRect().top).toBeCloseTo(0, 0);
      // Drawn, unless it was given back for page 40.
      doc.pages[0].renders[0].draw();
      await el.whenReady();
      await tick();

      expect(doc.unanswered).toBe(0);
      expect(pagesOf(el)[38].style.aspectRatio).toBe('612 / 792');
      expect(pagesOf(el)[1].style.aspectRatio).toBe('612 / 792');
      // The boxes above it shrank by 38 times 776 pixels, and the scroll with them.
      expect(page40.getBoundingClientRect().top).toBeCloseTo(0, 0);
      expect(column.scrollTop).toBeCloseTo(1552.94 + 38 * 776.47, 0);
    }
  );
});
