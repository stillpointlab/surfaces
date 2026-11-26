---
column: todo
created: 2026-11-26T15:45:00-07:00
tags: [formats, feature, code]
---

# Spec: a PDF's text can be selected, found and read aloud

_From the [PDF preview's spec](pdf-preview.md), whose fourth ruling made this the next one
("text layer next is fine", Jamie, 2026-11-26), and the
[pdf.js spike](../spikes/pdfjs-in-a-format-package.md), section 7. One PR, on top of the PDF
preview._

## High-level goal

A page drawn by `<pdf-preview>` carries its text: a person can select it and copy it, the
browser can find it, and a screen reader can read it. Today a page is a canvas, which is a
picture.

## Related context

- **Depends on:** the [PDF preview](pdf-preview.md), with its "As built": a column of pages,
  each drawn to a canvas while it is near view and given back when it is far.
- **What the spike showed,** in Chromium 158 and Firefox 159, in the built local host: pdf.js's
  `TextLayer` lays transparent text over a page's canvas, each piece placed by an inline style.
  In a shadow root, under both hosts' policies, it brought no policy report; text was selected
  by script and by a drag of the mouse; `window.find` found text. The browser's own find bar
  was not tried.
- **Main files:** `packages/formats/pdf` (`src/preview/pages.ts`, its stylesheet, its tests).
- **Read from the installed pdf.js and not relied on from memory:** `TextLayer` in
  `types/src/display/text_layer.d.ts` (`render`, `update`, `cancel`), and the `.textLayer` rules
  in `web/pdf_viewer.css`.

## Technical requirement

### 1. A page's text, over its picture

- **Every page that is drawn has its text laid over it,** by pdf.js's `TextLayer`, in the
  page's own box. The text is there to be selected and read, and is not seen: the canvas is
  what a person looks at.
- **It lives as long as the canvas does.** A page far from view gives both back; a change of
  width brings both up to date; a page whose drawing is cancelled has its text cancelled.
- **A page with no text** (a scan) has none. Nothing is said of it.
- **The rules it needs** are the fewest of pdf.js's `.textLayer` rules that place the text
  rightly, written in the package's stylesheet with colours from `common`'s tokens. pdf.js's
  viewer stylesheet is not shipped.

### 2. Selecting and copying

- A drag across a page selects its text, and what is copied is that text, in reading order.
- A selection may run from one page into the next.
- The selection shows, in a colour from the tokens that is seen on a page's white.
- Where a selection misbehaves as it does in a bare `TextLayer` (a drag past a line's end
  taking the rest of the page), the build does what pdf.js's own viewer does about it if that
  is small, and writes down what is left if it is not.

### 3. Finding

- The browser's own find (Ctrl+F) finds text in the pages that are drawn, and scrolls to it.
  This is tried by hand: no script can press the browser's find bar.
- **It reaches only the pages near view,** since only those have their text
  ([Clarification 1](#clarifications)).

### 4. Read aloud

- A page is no longer a picture to a screen reader. Its box is a group labelled "Page 3 of 12",
  its text is read, and its canvas is hidden from the reader.
- A page with no text stays a picture with that label.
- The reading order is pdf.js's. It is not mended here.

### 5. What it must not cost

- **No policy report** on the page or in the worker, in either host.
- **Measured and in the PR:** the time to the first page drawn, with and without the text, for
  a page of dense text; and the number of elements a 200-page PDF holds at its top, middle and
  end.
- Ready still settles on the first page drawn, not on its text.

### 6. Tests

- **jsdom,** with pdf.js faked: a drawn page is given its text; a page given back loses it; a
  cancelled drawing cancels it; a page with none has none.
- **A browser,** few: the text of a drawn page is in the element and equals the PDF's; a
  selection made across two lines gives those lines; `window.find` finds a word and the
  selection is in the page it is on; Japanese text through a character map comes out as its
  characters; a page scrolled far away has no text left.
- The test PDFs are the PDF preview's. One of dense text is added if none there is dense
  enough to measure.

### 7. The harness and the walk

The harness needs no new fixture. The release walk's PDF section gains: select and copy a line,
find a word, and hear a page read (the last by Jamie, on a Mac, with VoiceOver).

## Clarifications

For Jamie, with the agent's lean:

1. **Text only for the pages near view.** So the browser's find misses a word on a page that is
   far off, and says so as it says for any word it cannot find. The other ways: every page's
   text held at once, which is thousands of elements for a long PDF and undoes the PDF
   preview's bound on what it holds; or a find of our own that asks pdf.js for the whole
   document's text and scrolls to a match, which is a feature with a field and buttons of its
   own. Lean: near view now, and a find of our own as a seed.

## Non-goals

- A find of our own, a count of matches, or marking every match.
- Links, the outline, annotations and forms.
- Text for a scan (reading the letters off a picture).
- Mending pdf.js's reading order, or tagged PDF's structure (headings, tables) for a reader.
- Context Manager, which adopts the format in phase 5.

## Acceptance / completion checklist

- [ ] In the built local host, in Chromium and Firefox: a line of a PDF is selected by a drag
      and copied as its text; a selection runs across two pages.
- [ ] The browser's find finds a word on a page near view, by hand.
- [ ] A screen reader's view of a page (the accessibility tree) holds the page's label and its
      text, and not a picture.
- [ ] No policy report on the page or in the worker.
- [ ] The two measures of section 5 are in the PR.
- [ ] A page scrolled far away holds no text and no canvas.
- [ ] The browser tests pass in the PR's job, and their time is in the PR.
- [ ] The package's README says what the text gives and what it does not (find reaches the
      pages near view), and the release walk gains its steps.
- [ ] `npm run check` passes.

### Work package

- **Owns:** `packages/formats/pdf`.
- **Must not change:** `common`, the local host, either host's policy.
- **Runs after:** the [PDF preview](pdf-preview.md).
