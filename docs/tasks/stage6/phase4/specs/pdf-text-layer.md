---
column: in-progress
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

- [x] In the built local host, in Chromium and Firefox: a line of a PDF is selected by a drag
      and copied as its text; a selection runs across two pages.
- [ ] The browser's find finds a word on a page near view, by hand. (Not done: no script can
      press the find bar. `window.find` finds it in both browsers; the bar is Jamie's to try.)
- [x] A screen reader's view of a page (the accessibility tree) holds the page's label and its
      text, and not a picture.
- [x] No policy report on the page or in the worker.
- [x] The two measures of section 5 are in the PR.
- [x] A page scrolled far away holds no text and no canvas.
- [ ] The browser tests pass in the PR's job, and their time is in the PR.
- [x] The package's README says what the text gives and what it does not (find reaches the
      pages near view), and the release walk gains its steps.
- [x] `npm run check` passes. (4,132 tests, on the build's machine.)

### Work package

- **Owns:** `packages/formats/pdf`.
- **Must not change:** `common`, the local host, either host's policy.
- **Runs after:** the [PDF preview](pdf-preview.md).

## As built

Built by an Opus 5.5 sub-agent, read and checked by the orchestrating agent, which changed no
code, ran the package's tests again and looked at the selection drawn in the built host.

### How the text is laid

- **pdf.js's `TextLayer`,** given the page's text as a stream, a box over the canvas and the
  page's viewport at the box's width; `update` on a change of width; `cancel` with a drawing
  that is cancelled. The class comes to the page column from the engine's module, so pdf.js
  still loads behind the one `import()`.
- **After the canvas, one page at a time.** Ready settles on the canvas, as it did.
- **The rules** are the package's own, taken from pdf.js's `.textLayer` rules: the layer's
  place and size from `--total-scale-factor`, each piece transparent and placed by its inline
  style, the selection's colour, and the rules for a page turned by its `/Rotate`. pdf.js's
  viewer stylesheet is not shipped.
- **The selection's colour** is `--spl-code-selection-bg`, the code editor's. `common` has no
  token for a selection over a picture, and none was added.
- **Text only near view** is one line, where a page gives its canvas back
  ([Clarification 1](#clarifications), built to its lean and not yet ruled).

### The selection

A bare `TextLayer` misbehaved as the spec feared: in Chromium a drag from the middle of a line
to the right margin took the rest of the page. The build does what pdf.js's viewer does: an
element after each page's text that cannot be selected, which covers the page while the mouse
is down. The class that says "a selection is being made" is on the column and not on a page,
since pdf.js's viewer finds the next page through the document's selection, which does not see
into a shadow root.

**One rule of the PDF preview changed:** a page's box clips with `overflow: clip` where it had
`overflow: hidden`. With `hidden`, in Firefox, a drag from one page into the next took the rest
of that page.

### What a screen reader is given

Read from the browsers' accessibility trees (Chromium 158 and Firefox 159), not heard:

- **A page with text:** a group named for the file, holding a group "Page 1 of 1" with the
  page's lines as text. Chromium's whole tree holds no canvas.
- **A page with none** (a fax scan): a picture, "Page 1 of 1".
- A page far from view holds no text, and is a picture with its label until it is drawn.

### The measures

Medians of eight runs, on a page of 6,457 characters in 67 lines:

| First page drawn | With its text | Without |
| ---------------- | ------------- | ------- |
| Chromium, warm   | 36 ms         | 36.5 ms |
| Firefox, warm    | 39.5 ms       | 40.5 ms |
| Chromium, cold   | 156.5 ms      | 151 ms  |
| Firefox, cold    | 192 ms        | 191 ms  |

The cost is later: each page's text is laid before the next page's canvas, so the third page of
a dense PDF is drawn at 115 ms where it was at 84 ms (Chromium; 142 against 113 ms in Firefox).

| Elements in the shadow root, top / middle / end | With text       | Without         |
| ----------------------------------------------- | --------------- | --------------- |
| 200 pages, a line each                          | 215 / 223 / 215 | 206 / 208 / 206 |
| 200 pages of dense text                         | 611 / 883 / 611 | 206 / 208 / 206 |

### What was run, and what was not

- **In the built host, Chromium 158 and Firefox 159,** by a script: a drag of the mouse across
  a line, with the selection, the clipboard and a paste each holding that line; a drag from
  page 1's last line into page 2's first, holding both in order; `window.find` finding a phrase
  on a page near view, not finding one on page 150 from the top, and finding it there once
  scrolled to; a page far off holding no text and no canvas.
- **No policy report,** in the page or the worker, for seven PDFs, in the built host and in the
  stand-in for Context Manager's client, with each listener shown to hear.
- **Tests:** 94 and 13 in a browser (2.6 s). No test of the PDF preview's was changed.
- **A change of width, and a page turned by `/Rotate`,** were looked at once by script in both
  browsers. No test holds them.
- **Never run:** the browser's own find bar; a real screen reader; Safari; a touch or a
  keyboard selection; a screen with a pixel ratio above 1; Context Manager itself.

### Where the brief for the build was wrong

It named the JPEG 2000 fixture as the page with no text. That PDF has a caption, so the fax scan
stood in.
