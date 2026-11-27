---
created: 2026-11-27T14:20:00-07:00
tags: [formats, feature, host-contract]
---

# A drawn signature on a PDF

A person signs a PDF as they would sign a form: they draw their signature or choose a picture of
it, put it on a page, and save a copy of the PDF with it. The
[spike](../../stage6/phase4/spikes/signing-a-pdf.md) ran a trial of all of it in both browsers and
Jamie ruled on its eight questions, 2026-11-27: "later phase is fine but let's capture so we don't
lose it". This is that capture. A signature a reader can verify is
[another spike](../../stage6/phase4/spikes/a-pdf-signature-that-can-be-verified.md), not run.

## What is decided

- **A mode of `<pdf-preview>` that a host turns on,** off by default, "then migrated to editor":
  it becomes `<pdf-editor>` once `common` has an editor's contract for bytes.
- **A pad and placing of our own,** over pdf.js's own save (`saveDocument()` with plain values in
  its annotation storage). None of pdf.js's editor or viewer, and no new dependency.
- **Drawn and picture first.** A typed signature waits for a script face to be chosen.
- **The signature is an annotation,** which other readers show and print and an editing reader
  can lift off. That is accepted and said in the README.
- **A PDF already digitally signed:** warn, then let the person go on. The save adds to the
  file's end, so an earlier signature stays valid; a certified PDF may forbid the change, and
  pdf.js does not check.
- **The signed copy is saved beside the original,** never over it.
- **Nothing is remembered** in a first version.

## What it waits for

- **The spike on writing bytes,** at stage 6's close. Until a host can write bytes a signed copy
  can only leave as a download. The spike's card says what signing needs of it: a body of
  bytes, a version to write against, a new path, and a way for the element to hand the bytes
  over.

## What the spike left for the build

- Resizing a placed signature, and placing and moving it by keyboard. A first version needs all
  three.
- Tests: the trial has none. The spike's estimate for a first version with them is 900 to 1,100
  lines.
- Not run: Adobe's reader, Preview on a Mac, Safari, a touch screen or a pen, a rotated page,
  a PDF with a password in the browser, Context Manager.
- The trial itself is not in the repository. It was 553 lines in four files; the card's
  findings are enough to write it again.

## For the PDF editor, when there is one

Jamie, on a remembered signature: "no memory is fine (let's capture for pdf editor though)".

- **A signature kept for the next PDF.** A host holds it, as a thing the person chose to keep,
  with a way to forget it. The element holds nothing.
- A typed signature, initials, and a date beside a signature.

## Read with

- The [spike](../../stage6/phase4/spikes/signing-a-pdf.md), its findings and "Decided".
- [Very basic media editors](basic-media-editors.md), where an editor's contract for bytes is
  asked.
