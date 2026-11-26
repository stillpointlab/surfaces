// The pages of one open PDF: a column that scrolls, each page in its place and
// at its size from the start, and drawn to a canvas only while it is near view,
// with its text laid over the canvas. The element owns the document and its
// states; this owns the pages' boxes, their canvases and text, and what is drawn
// when.

import { createStatus } from '@stillpointlab/common-format';

import { CSS_PER_PDF_UNIT, pagesNear, pixelRatioFor, RESIZE_SETTLE_MS } from './layout';

import type { PageViewport, PDFPageProxy, RenderTask, TextLayer } from 'pdfjs-dist';

/** What the column is told of a page: pdf.js's page, or why there is none. */
export type PageSource = { page: PDFPageProxy } | { failed: true };

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

/** One page of the column. */
interface Slot {
  readonly index: number;
  readonly page: PDFPageProxy | null;
  readonly box: HTMLDivElement;
  canvas: HTMLCanvasElement | null;
  // Drawing now, into a canvas not yet shown.
  task: RenderTask | null;
  // Its text, laid once its canvas is shown, or being laid; null when it has none
  // laid. A page found to have no text keeps its (empty) layer here, unshown.
  text: PageText | null;
  // The width it was drawn at, in CSS pixels, and the column's width then.
  drawnAt: number;
  drawnFor: number;
  failed: boolean;
}

// What pdf.js rejects a render's promise with when the render is cancelled.
const CANCELLED = 'RenderingCancelledException';

/** The column's class while the pointer is down in it: a selection is being made. */
export const SELECTING = 'pdf-preview__pages--selecting';

/**
 * The column of a PDF's pages. Every page's box is laid out at once from its
 * size, as wide as the column allows up to its size at 100%, so the scroll bar
 * is true before anything is drawn. While started, the pages in view and
 * `PAGES_AROUND` either side are drawn, one at a time, nearest first; a page
 * further off gives its canvas back. A change of the column's width draws the
 * drawn pages again once it has stayed the same for `RESIZE_SETTLE_MS`. A page
 * that cannot be drawn says so in its own place, and the others are drawn.
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
  // The listeners that mark a selection being made, while started.
  private pointer: AbortController | null = null;
  // The column's width the drawn pages are for; 0 until it is first measured.
  private width = 0;
  private started = false;
  private drawing = false;
  private destroyed = false;

  constructor(
    pages: readonly PageSource[],
    private readonly TextLayer: TextLayers
  ) {
    this.element = document.createElement('div');
    this.element.className = 'pdf-preview__pages';
    this.firstSettled = new Promise((resolve) => (this.settleFirst = resolve));
    const sizes = pages.map((source) => ('page' in source ? sizeOf(source.page) : null));
    // A page pdf.js could not read takes the size of the nearest one before it,
    // or after it, or a letter page's.
    const fallback = (index: number): PageSize =>
      sizes.slice(0, index).reverse().find(Boolean) ??
      sizes.slice(index + 1).find(Boolean) ?? { width: 612, height: 792 };
    this.slots = pages.map((source, index) => {
      const size = sizes[index] ?? fallback(index);
      const box = document.createElement('div');
      box.className = 'pdf-preview__page';
      box.setAttribute('role', 'img');
      box.setAttribute('aria-label', `Page ${index + 1} of ${pages.length}`);
      box.dataset.page = String(index + 1);
      box.style.width = `min(100%, ${round(size.width * CSS_PER_PDF_UNIT)}px)`;
      box.style.aspectRatio = `${round(size.width)} / ${round(size.height)}`;
      const slot: Slot = {
        index,
        page: 'page' in source ? source.page : null,
        box,
        canvas: null,
        task: null,
        text: null,
        drawnAt: 0,
        drawnFor: 0,
        failed: false,
      };
      if (!slot.page) this.failPage(slot);
      return slot;
    });
    this.element.append(...this.slots.map((slot) => slot.box));
    if (this.slots.length === 0 || this.slots.every((slot) => slot.failed)) this.settleFirst();
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
    this.markSelecting();
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
    this.pointer?.abort();
    this.pointer = null;
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
  private markSelecting(): void {
    this.pointer = new AbortController();
    const { signal } = this.pointer;
    const done = () => this.element.classList.remove(SELECTING);
    this.element.addEventListener('mousedown', () => this.element.classList.add(SELECTING), {
      signal,
    });
    // The mouse may come up anywhere, or the window lose it.
    document.addEventListener('pointerup', done, { signal });
    window.addEventListener('blur', done, { signal });
  }

  /** The column's width settled: the pages drawn for another are drawn again. */
  private resized(): void {
    if (this.resizeTimer !== null) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      const width = this.element.clientWidth;
      if (width === this.width) return;
      this.width = width;
      this.update();
    }, RESIZE_SETTLE_MS);
  }

  /** Give back the canvases far from view, and draw what is near it. */
  private update(): void {
    if (!this.started) return;
    if (this.width === 0) this.width = this.element.clientWidth;
    const near = pagesNear(this.inView, this.slots.length);
    for (const slot of this.slots) if (!near.has(slot.index)) this.release(slot);
    void this.drawNear();
  }

  /** Draw the pages near view that need it, one at a time, the nearest first. */
  private async drawNear(): Promise<void> {
    if (this.drawing) return;
    this.drawing = true;
    try {
      for (;;) {
        if (!this.started) return;
        const slot = this.nextToDraw();
        if (!slot) return;
        await this.draw(slot);
      }
    } finally {
      this.drawing = false;
    }
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
            (slot.canvas === null || slot.drawnFor !== this.width || slot.text === null)
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
    const natural = page.getViewport({ scale: 1 });
    // Laid out, the box is as wide as the column allows; not laid out (hidden,
    // or jsdom), it is drawn at its size at 100%.
    const width = slot.box.getBoundingClientRect().width || natural.width * CSS_PER_PDF_UNIT;
    if (!slot.canvas || slot.drawnAt !== width) {
      const height = (width * natural.height) / natural.width;
      // A whole number of canvas pixels across the box, and the page scaled to it.
      const across = Math.max(
        1,
        Math.round(width * pixelRatioFor(width, height, devicePixelRatio))
      );
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
