---
column: todo
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

- [ ] In the built local host, in Chromium: a PDF chosen in the tree draws; a 200-page PDF
      scrolls to its last page and draws it, with only the pages near view holding a canvas.
- [ ] No policy report on the page or in the worker, for a text PDF, one needing a character
      map, and one with a JPEG 2000 image.
- [ ] Opening a file that is not a PDF fetches nothing of pdf.js (counted at a proxy, and the
      test on the build).
- [ ] The worker is a file of its own in the package's build and in the built host, and a
      worker that fails to load says the first sentence.
- [ ] A PDF changed on disk is drawn anew; one that is unchanged keeps its place through the
      event stream's reconnection.
- [ ] A PDF with a password, a file that is not a PDF and a missing file each say their
      sentence.
- [ ] Firefox: the harness's fixtures draw.
- [ ] The browser tests pass in the PR's job, and their time is in the PR.
- [ ] The root README has the convention for files fetched by name, and its table, the
      package's README and the release walk name the format.
- [ ] `npm run check` passes, and its time before and after is in the PR: the generating step
      runs wherever `gen:styles` does.

### Work package

- **Owns:** `packages/formats/pdf`; the generating step under `tooling/`; the README's
  convention; one entry in the local host's `registry.ts`.
- **Must not change:** either host's policy, `common`, the descriptor's contract, the template.
- **Runs after:** phase 3.
