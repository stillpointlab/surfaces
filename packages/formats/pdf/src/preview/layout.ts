// The numbers the page column is drawn by, and the pure parts of choosing what
// to draw: which pages are near view, and how sharp a canvas may be.

/** Pages drawn either side of those in view, so a short scroll finds them drawn. */
export const PAGES_AROUND = 2;

/**
 * The most pixels one canvas holds: 2^24, 64 MiB at four bytes a pixel (Safari's
 * limit on a canvas's area too). A page that would need more at the screen's
 * pixel ratio is drawn at a lower one, softer and bounded.
 */
export const MAX_CANVAS_PIXELS = 2 ** 24;

/** The longest side of one canvas, in pixels: a long, narrow page is bounded too. */
export const MAX_CANVAS_SIDE = 16_384;

/**
 * How many pages' sizes are asked of pdf.js's worker at once, once the first
 * page is drawn: few enough that a page to draw waits behind no more than these.
 */
export const SIZES_AT_ONCE = 50;

/** How long the width must stay the same before the pages are drawn again for it, in ms. */
export const RESIZE_SETTLE_MS = 200;

/** CSS pixels for one PDF unit at 100%: a PDF's unit is 1/72 in, a CSS pixel 1/96 in. */
export const CSS_PER_PDF_UNIT = 96 / 72;

/**
 * The pages to hold a canvas: those from `PAGES_AROUND` before the first page in
 * view to as many after the last, of `count`. With none in view (the element
 * has no height) it is the first page and those after it.
 */
export function pagesNear(inView: Iterable<number>, count: number): Set<number> {
  const seen = [...inView];
  const first = seen.length ? Math.min(...seen) : 0;
  const last = seen.length ? Math.max(...seen) : 0;
  const near = new Set<number>();
  const from = Math.max(0, first - PAGES_AROUND);
  const to = Math.min(count - 1, last + PAGES_AROUND);
  for (let page = from; page <= to; page += 1) near.add(page);
  return near;
}

/**
 * Canvas pixels per CSS pixel for a page shown `width` by `height` CSS pixels:
 * the screen's pixel ratio, lowered as far as the bounds on a canvas need.
 */
export function pixelRatioFor(width: number, height: number, devicePixelRatio: number): number {
  const ratio = devicePixelRatio > 0 ? devicePixelRatio : 1;
  if (width <= 0 || height <= 0) return ratio;
  return Math.min(
    ratio,
    Math.sqrt(MAX_CANVAS_PIXELS / (width * height)),
    MAX_CANVAS_SIDE / width,
    MAX_CANVAS_SIDE / height
  );
}
