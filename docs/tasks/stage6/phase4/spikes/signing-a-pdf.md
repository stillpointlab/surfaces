---
column: done
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

Run on 2026-11-27 with `pdfjs-dist` 6.5.438, Playwright's Chromium 158 and Firefox 159, on a
detached checkout of the PDF preview with its text layer (`e62dd42`). The trial put a Sign button, a
pad, placing and a "Save a signed copy" download inside `<pdf-preview>`; it is not committed. Each
finding says **run** (where), **read** (which file) or **not tried**. "The built host" is
`npm run build`, then `surfaces.js <folder>`, driven by Playwright in both browsers with a listener
for policy reports in the page and the worker and a canary for each: no report was heard. "The lab"
is a page of the spike's own, served with the local host's policy, that runs pdf.js's editor with
none of its viewer. "Other readers" are poppler 26.01 (`pdfinfo`, `pdftoppm`, `pdfsig`), Ghostscript
10.06 on screen and with `-dPrinted` (it draws only what is marked to print), and `pdftocairo -ps`
read back by Ghostscript. `qpdf` and `mutool` are not on this machine; Adobe's reader, Preview on a
Mac and Safari are not either: **not run**.

### 1. Making the signature

**Drawn, built and run** (built host, both browsers). A pad of 480 × 160 CSS pixels: a canvas with
`touch-action: none`, pointer events with the pointer captured, `getCoalescedEvents()` for a smooth
line, and Clear, Picture…, Place and Cancel. The strokes are kept as points; Place takes their box.
A mouse drew three strokes in both browsers. A finger and a pen are the same pointer events: **not
tried** on a touch screen or a tablet. The pad is a pointer's alone: a person who cannot draw has
the picture, or a typed signature once there is one.

**A picture, built and run** (both browsers): `<input type="file" accept="image/png,image/jpeg">`,
read with `createImageBitmap(file)`. No address is made for it, so neither host's `img-src` matters
(Context Manager's has no `blob:`). A 300 × 100 PNG with a transparent ground saved with its
transparency (finding 3).

**Typed, not built.** pdf.js turns text into outlines (`SignatureExtractor.extractContoursFromText`,
read), but the look of a typed signature is the script face, and neither the package nor `common`
ships one. A face under the OFL, its licence beside it, served by `font-src 'self'`: by estimate,
about 40 kB of font and 60 lines. Or the text set on the pad's canvas in that face and saved as a
picture, which needs no outlines.

**What the element holds:** the strokes (or the chosen file) until Place, then each placed copy: its
page, its place and width as fractions of the page, and its element. Nothing else.

**Kept for the next PDF: no, in the trial.** The element forgets it with the source (finding 7). A
host that remembers one would hold it where the unlock spike would not hold a password: a thing the
person chose to keep, with a way to forget it. **Not built.**

### 2. Putting it on the page

**Run, built host, both browsers.** After Place the bar says "Click where the signature goes."; the
next click on a page centres it there, 30% of the page wide at most. It is an inline SVG of the
strokes (a canvas for a picture) in a box placed in percentages of the page's box, with a button
"Take the signature away". A drag moves it within the page.

| What happens                                      | Seen                                         |
| ------------------------------------------------- | -------------------------------------------- |
| placed on page 1, then dragged left and up        | moved (0.558, 0.821 → 0.411, 0.783 of page)  |
| a second placed, then taken away                  | one left                                     |
| page 1 scrolled far off (12 pages), canvas let go | the signature stays in page 1's box          |
| scrolled back, page 1 drawn again                 | at the same fractions, to three places       |
| the window 1200 → 800 pixels wide                 | at the same fractions                        |
| another file opened, then this one again          | no signature: the element kept none          |
| the saved rectangle against the screen            | the same: `[251.6 126.8 424.9 171.8]` points |

**What must survive a page being given back** is only the signature's own element and its fractions.
The column gives back a page's canvas and text and keeps its box (read, `pages.ts` `release`), so a
signature put in the box lives as long as the column. Percentages of the box make a new width and a
redraw move nothing; no code of the column's had to change but one lookup, `pageOf(node)` (9 lines).
One exception, read and not run: a page that fails to draw replaces its box's children, signature
and all.

**The text layer:** the signature sits over it (`z-index: 2`). A click to place lands on the text's
spans and is heard by a listener on the column in its capture phase. A drag on the signature takes
the pointer, so it selects no text. Not built: resizing the signature, moving it by keyboard,
placing it by keyboard. All three a first version needs, the keyboard ones for anyone who cannot
drag.

### 3. Writing it into the PDF

**pdf.js's own save works outside its viewer, and needs none of its editor.** Read in
`build/pdf.mjs` and `build/pdf.worker.mjs`, then run. `saveDocument()` sends
`annotationStorage.serializable` to the worker. Every value under a key starting
`pdfjs_internal_editor_` becomes a new annotation on its `pageIndex` (`getNewAnnotationsMap`,
`AnnotationFactory.saveNewAnnotations`). A value is a plain object; only an editor instance is asked
to `serialize()` itself. So the element puts in what pdf.js's editors would serialize, in the page's
own units, and calls `saveDocument()`:

| Kind            | `annotationType` | What it needs                         | Written as                               |
| --------------- | ---------------- | ------------------------------------- | ---------------------------------------- |
| drawn signature | 101 (SIGNATURE)  | `rect`, `lines`, `thickness`, `color` | a `/Stamp` with an appearance of lines   |
| ink             | 15 (INK)         | `rect`, `paths` (`lines`, `points`)   | an `/Ink` with `/InkList` and appearance |
| picture         | 13 (STAMP)       | `rect`, `bitmap` (an `ImageBitmap`)   | a `/Stamp` drawing an image XObject      |

Run in Node (the legacy build) for ink and drawn on all the test PDFs, and in both browsers in the
built host for drawn and picture. The trial uses the drawn signature, as pdf.js's own signature
editor does. `lines` is six numbers a point, the first four `NaN` for a straight line. The picture
needs `OffscreenCanvas` in the worker (both browsers have it; Node does not), and the worker takes
the bitmap, so each save makes a new one. The values are taken out of the storage again once the
save is done.

**pdf.js's editor, without its viewer, run in the lab** (both browsers, light DOM). It needs:

- an `AnnotationEditorUIManager`, made with 17 arguments: a container, a viewer element, an event
  bus and the document; the rest may be `null`. A stub bus did: the manager listens for 6 of the
  viewer's events and sent 4. It adds listeners to `window` (pointer, `beforeunload`), the
  document's selection, the keyboard and drag and drop.
- an `AnnotationEditorLayer` and a `DrawLayer` for each page, and an `l10n` (a stub that answers
  each message's id with the id did; the words are in `viewer.ftl`, which `pdfjs-dist` does not
  ship). The editor classes are set up once a page, by statics (`AnnotationEditor._l10n`), and read
  `--outline-width` from the document's root.
- `web/pdf_viewer.css` (169 kB; 97 rules name the editor, its toolbar or signatures; 32 images) for
  the editor's own boxes, toolbar and resizers. Without it they draw as bare buttons in a corner.
  Not tried: inside a shadow root.

With that, ink drawn with the mouse in ink mode was committed when the mode went back to none, and
`saveDocument()` returned it; other readers drew it. **The signature editor does not make a
signature.** Its pad and its draw, type and picture tabs are the viewer app's `SignatureManager`
(`web/signature_manager.js` in pdf.js's repository), which `pdfjs-dist` does not ship: without it a
click in signature mode made nothing (run in the lab; read, `AnnotationEditorLayer.pointerup`), and
the editor waits for ever. Handed a drawing in place of the dialog
(`layer.addNewEditor({ signatureData })`), it made one and saved it. So the editor brings placing,
resizing and its keyboard, not the signature, and it brings them with the viewer's manager, words
and stylesheet. No JavaScript is added: the editor classes are already in the 443 kB pdf.js module
the preview loads.

**What it writes is a real part of the saved PDF, as an annotation** (run, other readers, every file
saved in finding 4). poppler and Ghostscript draw it, `-dPrinted` and the PostScript path draw it
(`/F 4`, the print flag), and Chromium's own PDF viewer (PDFium, full Chromium in its new headless
mode) showed the drawn and the picture by screenshot. Firefox's own viewer: **not run**
(Playwright's Firefox downloads a PDF rather than show it). A form's value and a tagged PDF's text
are kept. pdf.js reads the saved file back with the `Stamp` among the page's annotations.

**Part of the page, or an annotation a reader can lift off:** an annotation. It is in the page's
`/Annots`, not in its content, with no `/Locked` flag (pdf.js sets `/F 4` and offers no other), so a
reader that edits annotations can move it or delete it. No way was found in pdf.js to write into
a page's content or to flatten on save (read: its save writes annotations and form values only).
Whether it matters: a drawn signature proves nothing either way, since anyone can copy the picture
onto another page. It matters for a form a person expects to see signed in any reader: there it is
seen and printed (above).

**The alternative, measured: pdf-lib 1.17.1** (MIT; its last release November 2021). Run in Node
only; in a browser **not tried**. A bundle of the one call (`PDFDocument.load`, `drawSvgPath`,
`save`) is 422 kB minified, 176 kB gzipped, by esbuild; the bundle has no `WebAssembly`, no `eval`
and no `new Function`, and fetches nothing (its fonts are in it). It draws into the page's content:
part of the page, not liftable. But it **rewrites the whole file** (finding 4), refuses an encrypted
PDF, and with `ignoreEncryption` wrote one no reader could open. pdf.js does the job with no new
dependency, so pdf-lib is not needed.

### 4. What the save does to the file

**It adds to the end; the original bytes are kept whole.** Read, `incrementalUpdate` in the worker;
run on every test PDF in Node and on six in both browsers: each saved file starts with the
original's bytes, byte for byte, and adds the changed page, the annotation, its appearance and a new
cross-reference section with `/Prev`.

| PDF                                        | Added         | What happened                                                  |
| ------------------------------------------ | ------------- | -------------------------------------------------------------- |
| `text.pdf` (drawn)                         | 726–1021 B    | an annotation and its appearance                               |
| `text.pdf` (picture, 300 × 100 PNG)        | 5,096–5,345 B | an image and its soft mask, compressed                         |
| `pages.pdf` (12 pages, page 1)             | 688–979 B     | page 1 alone changed                                           |
| `embedded-fonts.pdf` (typst, tagged)       | 758–1051 B    | an xref stream as the file had; the structure tree not changed |
| `password.pdf` (RC4, opened with `secret`) | 799 B         | still encrypted: the new objects encrypted with the file's key |
| `form.pdf` (a filled text field)           | 687–981 B     | the field's value kept                                         |
| `signed.pdf` (approval signature)          | 688–983 B     | the signature still valid, now "not total document signed"     |
| `certified.pdf` (certification, DocMDP 2)  | 688–983 B     | as signed; see below                                           |

Where there are two figures, the lower is Node's drawing and the higher the browsers' (more
points). One save took 3–7 ms in Node, and 52 ms (Chromium)
and 74 ms (Firefox) from the click to the download.

**A PDF that already carries a digital signature.** Made locally: a hand-written PDF with a
signature field, signed with `openssl cms -sign` (SHA-256, `adbe.pkcs7.detached`) over its byte
ranges by a self-signed test certificate (the script is kept outside the repository). `pdfsig` says
"Signature is Valid." and "Total document signed" before; after pdf.js's save, "Signature is Valid."
and "Not total document signed", as an incremental update should. pdf.js's own `getSignatures()`
says `coversWholeDocument: false`, `modificationsAfterSignature: 1`. **pdf-lib's save broke it:**
the file shrank from 9,271 to 2,791 bytes, its byte ranges point past the end, `pdfsig` cannot
verify it and `getSignatures()` returns none.

**A certified PDF** (DocMDP with `P` 2: form filling and signing allowed, annotations not) is the
case the save cannot honour by itself. `pdfsig` and pdf.js still call the signature valid; pdf.js
does not read DocMDP (read: no `DocMDP` in either build). Adobe's reader would judge an added
annotation against `P` 2: **not run**. So the element must say so before saving a copy of a signed
PDF: `getSignatures()` returns non-null for one (run).

**A password.** pdf.js saves only a document it has opened, so the person has given the password
(the [unlock spike](unlocking-a-pdf-with-a-password.md)); the saved copy keeps the file's encryption
and opens with the same password in poppler and Ghostscript. Run in Node alone: the preview on this
branch cannot ask for a password yet.

**A form's fields** are kept as they were. pdf.js would also save values typed into its form layer
(`page.save`, read), but the preview has none.

**The whole file is needed:** the save waits for every byte (`requestLoadedStream`, read), so a
large PDF loaded by ranges is fully downloaded first.

### 5. The bytes

**A first version can hand the person a download, run in both browsers.** The bytes from
`saveDocument()` go into a `Blob`, an address from `URL.createObjectURL`, a link with
`download="<name> (signed).pdf"` clicked inside the shadow root, and the address revoked a second
later. Playwright saw a download from a `blob:` address in both, with that name. No policy report: a
link's download is not a fetch, and no directive of either host's covers it (read, both policies;
Context Manager's from `src/routers/app.ts` at `main` `6db02950`, which has no `sandbox` and no
`navigate-to`). It was not run in Context Manager.

**What a real save needs of the spike on writing bytes:**

- `put` with a body of bytes (a `Uint8Array` or a `Blob`), not text. A signed copy is 1 kB more than
  the original for a drawing, a few kB for a picture.
- A version to write against (the file's validator, as `probe` gives), so a file changed on disk
  since it was opened is not overwritten with a copy of the old one.
- A new path beside the original, or the original replaced. Lean: a new path, as the download does,
  so the unsigned file stays.
- Undo: the local host's journal keeps text, and asks first for anything else (the basic media
  editors seed). A signed copy at a new path needs no journal of what it replaced.
- A way for the element to hand the bytes to the host: an event or a method on the PDF's own type,
  since `EditorElement` speaks text (finding 6).

### 6. Where it belongs

Read: `common/src/contracts.ts` and `format.ts`. `EditorElement` is text in and text out
(`setContent`, `getContent`, `content-change` with `{ content: string }`); a descriptor's `editor`
entry is a tag the host mounts in its edit view, and the local host's pane offers an edit view only
for a format with one. A PDF's edit would be bytes out, so a `<pdf-editor>` needs a contract
`common` does not have, and the writing-bytes spike to give it somewhere to write.

| Where                 | For it                                                                                  | Against it                                                                    |
| --------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| a mode of the preview | the trial: the page column, the document and its fit reused; 31 lines in existing files | "a preview does not write"; every host gets a Sign button                     |
| a `<pdf-editor>`      | the contracts' own shape: preview reads, editor writes                                  | a contract for bytes first; a second element over the same pages              |
| a step of a host's    | the host owns where the bytes go                                                        | the host would need the pages, the place and pdf.js: the element's work twice |

The trial says the work is the element's either way: the pages, the place, the save. What differs is
who decides it is offered and where the bytes go. Lean: an opt-in mode of `<pdf-preview>` (an
attribute the host sets, off by default), whose result is a download today and, once bytes can be
written, an event the host answers. It becomes `<pdf-editor>` when the basic media editors give
`common` a contract for bytes, sharing the page column.

### 7. What it must not do

Run in the built host, both browsers, around every step of finding 2 and the saves:

| Where                                                               | Found                                 |
| ------------------------------------------------------------------- | ------------------------------------- |
| requests (address and body) while signing                           | none at all: 0 requests               |
| the console, page and worker, while signing                         | nothing written                       |
| `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, cookies | the same before and after (all empty) |
| the element after its file is opened again                          | no signature                          |
| pdf.js's annotation storage after a save                            | emptied (the trial removes its keys)  |

The trial reports nothing through the error handler; a failed save says "Couldn't make a signed
copy." and reports nothing. What does leave the element: the downloaded file, which is the point,
and the browser's own list of downloads, which would name it for the next person at the machine
(reasoned, not looked at). That is the browser's, as any download is. Not tried: whether a crash
report or the browser's session restore keeps the pad's canvas.

### 8. Context Manager

Read, not run. It does not register the PDF format yet. A signed copy is a new version of a good, a
binary one, and waits on the writing-bytes spike as finding 5 does. **Who signed** is the one thing
Context Manager knows and the PDF does not: the person logged in when the version was saved. A drawn
signature proves nothing of who drew it, so the record of who saved it is the stronger claim, and a
signature a reader can verify is [the other spike](a-pdf-signature-that-can-be-verified.md). pdf.js
puts no name in the annotation unless given one (`/T`, read); the trial gives none. Its download
needs nothing of its policy (finding 5); showing a chosen picture must not use an `img` with a
`blob:` address, which its `img-src` refuses (read). The trial draws it on a canvas.

## Recommendation

Build it on pdf.js's save with plain values in its annotation storage, with a pad and placing of our
own, and none of pdf.js's editor or viewer. **The trial adds 553 lines and removes 3, in four
files** (`git diff --stat` on its checkout): `signing.ts` 437 (the pad 121 of them), 88 of styles,
20 in the element, 11 in the page column. It has no tests; the package's 94 jsdom tests still pass.
Built, `signing.ts` is 8.2 kB minified, 3.0 kB gzipped; pdf.js adds nothing. By size the trial is
about 60% of the text layer (907 lines) and a sixth of the PDF preview (3,029 lines), as the unlock
spike measured them.

A first version with tests, by the unlock spike's ratio (half its lines tests): about 900–1,100
lines, a README section and a release-walk step. The agent's guess: two to three days with its spec,
walk and PR. What would make it larger: a typed signature (a face, its licence, about 100 lines);
resizing and keyboard moving and placing (150–250); a host's write of the bytes (the writing-bytes
spike's work, then 50–100 here); pdf.js's own editor instead of ours (its stylesheet, its words and
the viewer's manager); a host remembering a signature; initials or a date beside it.

**A first version holds:** the pad drawn with a pointer, a picture, placing by a click, moving by a
drag and by the keyboard, resizing, taking away, several on several pages, "Save a signed copy" as a
download, the words before saving a copy of a signed PDF, nothing kept, and tests in jsdom (the
values handed to a fake storage, the fractions) and in a browser (a save read back by pdf.js, its
bytes starting with the original's). **It leaves out:** a typed signature, a host's write, a
remembered signature, pdf.js's editor, and a signature a reader can verify.

### For Jamie

1. **Build it, and when.** Lean (the agent's): a spec in a later phase, after the writing-bytes
   spike has answered, since the download is a stopgap; or now as a download alone if a signed form
   is wanted before then.
2. **Where.** A mode of `<pdf-preview>` the host turns on, a `<pdf-editor>`, or a host's step. Lean:
   the mode, off by default, becoming `<pdf-editor>` once `common` has an editor contract for bytes.
3. **pdf.js's editor or our own.** Lean: our own pad and placing over pdf.js's save. The editor
   needs the viewer's manager, stylesheet and words, and brings no pad.
4. **Drawn and picture, or typed too.** Lean: drawn and picture; typed when a script face is chosen.
5. **An annotation, not page content.** pdf.js can only add an annotation; a reader can lift it off.
   Lean: accept it, and say so in the README.
6. **A PDF already signed.** The save keeps an approval signature valid, and a certified PDF may
   forbid the change. Lean: before saving a copy of a PDF with signatures, say "This PDF is
   digitally signed. Your signature is added after it, and the signed part is kept; some signed PDFs
   do not allow this." and let the person go on.
7. **Kept for the next PDF.** Lean: no, for a first version.
8. **The bytes.** Lean: the download now, a copy at a new path once bytes can be written, never
   replacing the original by default.

## References

- The [pdf.js spike](pdfjs-in-a-format-package.md), the
  [PDF preview's spec](../specs/pdf-preview.md) and the
  [text layer's](../specs/pdf-text-layer.md).
- `pdfjs-dist`: `types/src/display/api.d.ts` (`saveDocument`, `annotationStorage`) and
  `types/src/display/editor`.
- The [media previews brief](../../phase1/briefs/media_previews.md): the spike on writing bytes
  at the stage's close.
- pdf.js 6.5.438, read and run: `build/pdf.mjs` (`AnnotationStorage.serializable`,
  `saveDocument`, `AnnotationEditorUIManager`, `AnnotationEditorLayer`, `SignatureEditor`,
  `StampEditor.serialize`), `build/pdf.worker.mjs` (`SaveDocument`, `getNewAnnotationsMap`,
  `AnnotationFactory.saveNewAnnotations`, `InkAnnotation`, `StampAnnotation`, `createImage`,
  `incrementalUpdate`, `writeObject`, `signatures`), `web/pdf_viewer.css`.
- The surfaces: `packages/common/src/contracts.ts`, `format.ts`; the PDF package's
  `pdf-preview.ts`, `pages.ts`; the local host's `src/server/page.ts` and
  `client/host-client.ts`. Context Manager: `src/routers/app.ts`.
- The signed test PDFs: a 100-line Node script writing `form.pdf`, `signed.pdf` and
  `certified.pdf`, signed with `openssl cms -sign -binary -md sha256 -outform DER` and a key
  from `openssl req -x509 -newkey rsa:2048 -nodes`; it, the trial's patch and the lab are kept
  outside the repository.
