// What the contract leaves to the format: the words for each state, the three
// failures told apart by pdf.js's errors, the one report of a failure, the
// worker that failed to load, the pages laid out and labelled, a page that
// cannot be drawn, the old source let go, and drawing stopped on leaving the
// page. jsdom has no worker and no canvas that draws: pdf.js and the worker are
// stood in for (`testing/fake-pdfjs.ts`), and each test says when a document
// opens or fails and when a page is drawn.
import { setErrorHandler } from '@stillpointlab/common-format';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  answer,
  FakeDocument,
  opened,
  pdfjsError,
  resetEngine,
  taskFor,
  workers,
} from '../testing/fake-pdfjs';

import { PackageFiles } from './files';
import { PdfPreview } from './pdf-preview';

vi.mock('./engine', async () => (await import('../testing/fake-pdfjs')).fakeEngine);
vi.mock('../worker/start', async () => {
  const fake = await import('../testing/fake-pdfjs');
  return { startWorker: vi.fn(fake.startFakeWorker) };
});

const LOAD = "Couldn't load this PDF.";
const READ = "This file can't be read as a PDF.";
const PASSWORD = "This PDF needs a password, and this preview can't ask for one yet.";

const create = (): PdfPreview => document.createElement('pdf-preview') as PdfPreview;
const frameOf = (el: PdfPreview) => el.shadowRoot!.querySelector('.pdf-preview')!;
const statusOf = (el: PdfPreview) => el.shadowRoot!.querySelector('.pdf-preview > .spl-status');
const pagesOf = (el: PdfPreview) => [
  ...el.shadowRoot!.querySelectorAll<HTMLElement>('.pdf-preview__page'),
];
const canvasesOf = (el: PdfPreview) => el.shadowRoot!.querySelectorAll('canvas').length;
const covered = (el: PdfPreview) => el.shadowRoot!.querySelector('.pdf-preview__loading') !== null;

/** A tick, for the microtasks between an answer and what the element does with it. */
const tick = () => new Promise<void>((done) => setTimeout(done, 0));

function shown(src: string, name = 'report.pdf'): PdfPreview {
  const el = create();
  el.setSource(src, name);
  document.body.append(el);
  return el;
}

async function opens(src: string, doc = new FakeDocument(3), name?: string): Promise<PdfPreview> {
  const el = shown(src, name);
  answer(src, doc);
  await el.whenReady();
  return el;
}

describe('pdf-preview', () => {
  beforeEach(() => resetEngine());

  afterEach(async () => {
    document.body.replaceChildren();
    // Leaving the page stops drawing a microtask later.
    await tick();
    setErrorHandler(null);
    vi.unstubAllGlobals();
  });

  it('is defined by its module', () => {
    expect(customElements.get('pdf-preview')).toBe(PdfPreview);
  });

  it('says there is nothing to show without a source', () => {
    const el = create();
    document.body.append(el);

    expect(statusOf(el)?.textContent).toBe('No PDF selected.');
    expect(frameOf(el).hasAttribute('aria-label')).toBe(false);
    expect(el.hasAttribute('ready')).toBe(true);
  });

  it('is loading, labelled with the name, until the document opens and its first page is drawn', async () => {
    const doc = new FakeDocument(2);
    for (const page of doc.pages) page.drawAtOnce = false;
    const el = shown('/files/a.pdf', 'a.pdf');

    expect(frameOf(el).getAttribute('role')).toBe('group');
    expect(frameOf(el).getAttribute('aria-label')).toBe('a.pdf');
    expect(frameOf(el).textContent).toBe('Loading…');
    expect(el.hasAttribute('ready')).toBe(false);

    answer('/files/a.pdf', doc);
    await tick();
    // Laid out, under the cover, until the first page is drawn: never on a time.
    expect(pagesOf(el)).toHaveLength(2);
    expect(covered(el)).toBe(true);
    expect(el.hasAttribute('ready')).toBe(false);

    doc.pages[0].renders[0].draw();
    await el.whenReady();
    expect(covered(el)).toBe(false);
    expect(pagesOf(el)[0].querySelector('canvas')).toBe(doc.pages[0].renders[0].canvas);
  });

  it('opens the source in the page worker, with the package’s files', async () => {
    await opens('/files/a.pdf');

    const task = taskFor('/files/a.pdf')!;
    expect(task.worker).toBe(workers.at(-1));
    expect(task.files).toBe(PackageFiles);
  });

  it('lays out every page at its size, labelled for a screen reader', async () => {
    const doc = new FakeDocument(3);
    // A landscape page among portrait ones.
    Object.assign(doc.pages[1], { width: 792, height: 612 });
    const el = await opens('/files/a.pdf', doc);

    const pages = pagesOf(el);
    expect(pages.map((page) => page.getAttribute('role'))).toEqual(['img', 'img', 'img']);
    expect(pages.map((page) => page.getAttribute('aria-label'))).toEqual([
      'Page 1 of 3',
      'Page 2 of 3',
      'Page 3 of 3',
    ]);
    // As wide as the element allows, up to its size at 100% (96 CSS pixels an inch).
    expect(pages[0].style.width).toBe('min(100%, 816px)');
    expect(pages[0].style.aspectRatio).toBe('612 / 792');
    expect(pages[1].style.width).toBe('min(100%, 1056px)');
    expect(pages[1].style.aspectRatio).toBe('792 / 612');
  });

  it('draws at the screen’s pixel ratio', async () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const el = await opens('/files/a.pdf', new FakeDocument(1));

    const canvas = el.shadowRoot!.querySelector('canvas')!;
    // jsdom lays nothing out, so the page is drawn at its size at 100%: 816 CSS pixels.
    expect(canvas.width).toBe(1632);
    expect(canvas.height).toBe(2112);
  });

  it.each([
    ['a missing file', pdfjsError('ResponseException', 'Unexpected server response (404)'), LOAD],
    [
      'a fetch that failed',
      pdfjsError('UnknownErrorException', 'Failed to fetch', 'TypeError: Failed to fetch'),
      LOAD,
    ],
    ['a file that is not a PDF', pdfjsError('InvalidPDFException', 'Invalid PDF structure.'), READ],
    [
      'a PDF pdf.js cannot read',
      pdfjsError('UnknownErrorException', 'Bad XRef entry', 'FormatError: Bad XRef entry'),
      READ,
    ],
    ['a PDF with a password', pdfjsError('PasswordException', 'No password given'), PASSWORD],
  ])(
    'says %s in its sentence, in place of the pages, and reports it once',
    async (_, error, words) => {
      const handler = vi.fn();
      setErrorHandler(handler);
      const el = shown('/files/a.pdf');

      answer('/files/a.pdf', error);
      await el.whenReady();

      expect(statusOf(el)?.textContent).toBe(words);
      expect(statusOf(el)?.getAttribute('role')).toBe('alert');
      expect(pagesOf(el)).toHaveLength(0);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('PDF preview failed to load', { src: '/files/a.pdf' });
      // The document is let go: nothing of it is shown.
      expect(taskFor('/files/a.pdf')?.destroyed).toBe(true);
    }
  );

  it('says the first sentence for a worker that fails to load, and starts another for the next PDF', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    // The worker an earlier test started has not said it started: it is the one to fail.
    const el = shown('/files/a.pdf');
    await tick();
    const worker = workers.at(-1)!;
    expect(taskFor('/files/a.pdf')?.worker).toBe(worker);

    // pdf.js never hears it: it would wait for ever for an answer.
    worker.failToLoad();
    await el.whenReady();

    expect(statusOf(el)?.textContent).toBe(LOAD);
    expect(worker.terminated).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);

    const next = await opens('/files/b.pdf');
    expect(workers.at(-1)).not.toBe(worker);
    expect(taskFor('/files/b.pdf')?.worker).toBe(workers.at(-1));
    expect(next.shadowRoot!.querySelector('canvas')).not.toBeNull();
  });

  it('says the first sentence where no worker can start', async () => {
    const { startWorker } = await import('../worker/start');
    // The page's worker has not said it started: failing to load, it is replaced.
    const el = shown('/files/a.pdf');
    await tick();
    workers.at(-1)!.dispatchEvent(new Event('error'));
    await el.whenReady();
    vi.mocked(startWorker).mockImplementationOnce(() => {
      throw new ReferenceError('Worker is not defined');
    });

    const next = shown('/files/b.pdf');
    await next.whenReady();

    expect(statusOf(next)?.textContent).toBe(LOAD);
  });

  it('shares one worker between elements, and takes an error after it started as no failure of a load', async () => {
    const first = await opens('/files/a.pdf');
    const worker = workers.at(-1)!;
    worker.start();
    worker.failToLoad();
    const second = await opens('/files/b.pdf');

    expect(taskFor('/files/b.pdf')?.worker).toBe(worker);
    expect(worker.terminated).toBe(false);
    expect(statusOf(first)).toBeNull();
    expect(statusOf(second)).toBeNull();
  });

  it('says a page that cannot be drawn in its own place, and draws the others', async () => {
    const doc = new FakeDocument(3);
    doc.pages[0].drawAtOnce = false;
    const el = shown('/files/a.pdf');
    answer('/files/a.pdf', doc);
    await tick();

    doc.pages[0].renders[0].fail(new Error('Invalid content stream'));
    await el.whenReady();
    await tick();

    const pages = pagesOf(el);
    expect(pages[0].textContent).toBe("This page couldn't be drawn.");
    expect(pages[0].querySelector('canvas')).toBeNull();
    expect(pages[1].querySelector('canvas')).not.toBeNull();
    expect(pages[2].querySelector('canvas')).not.toBeNull();
    expect(statusOf(el)).toBeNull();
  });

  it('says a page pdf.js cannot read in its own place, at its neighbour’s size', async () => {
    const el = await opens('/files/a.pdf', new FakeDocument(3, [2]));

    const pages = pagesOf(el);
    expect(pages).toHaveLength(3);
    expect(pages[1].textContent).toBe("This page couldn't be drawn.");
    expect(pages[1].getAttribute('aria-label')).toBe('Page 2 of 3');
    expect(pages[1].style.aspectRatio).toBe('612 / 792');
    expect(pages[0].querySelector('canvas')).not.toBeNull();
  });

  it('lets the old source go for a new one, and hears only the new one', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const el = await opens('/files/a.pdf', new FakeDocument(2));
    const canvas = el.shadowRoot!.querySelector('canvas')!;

    el.setSource('/files/b.pdf', 'b.pdf');

    // Destroyed, which ends its download, and its canvases given back.
    expect(taskFor('/files/a.pdf')?.destroyed).toBe(true);
    expect(canvas.width).toBe(0);
    expect(canvasesOf(el)).toBe(0);
    expect(frameOf(el).getAttribute('aria-label')).toBe('b.pdf');
    expect(el.hasAttribute('ready')).toBe(false);

    answer('/files/b.pdf', new FakeDocument(1));
    await el.whenReady();
    expect(pagesOf(el)).toHaveLength(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('lets a source still loading go, and never shows it', async () => {
    const el = shown('/files/a.pdf');
    await tick();
    const old = taskFor('/files/a.pdf')!;

    el.setSource('/files/b.pdf', 'b.pdf');
    expect(old.destroyed).toBe(true);
    // What the one let go says late is about a source no longer shown.
    old.open(new FakeDocument(5));
    await tick();
    expect(pagesOf(el)).toHaveLength(0);
    expect(el.hasAttribute('ready')).toBe(false);

    answer('/files/b.pdf', new FakeDocument(1));
    await el.whenReady();
    expect(pagesOf(el)).toHaveLength(1);
  });

  it('lets the source go when it is taken away', async () => {
    const el = await opens('/files/a.pdf');

    el.setSource('');

    expect(taskFor('/files/a.pdf')?.destroyed).toBe(true);
    expect(statusOf(el)?.textContent).toBe('No PDF selected.');
    expect(frameOf(el).hasAttribute('aria-label')).toBe(false);
    expect(el.hasAttribute('ready')).toBe(true);
  });

  it('relabels the pages for a new name, without opening again', async () => {
    const el = await opens('/files/a.pdf', new FakeDocument(1), 'old name');
    const count = opened.length;

    el.setSource('/files/a.pdf', 'new name');

    expect(frameOf(el).getAttribute('aria-label')).toBe('new name');
    expect(opened).toHaveLength(count);
    expect(el.hasAttribute('ready')).toBe(true);
  });

  it('stops drawing when it leaves the page, keeps the document, and draws again when put back', async () => {
    const doc = new FakeDocument(1);
    doc.pages[0].drawAtOnce = false;
    const el = shown('/files/a.pdf');
    answer('/files/a.pdf', doc);
    await tick();
    const drawing = doc.pages[0].renders[0];

    el.remove();
    expect(el.hasAttribute('ready')).toBe(false);
    await tick();
    expect(drawing.cancelled).toBe(true);
    expect(taskFor('/files/a.pdf')?.destroyed).toBe(false);

    doc.pages[0].drawAtOnce = true;
    document.body.append(el);
    await el.whenReady();
    expect(opened).toHaveLength(1);
    expect(doc.pages[0].renders).toHaveLength(2);
    expect(el.shadowRoot!.querySelector('canvas')).toBe(doc.pages[0].renders[1].canvas);
  });

  it('keeps drawing through a move, out of the page and back in one task', async () => {
    const doc = new FakeDocument(1);
    doc.pages[0].drawAtOnce = false;
    const el = create();
    el.setSource('/files/a.pdf', 'a.pdf');
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    first.append(el);
    answer('/files/a.pdf', doc);
    await tick();

    second.append(el);
    await tick();
    expect(doc.pages[0].renders[0].cancelled).toBe(false);

    doc.pages[0].renders[0].draw();
    await el.whenReady();
  });
});

describe('pdf-preview near view', () => {
  // The pages in view, as an IntersectionObserver of the column would say.
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

  const drawn = (el: PdfPreview) =>
    pagesOf(el)
      .filter((page) => page.querySelector('canvas'))
      .map((page) => Number(page.dataset.page));

  it('draws the pages in view and two either side, and gives back the canvases of pages far off', async () => {
    const doc = new FakeDocument(200);
    const el = await opens('/files/long.pdf', doc);
    scrollTo(1);
    await tick();
    expect(drawn(el)).toEqual([1, 2, 3]);

    scrollTo(100, 101);
    await tick();
    expect(drawn(el)).toEqual([98, 99, 100, 101, 102, 103]);
    expect(doc.pages[0].cleanups).toBe(1);
    // Never one canvas a page.
    expect(canvasesOf(el)).toBe(6);

    scrollTo(200);
    await tick();
    expect(drawn(el)).toEqual([198, 199, 200]);
  });

  it('draws the pages in view first', async () => {
    const doc = new FakeDocument(20);
    await opens('/files/long.pdf', doc);
    scrollTo(1);
    await tick();
    for (const page of doc.pages) page.drawAtOnce = false;

    scrollTo(10);
    await tick();
    const first = doc.pages.find((page) => page.number > 3 && page.renders.length > 0)!;
    expect(first.number).toBe(10);
  });

  it('cancels a page that leaves the neighbourhood before it is drawn', async () => {
    const doc = new FakeDocument(50);
    const el = await opens('/files/long.pdf', doc);
    scrollTo(1);
    await tick();
    doc.pages[29].drawAtOnce = false;

    scrollTo(30);
    await tick();
    const drawing = doc.pages[29].renders[0];
    scrollTo(1);
    await tick();

    expect(drawing.cancelled).toBe(true);
    expect(drawn(el)).toEqual([1, 2, 3]);
  });
});

describe('pdf-preview as its width changes', () => {
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

  it('draws the drawn pages again once the width has settled, and not before', async () => {
    const doc = new FakeDocument(1);
    const el = await opens('/files/a.pdf', doc);
    const column = el.shadowRoot!.querySelector<HTMLElement>('.pdf-preview__pages')!;
    const page = pagesOf(el)[0];
    let width = 600;
    Object.defineProperty(column, 'clientWidth', { get: () => width + 32 });
    Object.defineProperty(page, 'clientWidth', { get: () => width });
    vi.useFakeTimers();

    for (const next of [500, 450, 400]) {
      width = next;
      resized!([], {} as ResizeObserver);
      vi.advanceTimersByTime(100);
    }
    expect(doc.pages[0].renders).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(doc.pages[0].renders).toHaveLength(2);
    // Drawn at the width it settled at.
    expect(doc.pages[0].renders[1].scale).toBeCloseTo(400 / 612);
    vi.useRealTimers();
    await tick();
    expect(el.shadowRoot!.querySelector('canvas')).toBe(doc.pages[0].renders[1].canvas);
  });
});
