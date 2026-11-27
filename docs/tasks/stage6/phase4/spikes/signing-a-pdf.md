---
column: todo
created: 2026-11-26T16:10:00-07:00
tags: [formats, feature, spike]
---

> Tech-spike working notes: capture the question, what you find, and where it points — enough that a
> brief can be distilled from it later. Keep it honest about uncertainty; link sources. The
> `column:` frontmatter above drives this file's card on the task board (absent for pooled spikes).

# Spike: signing a PDF

## Question

Jamie, 2026-11-26, with the [PDF preview's spec](../specs/pdf-preview.md): "add a spike for
supporting signing pdfs". Asked which signing, 2026-11-27: "a signature drawn on the page. we can
add verifiable as a spike". So this spike is the first of two: a person puts their signature on a
page of a PDF, as they would sign a form, and the PDF is saved with it. It proves nothing by
itself. A signature a reader can verify is
[its own spike](a-pdf-signature-that-can-be-verified.md).

To answer:

1. **Making the signature.** Drawn with a mouse, a finger or a pen; typed and set in a script
   face; or a picture a person already has. Which of these a first version needs, and what
   each costs. Whether it is kept for the next PDF, and where (the element forgets; a host may
   remember).
2. **Putting it on the page.** Choosing the page and the place, its size, moving it and taking
   it away before saving. How that sits with a column of pages drawn near view, and with the
   text layer over each page.
3. **Writing it into the PDF.** Read in `pdfjs-dist` 6.5.438 and not yet run: pdf.js has ink and
   stamp annotations, a signature editor of its own (`types/src/display/editor/signature.d.ts`),
   and a `saveDocument()` that returns the PDF's bytes with what was added.
   - Does that work from the display API alone, without pdf.js's viewer, and how much of the
     viewer does its signature editor bring with it?
   - Is what it writes seen in other readers (Adobe's, a browser's, Preview on a Mac), and does
     it print?
   - Is the signature part of the page or an annotation a reader can lift off, and does that
     matter?
   - Otherwise, a library that writes PDFs: which, under which licence, how large, and whether
     it runs under both hosts' policies as pdf.js was made to.
4. **What the save does to the file.** Whether it rewrites the whole PDF or adds to its end, and
   what it does to a PDF that already carries a verifiable signature (it must not break one
   silently). A PDF with a password. A form's fields.
5. **The bytes.** A signed PDF is a new version of a binary file. The storage port is text
   today, and the stage's spike on writing bytes is where that is asked: this spike says what
   signing needs of it, and whether a first version could hand the person a download instead.
6. **Where it belongs.** A preview does not write. Is signing an editor for the PDF format
   (`<pdf-editor>`, with the preview as it is), a mode of the preview, or a step of its own in a
   host? It is nearer the [basic media editors](../../../unassigned/seeds/basic-media-editors.md)
   than this stage's previews.
7. **What it must not do:** send the signature anywhere, or leave it where the next person at
   the machine finds it without the first having chosen that.
8. **Context Manager:** a signed version of a good, and who signed it.

## Findings

Not run yet.

## Recommendation

None yet.

## References

- The [pdf.js spike](pdfjs-in-a-format-package.md), the
  [PDF preview's spec](../specs/pdf-preview.md) and the
  [text layer's](../specs/pdf-text-layer.md).
- `pdfjs-dist`: `types/src/display/api.d.ts` (`saveDocument`, `annotationStorage`) and
  `types/src/display/editor`.
- The [media previews brief](../../phase1/briefs/media_previews.md): the spike on writing bytes
  at the stage's close.
