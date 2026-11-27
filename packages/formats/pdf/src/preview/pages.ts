// The pages of one open PDF: a column that scrolls, each page in its place from
// the start and at its size once read, and drawn to a canvas only while it is
// near view, with its text laid over the canvas. The element owns the document
// and its states; this owns the pages' boxes, their sizes, their canvases and
// text, and what is read and drawn when.

import { createStatus } from '@stillpointlab/common-format';

import {
  CSS_PER_PDF_UNIT,
  pagesNear,
  pixelRatioFor,
  RESIZE_SETTLE_MS,
  SIZES_AT_ONCE,
} from './layout';

import type {
  PageViewport,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
  TextLayer,
} from 'pdfjs-dist';

/** What the column reads of the document: how many pages, and each page when asked. */
export type PageReader = Pick<PDFDocumentProxy, 'numPages' | 'getPage'>;

/** pdf.js's `TextLayer` class, which the element hands the column from the engine. */
export type TextLayers = typeof TextLayer;

/** A page's text: pdf.js's layer, the box it lays its spans in, and whether it is done. */
interface PageText {
  layer: TextLayer | null;
  readonly box: HTMLDivElement;
  done: boolean;
}

/** What a page says in its own place when it cannot be drawn. */
export const PAGE_FAILED = "This page couldn't be drawn.";

/** A page's width and height at 100%, in PDF units. */
interface PageSize {
  width: number;
  height: number;
}

/** A letter page, for the pages of a PDF whose first page cannot be read, until theirs is. */
const LETTER: PageSize = { width: 612, height: 792 };

/** One page of the column. */
interface Slot {
  readonly index: number;
  // pdf.js's page, once read; null until then, and for a page that cannot be read.
  page: PDFPageProxy | null;
  readonly box: HTMLDivElement;
  canvas: HTMLCanvasElement | null;
  // Drawing now, into a canvas not yet shown.
  task: RenderTask | null;
  // Its text, laid once its canvas is shown, or being laid; null when it has none
  // laid. A page found to have no text keeps its (empty) layer here, unshown.
  text: PageText | null;
  // The width it was drawn at, in CSS pixels, and the column's width then; the
  // screen's pixel ratio it was drawn for.
  drawnAt: number;
  drawnFor: number;
  drawnRatio: number;
  failed: boolean;
}

// What pdf.js rejects a render's promise with when the render is cancelled.
const CANCELLED = 'RenderingCancelledException';

/** The column's class while the pointer is down in it: a selection is being made. */
export const SELECTING = 'pdf-preview__pages--selecting';

/**
 * The column of a PDF's pages. Every page's box is laid out at once, as wide as
 * the column allows up to its size at 100%: the first page at its own size, read
 * before the column is made, and the others at the first page's until theirs is
 * read, as pdf.js's viewer does. A page's size is read before it is drawn, and
 * once the first page is drawn the others' are read in the background,
 * `SIZES_AT_ONCE` at a time; each box takes its size as it arrives, and the page
 * in view stays where it is on the screen. While started, the pages in view and
 * `PAGES_AROUND` either side are drawn, one at a time, nearest first; a page
 * further off gives its canvas back. A change of the column's width, or of the
 * screen's pixel ratio (a window moved to a screen of another density), draws
 * the drawn pages again once it has stayed the same for `RESIZE_SETTLE_MS`. A
 * page that cannot be drawn says so in its own place, and the others are drawn.
 *
 * A drawn page's text is laid over its canvas by pdf.js's `TextLayer` once the
 * canvas is shown, and lives as long as the canvas: given back with it,
 * cancelled with its drawing, and brought to a new width with it. A page with
 * text is a group labelled "Page 3 of 12" to a screen reader, its canvas hidden;
 * a page with none (a scan), or none laid now, is a picture with that label.
 */
export class PageColumn {
  /** The column: the element puts it in its shadow root. */
  readonly element: HTMLDivElement;
  private readonly slots: Slot[];
  private readonly inView = new Set<number>();
  private readonly firstSettled: Promise<void>;
  private settleFirst: () => void = () => undefined;
  private intersection: IntersectionObserver | null = null;
  private resize: ResizeObserver | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  // The listeners that mark a selection being made and hear the pixel ratio,
  // while started.
  private listening: AbortController | null = null;
  // The column's width and the screen's pixel ratio the drawn pages are for; 0
  // until first measured.
  private width = 0;
  private ratio = 0;
  private started = false;
  private drawing = false;
  private destroyed = false;

  /**
   * The pages of `doc`, whose first page is `first`, or null when pdf.js could
   * not read it.
   */
  constructor(
    private readonly doc: PageReader,
    first: PDFPageProxy | null,
    private readonly TextLayer: TextLayers
  ) {
    this.element = document.createElement('div');
    this.element.className = 'pdf-preview__pages';
    this.firstSettled = new Promise((resolve) => (this.settleFirst = resolve));
    const guess = first ? sizeOf(first) : LETTER;
    this.slots = Array.from({ length: doc.numPages }, (_, index) => {
      const box = document.createElement('div');
      box.className = 'pdf-preview__page';
      box.setAttribute('role', 'img');
      box.setAttribute('aria-label', `Page ${index + 1} of ${doc.numPages}`);
      box.dataset.page = String(index + 1);
      place(box, guess);
      const slot: Slot = {
        index,
        page: index === 0 ? first : null,
        box,
        canvas: null,
        task: null,
        text: null,
        drawnAt: 0,
        drawnFor: 0,
        drawnRatio: 0,
        failed: false,
      };
      if (index === 0 && !first) this.failPage(slot);
      return slot;
    });
    this.element.append(...this.slots.map((slot) => slot.box));
    if (this.slots.length === 0) this.settleFirst();
    // The other sizes wait for the first page, so they never hold it up.
    void this.firstSettled.then(() => this.readSizes());
  }

  /**
   * Resolves once a page has been drawn, or could not be: the first page,
   * unless the column was scrolled away from it before it was.
   */
  firstDrawn(): Promise<void> {
    return this.firstSettled;
  }

  /** How many pages hold a canvas: those near view, never all of a long PDF's. */
  get canvases(): number {
    return this.slots.filter((slot) => slot.canvas !== null).length;
  }

  /** Draw what is near view, and keep doing so as the column scrolls and its width changes. */
  start(): void {
    if (this.started || this.destroyed) return;
    this.started = true;
    if (typeof IntersectionObserver !== 'undefined') {
      this.intersection = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const index = Number((entry.target as HTMLElement).dataset.page) - 1;
            if (entry.isIntersecting) this.inView.add(index);
            else this.inView.delete(index);
          }
          this.update();
        },
        { root: this.element }
      );
      for (const slot of this.slots) this.intersection.observe(slot.box);
    }
    if (typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(() => this.resized());
      this.resize.observe(this.element);
    }
    this.listening = new AbortController();
    this.markSelecting(this.listening.signal);
    this.watchRatio(this.listening.signal);
    this.update();
  }

  /**
   * Stop drawing: what is drawing now is cancelled, a page's text being laid
   * among it, and what is drawn is kept.
   */
  stop(): void {
    this.started = false;
    this.intersection?.disconnect();
    this.intersection = null;
    this.resize?.disconnect();
    this.resize = null;
    this.listening?.abort();
    this.listening = null;
    this.element.classList.remove(SELECTING);
    if (this.resizeTimer !== null) clearTimeout(this.resizeTimer);
    this.resizeTimer = null;
    for (const slot of this.slots) this.cancel(slot);
  }

  /** Stop, and give every canvas and its text back. */
  destroy(): void {
    this.stop();
    this.destroyed = true;
    for (const slot of this.slots) this.release(slot);
  }

  /**
   * While the mouse is down in the column, every page's text has its end cover
   * the page (`SELECTING`), as pdf.js's viewer does on its text layer: a drag
   * past a line's end then meets the end, which cannot be selected, and not the
   * layer's empty box, which would take the rest of the page. The class is the
   * column's, not a page's, so a drag that runs into the next page finds its
   * end covering too: pdf.js's viewer finds that page by the document's
   * selection, which inside a shadow root does not name its nodes.
   */
  private markSelecting(signal: AbortSignal): void {
    const done = () => this.element.classList.remove(SELECTING);
    this.element.addEventListener('mousedown', () => this.element.classList.add(SELECTING), {
      signal,
    });
    // The mouse may come up anywhere, or the window lose it.
    document.addEventListener('pointerup', done, { signal });
    window.addEventListener('blur', done, { signal });
  }

  /**
   * Hear the screen's pixel ratio change: a query that matches the ratio now,
   * made again for the new one after each change, until the column stops. A
   * change is a resize.
   */
  private watchRatio(signal: AbortSignal): void {
    if (typeof matchMedia === 'undefined' || signal.aborted) return;
    const changed = () => {
      this.watchRatio(signal);
      this.resized();
    };
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', changed, {
      once: true,
      signal,
    });
  }

  /**
   * The column's width or the screen's pixel ratio settled: the pages drawn for
   * another are drawn again.
   */
  private resized(): void {
    if (this.resizeTimer !== null) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      const width = this.element.clientWidth;
      if (width === this.width && devicePixelRatio === this.ratio) return;
      this.width = width;
      this.ratio = devicePixelRatio;
      this.update();
    }, RESIZE_SETTLE_MS);
  }

  /** Give back the canvases far from view, and draw what is near it. */
  private update(): void {
    if (!this.started) return;
    if (this.width === 0) this.width = this.element.clientWidth;
    if (this.ratio === 0) this.ratio = devicePixelRatio;
    const near = pagesNear(this.inView, this.slots.length);
    for (const slot of this.slots) if (!near.has(slot.index)) this.release(slot);
    void this.drawNear();
  }

  /**
   * Draw the pages near view that need it, one at a time, the nearest first. A
   * page whose size is not read yet has it read first, with every other such
   * page near view. With none left, every page near view is drawn or could not
   * be, and the first page is settled.
   */
  private async drawNear(): Promise<void> {
    if (this.drawing) return;
    this.drawing = true;
    try {
      for (;;) {
        if (!this.started) return;
        const slot = this.nextToDraw();
        if (!slot) {
          this.settleFirst();
          return;
        }
        if (slot.page) {
          await this.draw(slot);
        } else {
          const near = pagesNear(this.inView, this.slots.length);
          await this.read([...near].map((index) => this.slots[index]).filter(unreadSlot));
        }
      }
    } finally {
      this.drawing = false;
    }
  }

  /** Read every page's size, `SIZES_AT_ONCE` at a time, in order, until the column is destroyed. */
  private async readSizes(): Promise<void> {
    for (let from = 0; from < this.slots.length && !this.destroyed; from += SIZES_AT_ONCE) {
      const unread = this.slots.slice(from, from + SIZES_AT_ONCE).filter(unreadSlot);
      if (unread.length) await this.read(unread);
    }
  }

  /**
   * Read the pages of `slots` from pdf.js and give each box its size, the page
   * in view kept where it is; a page pdf.js cannot read says so in its place,
   * at the size it was given.
   */
  private async read(slots: readonly Slot[]): Promise<void> {
    const read = await Promise.allSettled(slots.map((slot) => this.doc.getPage(slot.index + 1)));
    if (this.destroyed) return;
    this.keepInView(() => {
      read.forEach((got, at) => {
        const slot = slots[at];
        if (!unreadSlot(slot)) return;
        if (got.status === 'rejected') {
          this.failPage(slot);
        } else {
          slot.page = got.value;
          place(slot.box, sizeOf(got.value));
        }
      });
    });
  }

  /**
   * Make `change` to the boxes' sizes with the page in view where it was on the
   * screen: a box above it that grows or shrinks moves the scroll by as much.
   * The column does it, not the browser's scroll anchoring, which it turns off,
   * so it is the same in every browser.
   */
  private keepInView(change: () => void): void {
    const anchor = this.pageInView();
    const before = anchor?.getBoundingClientRect().top ?? 0;
    change();
    if (anchor) this.element.scrollTop += anchor.getBoundingClientRect().top - before;
  }

  /**
   * The page in view, found by the layout and not the observer, which may not
   * have spoken yet: the page at the top of the column's view, or the next one
   * when that one starts above the view and the next starts in it. Null when
   * the column is not laid out.
   */
  private pageInView(): HTMLElement | null {
    const view = this.element.getBoundingClientRect();
    // The first page whose bottom is below the view's top: the boxes are in order.
    let low = 0;
    let high = this.slots.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.slots[middle].box.getBoundingClientRect().bottom > view.top) high = middle;
      else low = middle + 1;
    }
    const at = this.slots[low]?.box;
    const next = this.slots[low + 1]?.box;
    if (!at) return null;
    if (
      next &&
      at.getBoundingClientRect().top < view.top &&
      next.getBoundingClientRect().top < view.bottom
    ) {
      return next;
    }
    return at;
  }

  private nextToDraw(): Slot | null {
    const near = pagesNear(this.inView, this.slots.length);
    const seen = [...this.inView];
    const middle = seen.length ? (Math.min(...seen) + Math.max(...seen)) / 2 : 0;
    return (
      [...near]
        .map((index) => this.slots[index])
        .filter(
          (slot) =>
            !slot.failed &&
            !slot.task &&
            (slot.canvas === null ||
              slot.drawnFor !== this.width ||
              slot.drawnRatio !== this.ratio ||
              slot.text === null)
        )
        .sort((a, b) => Math.abs(a.index - middle) - Math.abs(b.index - middle))[0] ?? null
    );
  }

  /**
   * Draw one page into a new canvas, shown in place of its old one once drawn,
   * and then lay its text over it, or bring its text to the canvas's width.
   */
  private async draw(slot: Slot): Promise<void> {
    const page = slot.page;
    if (!page) return;
    const forWidth = this.width;
    const ratio = this.ratio;
    const natural = page.getViewport({ scale: 1 });
    // Laid out, the box is as wide as the column allows; not laid out (hidden,
    // or jsdom), it is drawn at its size at 100%.
    const width = slot.box.getBoundingClientRect().width || natural.width * CSS_PER_PDF_UNIT;
    if (!slot.canvas || slot.drawnAt !== width || slot.drawnRatio !== ratio) {
      const height = (width * natural.height) / natural.width;
      // A whole number of canvas pixels across the box, and the page scaled to it.
      const across = Math.max(1, Math.round(width * pixelRatioFor(width, height, ratio)));
      const viewport = page.getViewport({ scale: across / natural.width });
      const canvas = document.createElement('canvas');
      canvas.width = across;
      canvas.height = Math.max(1, Math.round(viewport.height));
      // What a reader is given is the page's label, and its text when it has some.
      canvas.setAttribute('aria-hidden', 'true');
      const task = page.render({ canvas, viewport });
      slot.task = task;
      try {
        await task.promise;
      } catch (error) {
        if (slot.task === task) slot.task = null;
        emptied(canvas);
        if ((error as { name?: unknown } | null)?.name === CANCELLED) return;
        this.failPage(slot);
        this.settleFirst();
        return;
      }
      if (slot.task !== task) {
        emptied(canvas);
        return;
      }
      slot.task = null;
      if (slot.canvas) {
        emptied(slot.canvas);
        slot.canvas.replaceWith(canvas);
      } else {
        slot.box.prepend(canvas);
      }
      slot.canvas = canvas;
      slot.drawnAt = width;
      slot.drawnRatio = ratio;
      this.settleFirst();
    }
    slot.drawnFor = forWidth;
    // Ready waits for the canvas alone; the text follows it, at its width.
    await this.layText(slot, page, page.getViewport({ scale: width / natural.width }));
  }

  /**
   * Lay the text of `slot` over its canvas, at `viewport` (the page at the
   * box's width in CSS pixels), or bring the text it has to that width. A page
   * whose text pdf.js cannot read has none, and nothing is said of it.
   */
  private async layText(slot: Slot, page: PDFPageProxy, viewport: PageViewport): Promise<void> {
    // CSS pixels to one PDF unit of the page, which pdf.js's rules scale by.
    const scale = String(viewport.scale * viewport.userUnit);
    if (slot.text) {
      slot.text.box.style.setProperty('--total-scale-factor', scale);
      slot.text.layer?.update({ viewport });
      return;
    }
    const box = document.createElement('div');
    box.className = 'pdf-preview__text';
    box.style.setProperty('--total-scale-factor', scale);
    const text: PageText = { layer: null, box, done: false };
    slot.text = text;
    try {
      text.layer = new this.TextLayer({
        textContentSource: page.streamTextContent(),
        container: box,
        viewport,
      });
      await text.layer.render();
    } catch {
      // Cancelled (given back, or drawing stopped), or pdf.js could not read it.
      if (slot.text !== text) return;
      box.replaceChildren();
    }
    if (slot.text !== text) return;
    text.done = true;
    if (box.textContent.trim() === '') return;
    // Covers the page while a selection is being made (see `markSelecting`).
    const end = document.createElement('div');
    end.className = 'pdf-preview__text-end';
    box.append(end);
    slot.box.append(box);
    slot.box.setAttribute('role', 'group');
  }

  /**
   * Cancel the drawing of `slot`, if it is drawing, and the laying of its text;
   * its canvas, if any, stays, and its text if it is laid.
   */
  private cancel(slot: Slot): void {
    slot.task?.cancel();
    slot.task = null;
    if (slot.text && !slot.text.done) this.dropText(slot);
  }

  /**
   * Give back the canvas of `slot`, and what pdf.js holds for drawing it, and its
   * text with it. Text only for the pages near view, the pages that hold a canvas,
   * is the one choice the text spec's Clarification 1 leaves open: to hold every
   * page's text, this is the line that would change.
   */
  private release(slot: Slot): void {
    this.cancel(slot);
    this.dropText(slot);
    if (!slot.canvas) return;
    emptied(slot.canvas);
    slot.canvas.remove();
    slot.canvas = null;
    slot.page?.cleanup();
  }

  /** Cancel or give back the text of `slot`: it is a picture to a reader again. */
  private dropText(slot: Slot): void {
    if (!slot.text) return;
    if (!slot.text.done) slot.text.layer?.cancel();
    slot.text.box.remove();
    slot.text = null;
    slot.box.setAttribute('role', 'img');
  }

  private failPage(slot: Slot): void {
    slot.failed = true;
    this.dropText(slot);
    if (slot.canvas) emptied(slot.canvas);
    slot.canvas = null;
    slot.box.replaceChildren(createStatus('error', PAGE_FAILED));
  }
}

/** A page not yet read, and not found unreadable. */
function unreadSlot(slot: Slot): boolean {
  return !slot.page && !slot.failed;
}

/** Give a page's box its size: as wide as the column allows up to its size at 100%. */
function place(box: HTMLElement, size: PageSize): void {
  box.style.width = `min(100%, ${round(size.width * CSS_PER_PDF_UNIT)}px)`;
  box.style.aspectRatio = `${round(size.width)} / ${round(size.height)}`;
}

/** A page's size at 100% in PDF units, its rotation applied. */
function sizeOf(page: PDFPageProxy): PageSize {
  const { width, height } = page.getViewport({ scale: 1 });
  return { width, height };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A canvas made to hold nothing, so its pixels are let go at once, not when it is collected. */
function emptied(canvas: HTMLCanvasElement): HTMLCanvasElement {
  canvas.width = 0;
  canvas.height = 0;
  return canvas;
}
