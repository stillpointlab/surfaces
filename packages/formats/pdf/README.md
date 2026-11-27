# @stillpointlab/pdf-format

A format given a URL, not text: a read-only `<pdf-preview>` (`./preview`) that draws the PDF a host
hands it with [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0), its descriptor
(`./format`), and pdf.js's worker (`./worker`). No editor and no core. Created from
`tooling/template/url-format`.

```ts
import '@stillpointlab/pdf-format/preview';

const preview = document.createElement('pdf-preview');
preview.setSource('/files/report.pdf', 'report.pdf');
```

## Entry points

- `.`: `PdfPreviewElement`, the element's type, and the logging setters. It registers no element.
- `./preview`: `<pdf-preview>`, implementing `PdfPreviewElement`.
- `./format`: `pdfFormat`, the descriptor a host registers (see
  `@stillpointlab/common-format/format`). It opens `.pdf`, needs a URL the host gives it, not the
  file's text, and `apply` calls `setSource(url, <file name>)`. Importing it defines no element;
  its `load()` resolves to `./preview` itself.
- `./worker`: pdf.js's worker, `dist/worker.js` (see "Workers" in the root README). A host loads
  nothing of it by hand: the preview starts it, and a host's build follows the preview to it.

`PdfPreviewElement` extends `UrlPreviewElement`, the contract in `common` every preview given a
URL answers to: `setSource(src, name)` and the ready signal. Nothing is added to it until a host
asks for something of PDF's alone (a page to show).

## The element

The pages one under another in a column that scrolls, on a quiet ground, each as wide as the
element allows up to its size at 100% (a PDF unit is 1/72 inch, a CSS pixel 1/96), each with its
text laid over it. The file's name labels the whole (`role="group"`); each page is labelled for a
screen reader "Page 3 of 12": a group holding its text (`role="group"`), or a picture
(`role="img"`) while it has none. `setSource(src, name)` sets the `src` and `name` attributes.

| State   | Shows                                                                     |
| ------- | ------------------------------------------------------------------------- |
| empty   | "No PDF selected."                                                        |
| loading | "Loading…", then the pages laid out under a loading cover until one draws |
| loaded  | the pages                                                                 |
| failed  | one of three sentences in place of the pages                              |

- **Every page has its place from the start.** Once the document has opened, every page's size
  is read before any is drawn, and each page's box is laid out at it, so the scroll bar is true
  before anything is drawn.
- **Only the pages near view are drawn.** The pages in view (an `IntersectionObserver` on the
  column) and two either side hold a canvas, drawn one at a time, the nearest first; a page
  further off gives its canvas back (its pixels let go at once, and pdf.js's page cleaned up).
  So a 200-page PDF holds a canvas for each page in view and four more, never 200.
- **Sharp on a dense screen.** A page is drawn at the screen's pixel ratio, within a bound on a
  canvas: 2^24 pixels (64 MiB) and 16,384 a side. A page that would need more is drawn at a lower
  ratio, softer.
- **A change of width draws again** the drawn pages, once the column's width has stayed the same
  for 200 ms (a `ResizeObserver`). Until then the browser scales the canvases.
- **Each drawn page carries its text,** laid over its canvas once the canvas is shown (see "Its
  text" below). Ready does not wait for it.
- **Three failures, three sentences,** each reported once through `reportError`, told apart by
  the error pdf.js gives (`src/preview/failure.ts`):
  - "Couldn't load this PDF.": the file did not arrive (pdf.js's `ResponseException`, an answer
    that was not a success; an `UnknownErrorException` carrying a `TypeError`, a fetch that
    failed), or the worker or pdf.js itself did not (any other error).
  - "This file can't be read as a PDF.": it arrived and pdf.js cannot read it
    (`InvalidPDFException`, an empty file too, and any other `UnknownErrorException`).
  - "This PDF needs a password, and this preview can't ask for one yet.": `PasswordException`.
    pdf.js would ask `onPassword` first; the element gives it none.
- **A page that cannot be drawn** says "This page couldn't be drawn." in its own place (at the
  size of the page before it, when pdf.js could not read the page at all), and the others are
  drawn.
- **Ready** is pending until a page has been drawn (the first, unless the column was scrolled
  away first) or the load has failed, and settles at once when there is nothing to show. It
  never settles on a time.
- **A new source lets the old one go:** its document is destroyed, which ends its download, and
  its canvases are given back. Only the document in the element is heard. A new name relabels it
  and loads nothing.
- **Leaving the page's tree stops drawing** (what is drawing is cancelled) and keeps the
  document and what is drawn, so put back it draws again where it was. A move (out and back in
  one task) does not stop it.

## pdf.js

`pdfjs-dist` 6.5 is a dependency, and is not built into this package's files: each host's build
makes it files of its own, as with any dependency.

- **Its document API loads on demand.** The element imports `src/preview/engine.ts` with
  `import()` (through `createLazyLoader`) when a PDF opens, so pdf.js's main module is a file of
  its own that a text file or an image never fetches: 443 kB, 131 kB gzipped, in the local host.
  `src/build.test.ts` builds the package and holds that no entry reaches it.
- **One worker serves the page,** started when the first PDF opens, by `src/worker/start.ts` as
  the root README's convention has it, and given to pdf.js as the port of a `PDFWorker` every
  document shares, so destroying one document never touches the worker another is using. It is
  1.2 MB, 371 kB gzipped, in the local host.
- **A worker that fails to load is the element's to hear.** Handed a port, pdf.js sends its
  request and waits for ever. The element listens for the worker's `error` until its first
  message (pdf.js's worker says "ready" as soon as it runs), and fails with the first sentence;
  the next PDF starts another worker.
- **Options:** `useWasm: false`, `useWorkerFetch: false` with this package's own
  `BinaryDataFactory` (below), and pdf.js's own for everything else. The file is loaded as
  pdf.js loads it by default: a first request, then ranges and a stream, from the host's raw
  route.
- **No WebAssembly.** Neither host's policy has `'wasm-unsafe-eval'`, so pdf.js never tries it,
  and no `.wasm` is shipped. Its JavaScript fallbacks draw the same pictures, slower: a scanned
  page in JPEG 2000 takes about two seconds. An image with an ICC profile is drawn in its
  alternate colours: there is no colour management without WebAssembly.
- **Its text layer** is pdf.js's `TextLayer`, handed to the page column from the engine module,
  so it loads on demand with the rest of pdf.js.

### Its text

A drawn page's text is laid over its canvas by pdf.js's `TextLayer`: transparent spans, each
placed by an inline style, in a box of its own over the canvas (`.pdf-preview__text`). The canvas
is what a person sees; the text is there to be selected, found and read.

- **What it gives:** a drag across a page selects its text, and a copy is that text, in pdf.js's
  reading order; a selection may run from one page into the next. The selection shows in
  `--spl-code-selection-bg`, the nearest of `common`'s tokens (CodeMirror's selection; there is
  none for a selection over a picture). The browser's own find (Ctrl+F) finds words on the pages
  that hold text. A screen reader is given each page as a group labelled "Page 3 of 12" holding
  its text, the canvas hidden from it (`aria-hidden`).
- **Only the pages near view hold text,** the pages that hold a canvas: the text lives as long as
  the canvas, given back with it, cancelled with its drawing, and brought to a new width with it.
  So **the browser's find reaches only the pages near view:** a word on a page far off is not
  found until that page is scrolled near. Holding every page's text would undo the bound on what a
  long PDF holds (the text spec's Clarification 1); the choice is one line, in `PageColumn`'s
  `release`.
- **A page with no text** (a scan) has none, and stays a picture labelled with its page. A page
  whose text pdf.js cannot read is the same, and nothing is said of it.
- **A drag past a line's end** does what pdf.js's viewer does: while the mouse is down in the
  column, an element at the end of each page's text covers the page under the text, and cannot be
  selected, so the drag keeps to the text it crossed rather than taking the rest of the page. It
  is the column's class (`pdf-preview__pages--selecting`), not a page's, so a drag into the next
  page finds that page covered too. A page's box clips with `overflow: clip`, not `hidden`, which
  makes it a scroll container: in Firefox a drag from one page into the next then took the rest of
  that page.
- **The rules** are the fewest of pdf.js's `.textLayer` rules (`web/pdf_viewer.css`) that place
  the text, in this package's stylesheet; pdf.js's viewer stylesheet is not shipped. Turned pages
  (`/Rotate`) have pdf.js's three rules for a turn.
- **What it does not give:** a find of its own, a count of matches or every match marked; links,
  the outline, annotations and forms; text for a scan (reading the letters off a picture); a
  mended reading order, or a tagged PDF's headings and tables. The order a reader hears is pdf.js's.
- **pdf.js measures text** with a hidden canvas it adds to the document's `<body>` (outside the
  element) the first time it lays text, and keeps it there.

### The files pdf.js fetches by name

pdf.js asks for a character map or a standard font by a folder's address and a name, and a
host's build gives every file a name of its own, so no such folder exists. `tooling/gen-pdfjs.ts`,
which `gen:styles` runs, copies them from the installed `pdfjs-dist` into this package, beside
the modules that name them, with the licences that cover them. They are ignored by git, and the
build copies them into `dist/pdfjs/`, where the built modules name them.

| Copied to                           | What                                                                | Named by                                    |
| ----------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| `src/preview/pdfjs/cmaps/`          | 168 character maps (`*.bcmap`, 1.17 MB)                             | `src/preview/files.ts`, one `new URL()`     |
| `src/preview/pdfjs/standard_fonts/` | 14 standard fonts (`*.pfb`, `*.ttf`, 774 kB)                        | `src/preview/files.ts`, one for each ending |
| `src/worker/pdfjs/`                 | the fallbacks of the JPEG 2000 and JBIG2 (and fax) decoders, 471 kB | `src/worker/fallbacks.ts`, one each         |
| `src/worker/pdfjs/pdf.worker.mjs`   | pdf.js's worker, with one line changed (below), 2.2 MB              | `src/worker/worker.ts`, imported            |

- **`src/preview/files.ts` is pdf.js's `BinaryDataFactory`:** pdf.js's worker asks the page for a
  file by kind and name, and it answers with the bytes from the file's address, so only what a
  PDF needs is fetched (a PDF whose fonts are embedded fetches none). Each kind is named by one
  `new URL()` with its ending fixed, in the preview entry's own file, so a host's Vite build
  emits each file and not the licences beside them.
- **A `data:` address is read without a fetch.** Context Manager's build writes a file under 4 kB
  into the code as one, and its `connect-src 'self'` refuses a fetch of it: 134 of the character
  maps are that small.
- **The scans' decoders need the changed worker.** pdf.js imports a decoder's JavaScript fallback
  from `${wasmUrl}${name}`, a folder's address, and has no function a package can answer. The
  generated copy of its worker has that one line changed, so the import asks
  `globalThis.pdfjsFallbackUrl(name)` first, and `src/worker/fallbacks.ts` answers with each
  fallback's `new URL()`. The copy's first line says what it was generated from and what was
  changed. Jamie allowed the change on 2026-11-26.
- **An upgrade of pdf.js that moves the line stops the build.** The step fails if the line is not
  found exactly once (and leaves the last good copy), and `src/build.test.ts` holds that the
  built worker has the change. Then the line is found anew in `build/pdf.worker.mjs`
  (`WasmImage`, `#getJsInstance`) and `HOOKED_FROM` in `tooling/gen-pdfjs.ts` follows it.
- **What `dist/worker.js` holds:** the fallbacks' addresses and an import of
  `./pdfjs/pdf.worker.mjs`, the changed copy, which the build puts beside it as it was generated
  for a host's bundler to build into the worker. The package's `sideEffects` lists both of the
  worker's imports, which are made for their effect alone: without it every build drops pdf.js
  from the worker, and it builds to 0.4 kB.

npm installs `@napi-rs/canvas` with pdf.js, 35 MB of native code. pdf.js uses it to draw a page
where there is no browser (Node), and nowhere else; no browser is sent it, and neither host's
build holds it. Jamie accepted it on 2026-11-26.

## Tests

`src/**/*.test.ts` run in jsdom, which has no worker and no canvas that draws: pdf.js and the
worker are stood in for (`src/testing/fake-pdfjs.ts`), and each test says when a document opens
or fails, when a page is drawn and when its text is laid. They cover the states and their words,
the three failures from pdf.js's errors, the worker that fails to load, the pages laid out and
labelled, the pages near view drawn and those far off given back, a width that settles, a page
that cannot be drawn, the old source let go, and leaving the page; and a page's text
(`pdf-preview-text.test.ts`): laid after ready, given back and cancelled with its canvas, brought
to a new width, none for a page with none. `src/build.test.ts` builds the package and reads the
files: pdf.js's main module reached from no entry but by `import()`, the worker importing pdf.js's
changed copy, every file where the built modules name it, and no `.wasm`.
`src/**/*.browser.test.ts` run in headless Chromium (`vitest.browser.config.ts`): a page drawn
with ink at the screen's pixel ratio, fetching the two standard fonts it needs and none for
embedded fonts; the last of twelve pages drawn only once it is scrolled to; Japanese text drawn
through its character map; a JPEG 2000 image drawn with no WebAssembly and no `.wasm` asked for;
the password, the file that is not a PDF and the missing file in their sentences; and a page's
text: the PDF's own over its canvas, two lines selected, `window.find` finding a word near view
and not one far off, the Japanese as its characters, and a page scrolled far away holding none.

The harness (`npm run dev`) has each of the test PDFs, a missing file and no source. Its missing
file is a revoked object URL: the harness's Vite answers a path it has no file for with its own
page, which pdf.js would read as a file that is not a PDF.

Test PDFs live in `dev/media/`, each under 11 kB. `dev/make-pdfs.ts` writes most of them by hand,
a small PDF writer run by Node with nothing downloaded. In this package's folder:

```sh
# dev/media/jpx.jp2: a 200×150 image of colour, for the JPEG 2000 PDF
magick -size 200x150 -seed 7 plasma:red-blue -blur 0x2 -depth 8 -define jp2:rate=20 dev/media/jpx.jp2
# text.pdf (five standard fonts, none embedded), pages.pdf (twelve pages), cjk.pdf (Japanese text,
# UniJIS-UCS2-H), jpx.pdf (the image above, JPXDecode), dense.pdf (a page of dense text, 6,457
# characters in 67 lines, for measuring the text) and not-a-pdf.pdf (text under a .pdf name)
node dev/make-pdfs.ts
# dev/media/password.pdf: text.pdf with the password "secret" to open it
gs -q -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -sOwnerPassword=owner -sUserPassword=secret -dEncryptionR=3 -dKeyLength=128 -o dev/media/password.pdf dev/media/text.pdf
# dev/media/embedded-fonts.pdf: a heading and a line in Libertinus Serif, embedded by typst
printf '#set page(width: 8.5in, height: 11in)\n= Fonts embedded\nThis text is set in Libertinus Serif, embedded by typst as a subset.\n' | typst compile - dev/media/embedded-fonts.pdf
```

For the release walk, outside the package (too large, or not this package's to keep):

```sh
# a long PDF: 200 pages, each its number and a band of colour (69 kB)
node dev/make-pdfs.ts --pages 200 <folder>
# a long PDF of dense text: 200 pages like dense.pdf (531 kB)
node dev/make-pdfs.ts --dense 200 <folder>
# a fax scan: CCITT Group 4, decoded by the JBIG2 decoder's fallback
magick -size 1275x1650 xc:white -fill black -pointsize 60 -annotate +100+200 'CCITT Group 4 scan' -draw 'rectangle 100,300 1175,1500' -fill white -draw 'rectangle 200,400 1075,1400' -monochrome -compress Group4 <folder>/fax.pdf
```

## Development

From the repository root, `npm run check` runs everything but the browser tests, and
`npm run test:browser -- --project @stillpointlab/pdf-format` runs this package's. In this
package, `npm run dev` opens the harness on this format, `npm test` runs its jsdom tests and
`npm run test:browser` its browser tests. Each runs `gen:styles` first, which copies pdf.js's
files in when they are not there or not current.
