---
column: in-progress
created: 2026-11-26T15:40:00-07:00
tags: [formats, feature, code]
---

# Spec: the PDF preview

_From the [media previews brief](../../phase1/briefs/media_previews.md), phase 4, and the
[pdf.js spike](../spikes/pdfjs-in-a-format-package.md), which ran pdf.js in a trial format under
both hosts' policies. One PR. The spike's questions for Jamie were ruled on 2026-11-26, and are
under [Decided](#decided)._

## High-level goal

A PDF chosen in the local host's tree shows in the page, its pages drawn by pdf.js in a
`<pdf-preview>` element in a package of its own. Neither host's policy changes, and neither host
gains a line of configuration for it: what pdf.js needs to draw comes with the package.

## Related context

- **Depends on:** the [worker convention](../../phase2/specs/a-worker-file-in-a-format-package.md);
  the raw route's ranges and validator; browser tests; and audio and video for the pattern (the
  states, an engine loaded on demand, the pane leaving an unchanged file's element alone and
  handing one that leaves an empty source).
- **What the spike showed,** in Chromium 158 and Firefox 159, in the package's build, the local
  host built and in development mode, and a stand-in for Context Manager's client:
  - pdf.js 6.5's worker runs as a file of its own by the convention, handed over as
    `GlobalWorkerOptions.workerPort`;
  - WebAssembly is refused by both policies, and pdf.js's JavaScript fallbacks then draw the same
    picture, slower;
  - pdf.js fetches character maps and fonts by name, and a package can ship them with no host
    configuration by naming each with `new URL()` and answering pdf.js through a function of its
    own;
  - opening a file that is not a PDF fetches nothing of pdf.js.
- **Main files:** a new `packages/formats/pdf` (`@stillpointlab/pdf-format`); a generating step
  under `tooling/`; `packages/hosts/local/src/client/registry.ts`; the root README (the table of
  packages, and a convention beside "Workers"); the release walk.
- **Jamie, 2026-11-25:** pdf.js; three packages; neither host's policy is loosened.

## Technical requirement

### 1. The package

Made with `npm run new-format -- pdf --url`: `./format` (`pdfFormat`, id `pdf`, `needs: 'url'`),
`./preview`, and `./worker` by the README's convention. No editor. It opens `.pdf`.

`pdfjs-dist` is its dependency, at the version the spike ran (6.5) or later, and is not built
into the package's own files: each host's build makes it a file, as with hls.js.

### 2. The element

`<pdf-preview>`, with `PdfPreviewElement extends UrlPreviewElement`.

- **What shows:** the pages, one under another in a column that scrolls, each as wide as the
  element allows up to its own size at 100%, on a quiet ground. Each page is a picture labelled
  for a screen reader "Page 3 of 12". The file's name labels the whole.
- **Pages are drawn as they come into view,** and a few either side. Each page has its place and
  size from the start, so the scroll bar is true before anything is drawn. A page far from view
  gives its canvas back. A 200-page PDF never holds 200 canvases.
- **Sharp on a dense screen,** drawn at the device's pixel ratio, with a bound on a canvas's
  size so one huge page cannot take the memory.
- **A change of width draws again,** once the width has settled.
- **States,** as the other previews':
  - _empty:_ "No PDF selected.";
  - _loading:_ until the first page is drawn;
  - _loaded:_ the pages;
  - _failed:_ words in place of the pages, said once to the error handler.
- **Ready** settles when the first page is drawn or the load has failed, never on a time.
- **Three failures, three sentences.** pdf.js tells them apart by the error it throws:
  - the file, the worker or pdf.js itself did not arrive: "Couldn't load this PDF.";
  - it arrived and is not a PDF pdf.js can read: "This file can't be read as a PDF.";
  - it asks for a password: "This PDF needs a password, and this preview can't ask for one
    yet.".
- **One page that fails to draw** says "This page couldn't be drawn." in its own place, and the
  others are drawn.
- **A new source lets the old one go:** its document is destroyed and its download ended.
  Leaving the page's tree stops drawing and keeps the document.

### 3. pdf.js, its worker and its options

- **The worker** is `src/worker/worker.ts` and `src/worker/start.ts`. One worker serves the page,
  started when the first PDF opens.
- **A worker that fails to load is the element's to hear.** Handed a port, pdf.js waits for
  ever. The element listens for the worker's `error` and fails with the first sentence.
- **The package's `sideEffects` lists what the worker imports for effect alone.** Without it the
  shared build and both hosts drop pdf.js from the worker, and it builds to 0.4 kB.
- **pdf.js's main module loads on demand,** through `createLazyLoader`, when a PDF opens.
- **Options:** the port; `useWasm: false`, so pdf.js never tries what both policies refuse, and
  no `.wasm` file is shipped; `useWorkerFetch: false` with the package's own function for files
  (section 4); every other option as pdf.js has it.
- **The file is loaded as pdf.js loads it by default:** a first request, then ranges and a
  stream, from the raw route.

### 4. The files pdf.js fetches by name

pdf.js asks for a character map or a standard font by a folder's address and a name. A host's
build gives every file a name of its own, so no such folder exists unless a host copies one.

- **The files are copied into the package** from the installed `pdfjs-dist` by a generating
  step, run where `gen:styles` runs: 168 character maps (1.17 MB) and 14 standard fonts
  (774 kB), beside the module that names them. They are ignored by git, as generated styles are,
  and the package's build puts them in `dist/` at the same places. The step does nothing when
  the copies are current.
- **One module names them,** each by `new URL()` relative to itself, in the preview entry's own
  file, as the worker's starter names the worker. A host's build then emits each as a file.
- **pdf.js is answered by a function of the package's** (its `BinaryDataFactory`), which maps a
  kind and a name to that address and fetches it.
- **A `data:` address is read without a fetch.** Context Manager's build writes a file under
  4 kB into the code as `data:`, and its `connect-src 'self'` refuses a fetch of one: 134 of the
  character maps are that small.
- **Only what a PDF needs is fetched.** A PDF with its fonts embedded fetches none of them.

**The README gains the convention,** beside "Workers": files a library fetches by name at run
time are copied into the package beside the module that names them, named by `new URL()` in an
entry's own file, handed to the library through a function, and read without a fetch when they
come back as `data:`.

### 5. Scans: JPEG 2000 and fax images

Without a decoder such an image is a blank space on its page. pdf.js imports a decoder's
JavaScript fallback from a folder's address too, and has no function a package can answer.

- **The generating step also writes a copy of pdf.js's worker with one line changed,** so the
  import asks the package for the fallback's address first. The package's worker imports that
  copy, and names the two fallbacks (JPEG 2000; JBIG2 and fax) by `new URL()`.
- **The step fails if the line is not found exactly once,** so an upgrade of pdf.js that moves
  it stops the build and does not ship a worker that draws blank scans.
- The copy's first line says what it is generated from and what was changed (pdf.js is
  Apache-2.0).

Jamie allowed this on 2026-11-26 ([Decided](#decided), 1).

### 6. Registered in the local host

One import and one entry in `registry.ts`, after video and before code, with the host's
dependency and its client's path as for every format.

### 7. Tests

- **jsdom:** the descriptor suite, `describeUrlPreviewContract`, the states and the three
  sentences with pdf.js and `startWorker` faked, the old source let go.
- **A browser,** few:
  - a page is drawn (its canvas has ink) and ready settles;
  - a PDF of several pages draws a later page when it is scrolled to, and not before;
  - text needing a character map is drawn;
  - a JPEG 2000 image is drawn, and no `.wasm` is asked for;
  - a PDF with a password, a file that is not a PDF and a missing file each say their sentence.
- **On the built package:** no entry reaches pdf.js's main module but by `import()`; the worker
  holds pdf.js; the generated worker's one change is in place.
- **Test PDFs** under `dev/media/`, each under 50 kB, written by a script in the package (in
  TypeScript, run by Node) with any other tool's command in the README. Nothing is downloaded.

### 8. The harness

Fixtures for a text PDF, one of several pages, one needing a character map, one with a JPEG 2000
image, one with a password, a file that is not a PDF, a missing file, and no source.

## Known and left

- **A scanned page in JPEG 2000 takes about two seconds** to draw, where WebAssembly would take
  a third of one ([Decided](#decided), 2).
- **No colour management.** An image with an ICC profile is drawn in its alternate colours. The
  spike measured the share of inked pixels moving from 0.268 to 0.269 on its sample.
- **Safari is not run here.** pdf.js's modern build uses features an older Safari lacks, and its
  `legacy/` build is the answer if the walk on a Mac finds one. Which build ships is decided
  there.
- **npm installs `@napi-rs/canvas` with pdf.js,** 35 MB of native code
  ([Decided](#decided), 3). It is a canvas for Node, which has none: pdf.js uses it to draw a
  page where there is no browser (a server making pictures of pages), and nowhere else (read:
  `NodeCanvasFactory` in `build/pdf.mjs`). No browser is sent it, and neither host's build
  holds it.

## Decided

Jamie, 2026-11-26, on the spike's questions and the agent's leans:

1. **The scans' decoders ship by the generated worker with one line changed** (section 5):
   "one-line change is fine with build fail". An issue is offered to pdf.js asking for a
   function, so the change can go.
2. **`'wasm-unsafe-eval'` stays out of both policies:** "sounds fine". Scans draw slower and
   there is no colour management.
3. **`@napi-rs/canvas` is accepted:** "should be fine". What it is for is under
   [Known and left](#known-and-left).
4. **The text layer is the next spec, not this one:** "text layer next is fine".
5. **A PDF with a password is told so in words for now,** with no field to type one. A field is
   deferred, with [a spike](../spikes/unlocking-a-pdf-with-a-password.md) to say what it takes.
6. **Signing a PDF** has [a spike](../spikes/signing-a-pdf.md) too, which Jamie asked for the
   same day. It is no part of this spec.

## Non-goals

- The text layer, links, the outline, annotations and forms.
- A field for a password, and signing. Zoom, rotation, printing, a page number to jump to.
- WebAssembly, and pdf.js's renderer worker.
- An editor, or any write.
- Context Manager, which adopts all three formats in phase 5.

## Acceptance / completion checklist

- [x] In the built local host, in Chromium: a PDF chosen in the tree draws; a 200-page PDF
      scrolls to its last page and draws it, with only the pages near view holding a canvas.
      (Two canvases at the top, five in the middle, three at the end.)
- [x] No policy report on the page or in the worker, for a text PDF, one needing a character
      map, and one with a JPEG 2000 image. (Chromium and Firefox; each listener was shown to
      hear, by a request the policy refuses.)
- [x] Opening a file that is not a PDF fetches nothing of pdf.js (counted at a proxy, and the
      test on the build).
- [x] The worker is a file of its own in the package's build and in the built host, and a
      worker that fails to load says the first sentence. (In 56 ms; the next PDF starts
      another.)
- [x] A PDF changed on disk is drawn anew; one that is unchanged keeps its place through the
      event stream's reconnection.
- [x] A PDF with a password, a file that is not a PDF and a missing file each say their
      sentence.
- [x] Firefox: the harness's fixtures draw. (Driven by Playwright's Firefox 159, not by a
      person's hand.)
- [ ] The browser tests pass in the PR's job, and their time is in the PR.
- [x] The root README has the convention for files fetched by name, and its table, the
      package's README and the release walk name the format.
- [x] `npm run check` passes, and its time before and after is in the PR: the generating step
      runs wherever `gen:styles` does. (2 min 2 s before, 1 min 51 s after: no slower.)

### Work package

- **Owns:** `packages/formats/pdf`; the generating step under `tooling/`; the README's
  convention; one entry in the local host's `registry.ts`.
- **Must not change:** either host's policy, `common`, the descriptor's contract, the template.
- **Runs after:** phase 3.

## As built

Built by an Opus 5.5 sub-agent, read and checked by the orchestrating agent, which changed no
code, ran the package's tests again and looked at one fixture drawn in the harness.

### Two things that differ from the spec and the spike

- **pdf.js is given the worker as a `PDFWorker` made from its port, handed to each document,**
  not through `GlobalWorkerOptions.workerPort` (section 3). With the global, destroying one
  document destroys the worker pdf.js made for it, and that is the page's one worker: a second
  document loading at that moment would hang. The README's "Workers" says so now.
- **The package's worker imports the generated copy beside it,** so `dist/worker.js` holds no
  bare import of pdf.js's worker (the brief for the build said it would). The copy is in
  `dist/pdfjs/`, for a host's bundler to build into its worker.

### The generating step

`tooling/gen-pdfjs.ts`, which `tooling/gen-styles.ts` runs for a package that depends on
`pdfjs-dist`. So it runs wherever `gen:styles` does, with no line in any package's scripts and
none in the local host's.

- **It writes 193 files** into the package, ignored by git, lint and prettier: 168 character
  maps and 14 fonts under `src/preview/pdfjs/`, with their licences, and under
  `src/worker/pdfjs/` the two fallbacks and the copy of pdf.js's worker with its one line
  changed. No `.wasm`.
- **It knows it is current** by the copy's first line, which names the installed version and a
  hash of the change, and by each copy being there at its source's size. Current, it takes
  about 25 ms; from nothing, 88 ms.
- **If the line has moved it fails before it removes anything,** so the last good copy stays.
- **Measured:** `npm run check` took 2 min 2 s before (4,047 tests) and 1 min 51 s after
  (4,120); an unrelated package's `npm test` took 1.4 to 1.8 s before and 1.35 to 1.44 s after.

### The files

| In the built local host    | Bytes     | Gzipped |
| -------------------------- | --------- | ------- |
| pdf.js, loaded on demand   | 443,140   | 131,288 |
| The worker                 | 1,201,135 | 370,570 |
| The PDF preview's own file | 29,012    | 7,945   |
| The JPEG 2000 fallback     | 338,458   | 89,416  |
| The JBIG2 and fax fallback | 132,439   | 41,641  |

The character maps and fonts are 182 files of their own, fetched one at a time as a PDF needs
them. The package's `dist/` carries 4.7 MB of copies.

- **Three addresses name them,** one for each ending (`.bcmap`, `.pfb`, `.ttf`), where the spike
  had one: a host then emits those files and not the licences beside them.
- **In the stand-in for Context Manager's build** the preview's file is 144 kB (54 kB gzipped),
  with the small character maps written into it. A vertical Japanese PDF, whose map is one of
  them, drew with no fetch and no report.

### The element

- **Pages in view and two either side are drawn.** A canvas holds at most 2^24 pixels and
  16,384 a side. A change of width draws again after 200 ms of quiet. 100% is 96/72 of a CSS
  pixel to a PDF unit.
- **Every page's size is read before any is drawn** (46 ms for 200 pages), so the scroll bar is
  true from the start. A page pdf.js cannot read takes its neighbour's size.
- **The three failures are told by the name of pdf.js's error:** `PasswordException`;
  `InvalidPDFException`, an empty file among them, and an unknown error that is not a failed
  fetch, for the second sentence; a refused answer, a failed fetch and anything that is not
  pdf.js's for the first.
- **A worker that fails to load** is heard by its `error` before its first message. It is
  ended, the document fails with the first sentence, and the next PDF starts another.
- **Ready settles on the first page drawn,** or on any page if the column was scrolled away
  first.
- **Leaving the page's tree** cancels what is being drawn and keeps the document and its
  canvases. A failed document is destroyed at once.
- **A page that fails to draw** says so in its place and is not told to the error handler.
- The frame is a group labelled with the file's name; each page is a picture labelled "Page 3
  of 12".

### What was run, and what was not

- **In the built host, Chromium 158,** by a script with a proxy before the host: every line of
  the checklist. A 200-page PDF made outside the repository was ready in 46 ms.
- **Policy reports:** none, in the page or in the worker, in Chromium and Firefox 159, for five
  PDFs (text, a character map, JPEG 2000, a fax scan, embedded fonts). Each case ended with a
  request the policy refuses, from the page and from inside the worker, and both listeners
  heard it.
- **In the harness, Chromium 158 and Firefox 159,** by Playwright: the nine fixtures.
- **A stand-in for Context Manager's client,** its build options and its policy: the same PDFs
  in both browsers, clean.
- **Tests:** 82 and 8 in a browser (2.4 s); `npm run check` whole, 4,120.
- **In Firefox, once for each PDF opened,** the console says "The execution of microtasks on
  this page was reordered to avoid unsafe execution." The spike's trial saw it too. Not looked
  into.
- **Never run:** Safari; Context Manager itself; the local host in development mode; a slow
  network or a large file; a screen with a pixel ratio above 1, a change of width and a failing
  page in a real browser (jsdom alone); a PDF of thousands of pages.

### The issue offered to pdf.js

Written and not sent; sending it is Jamie's to do or not.

> **Let an embedder give the address of a decoder's JavaScript fallback**
>
> In pdf.js 6.5.438, with `useWasm: false` (or WebAssembly refused by a page's content security
> policy), the worker loads `openjpeg_nowasm_fallback.js` (JPEG 2000) and
> `jbig2_nowasm_fallback.js` (JBIG2, CCITT fax) by importing an address built from `wasmUrl` and
> a fixed name, in `WasmImage#getJsInstance`. Character maps, standard fonts and `.wasm` files
> can come from anywhere through `BinaryDataFactory` with `useWorkerFetch: false`, which suits a
> bundler that gives every file a hashed name. The fallbacks have no such hook: they must sit in
> one folder under their published names, and without them a scanned page draws with its image
> blank. Could pdf.js take a function, an option or a factory method, that returns the
> fallback's address (or the module itself)? We ship a copy of `pdf.worker.mjs` with that one
> line changed to ask `globalThis.pdfjsFallbackUrl?.(name)` first, and would like to drop it.
