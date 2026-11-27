---
created: 2026-11-27T13:10:00-07:00
tags: [formats, feature]
---

# Finding a word anywhere in a PDF

The PDF preview draws the pages near view (those in view and two either side) and gives the rest
back, so a long PDF costs no more than a short one. A page's text is laid over its picture and
lives as long as the picture does. So the browser's own find (Ctrl+F) reaches the pages near view
alone: on page 3 of a 200-page PDF it does not find a word on page 150, and says "not found" as
it does for a word that is nowhere. Jamie, 2026-11-27, ruling the
[text layer's](../../stage6/phase4/specs/pdf-text-layer.md) one question: "seed for better Ctrl-F
in pdfs is fine".

What follows is the claude agent's reading, not a design Jamie has agreed.

## Two ways

- **Every page's text held at once.** The browser's find then works with nothing new to learn.
  The text layer's build counted what a 200-page PDF holds near view; held for every page it is
  that many times over, and it undoes the bound the preview was built to keep. The text of a
  page not yet drawn must also be fetched from pdf.js, page by page, before a find can see it.
- **A find of our own.** A field in the preview asks pdf.js for the document's text (it gives a
  page's text without drawing the page), keeps where each match is, scrolls to one and marks
  it, with next, previous and a count. This is what pdf.js's own viewer does, and why Firefox's
  built-in PDF reader answers Ctrl+F with its own bar.

## What a find of our own asks

- **Who owns Ctrl+F.** The element can take the key while it has the focus; a host has a find
  of its own to think of (Context Manager's, the editors' search panels). Taking the browser's
  key from a person is a thing to rule on.
- **Marking a match** on a page that is drawn, and on one that is drawn later.
- **The text of a large PDF:** read once and kept, or read as the search goes. A PDF of
  thousands of pages was never measured.
- **What matches:** case, accents, a phrase across a line's end or a page's, hyphenated words,
  and text pdf.js reads oddly (the phase's log has a ZapfDingbats line and a vertical comma).
- **A scan has no text,** and a find says nothing of it today.
- **A screen reader:** how a match and its count are told.

## Read with

- The [text layer's spec](../../stage6/phase4/specs/pdf-text-layer.md), its Clarification and
  its "As built" (the measures, and what `window.find` did in each browser).
- `packages/formats/pdf/src/preview/pages.ts`.
- pdf.js's viewer: `PDFFindController` in `pdfjs-dist/web/pdf_viewer.mjs`, for what its own find
  handles.
