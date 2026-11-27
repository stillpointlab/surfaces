---
column: done
pr: 199
completed: 2026-11-26
created: 2026-11-26T13:59:39-07:00
tags: [feature, formats, spike]
---

> Tech-spike working notes: capture the question, what you find, and where it points — enough that a
> brief can be distilled from it later. Keep it honest about uncertainty; link sources. The
> `column:` frontmatter above drives this file's card on the task board (absent for pooled spikes).

# Spike: pdf.js in a format package

## Question

The [brief](../../phase1/briefs/media_previews.md) chose pdf.js (decision 3) and said its spec
"still opens with the checks the [seed](../../phase1/seeds/pdf-preview.md) left: the worker as a
built file of its own, and what a JPEG 2000 image does under each host's policy". Its constraints:
preview only; neither host's policy is loosened; what a PDF needs to draw is built into the
package and served from the host's own origin. This spike answers those checks, and the ones
behind them: which other files pdf.js fetches while it runs, and how a format package ships them
with no line of host configuration, as the
[worker](../../phase2/specs/a-worker-file-in-a-format-package.md) is shipped.

## Findings

All of it was run on 2026-11-26 with `pdfjs-dist` 6.5.438, Playwright's Chromium 158 and
Firefox 159, Vite 8.3.5. A trial format made by `npm run new-format -- pdftrial --url` drew a PDF's
first pages to canvases in its shadow root with pdf.js's document API, and wrote what happened on
itself. It was tried four ways, as the worker proof did:

| Build | What                                                                                                                                 | Policy                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| b1    | The package's own build (`dist/`), loaded by a page of the spike's with an import map                                                | Context Manager's, plus the hash of that import map                    |
| b2    | The built local host (`npm run build`, `surfaces.js <folder>`)                                                                       | The local host's own                                                   |
| b3    | The local host in development mode                                                                                                   | The local host's own                                                   |
| b4    | A stand-in for Context Manager's client: a Vite build of the package's `dist/` with its `vite.config.ts` build options word for word | Context Manager's, from `src/routers/app.ts` (unchanged at `b0fdb288`) |

Each case ran in a fresh browser context, with a listener for `securitypolicyviolation` in the
page and, since a worker's reports fire on the worker's own global, a second one inside the trial
worker. Every row below was run in both browsers unless it says otherwise; where they differed it
says so. Safari was not run. The rig and the trial package are not committed; the commands that
made the test PDFs are under [References](#references).

### The package

`pdfjs-dist` 6.5.438, Apache-2.0, Mozilla. 38 MB, 570 files: `build/` (`pdf.mjs` 891 kB, 182 kB
gzipped; `pdf.worker.mjs` 2.2 MB, 480 kB gzipped; minified copies; a new optional renderer worker,
`pdf.renderer.mjs`; the scripting sandbox), `cmaps/`, `standard_fonts/`, `wasm/`, `iccs/`,
`legacy/` (the same for older browsers, with polyfills), `web/` (the viewer, not used) and
`types/`. It names `@napi-rs/canvas` as an optional dependency, which npm installs with it: a
35 MB native binary on Linux, used only in Node. Read from the installed package, the 6.x API
differs from the seed's: there is no `isEvalSupported` option and no `eval` or `new Function` in
`pdf.mjs` or `pdf.worker.mjs`; the three factories are one, `BinaryDataFactory`, used when
`useWorkerFetch` is false; and there is an `iccUrl`.

### 1. The worker

- **It runs as a file of its own by the repository's convention, in all four builds and both
  browsers.** `src/worker/worker.ts` is one line, `import 'pdfjs-dist/build/pdf.worker.mjs'`:
  pdf.js's worker module starts itself on the global it runs in. The element starts it with the
  convention's `startWorker()` and the lazily loaded engine is handed it as
  `GlobalWorkerOptions.workerPort`, which 6.5 still has.
- **Built, it is 1.20 MB (370 kB gzipped)** in both Vite hosts, emitted as `assets/worker-<hash>.js`
  and loaded; in development mode it is served as a module worker from source. pdf.js's worker
  loads a decoder's fallback with `import()`, and that worked in the hosts' classic (iife) workers.
- **The package's own build (b1) fails with pdf.js as an external dependency:** `dist/worker.js`
  keeps `import "pdfjs-dist/build/pdf.worker.mjs"`, and a worker has no import map, so it errors
  (Chromium, b1). Built into the package's files (`noExternal`) it loads. No host loads `dist/`
  unbundled, so this matters only to that rig.
- **With a port, pdf.js never tries a `blob:` or "fake" worker** (read: `PDFWorker` in
  `build/pdf.mjs`). Left without one (run, b1):

  | pdf.js given                    | What happened                                                                                                                                                           |
  | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | No port, no `workerSrc`         | The document fails: `No "GlobalWorkerOptions.workerSrc" specified.`                                                                                                     |
  | A `workerSrc` on another origin | A `blob:` worker, refused (`worker-src`), then the worker's module on the main thread, refused (`script-src-elem`); the document fails: `Setting up fake worker failed` |
  | A same-origin `workerSrc`       | pdf.js starts a module worker of its own and draws; no host build can follow that address                                                                               |

- **pdf.js does not hear a worker that failed to load.** Handed a port, it waits for ever: the
  trial sat at "loading" for 60 s in b1. The element has to listen for the worker's `error` itself.
- **Imports a worker makes only for their side effects are dropped** by tsup, and by Vite in both
  hosts (the local host reads the source, but still honours `package.json`), unless the package's
  `sideEffects` lists them: the trial's worker built to 0.4 kB until it did.

### 2. The files pdf.js fetches while it runs

| Files                                                   | Count, bytes (gzipped)   | Needed by                                                              | Without them (run)                                                                                                 |
| ------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Character maps, `cmaps/*.bcmap`                         | 168, 1.17 MB (863 kB)    | Text in a CJK font that is not embedded and uses a predefined CMap     | The CJK text is neither drawn nor extracted; the rest draws; "Ensure that the `cMapUrl` API parameter is provided" |
| Standard fonts, `standard_fonts/` (10 `.pfb`, 4 `.ttf`) | 14, 774 kB (534 kB)      | Symbol and ZapfDingbats, always; all 14 when `useSystemFonts` is false | Those two fall back to a system font (not looked at by eye): "Cannot load system font: Symbol"                     |
| `openjpeg.wasm`, `openjpeg_nowasm_fallback.js`          | 221 kB (70), 338 kB (89) | JPEG 2000 images (scans)                                               | The image is blank, the rest draws: "JpxError: OpenJPEG failed to initialize"                                      |
| `jbig2.wasm`, `jbig2_nowasm_fallback.js`                | 104 kB (41), 132 kB (42) | JBIG2 and, new in 6.x, CCITT fax images (black-and-white scans)        | The image is blank: "Jbig2Error: JBig2 failed to initialize"                                                       |
| `qcms_bg.wasm`; `iccs/CGATS001Compat-v2-micro.icc`      | 97 kB (35); 8.5 kB       | Colour management of ICC-based images (the typst PDF has one); CMYK    | Drawn in the alternate colour space; no fallback exists                                                            |
| `quickjs-eval.wasm`                                     | 469 kB                   | The viewer's scripting sandbox only                                    | Never fetched by the document API                                                                                  |

pdf.js names each file as a base address plus its name (`${cMapUrl}${name}.bcmap`), and a base
must end in `/`. A host's Vite build gives every file it emits a hash, so a folder of fixed names
exists only where a host copies one. pdf.js's way around that is `BinaryDataFactory`: with
`useWorkerFetch: false` the worker asks the page for a file by kind and name, and a factory of the
package's own answers from any address. It covers character maps, standard fonts and the `.wasm`
files, but not a decoder's JavaScript fallback, which the worker always imports from
`${wasmUrl}${name}`, nor `iccUrl`.

The candidates, each run in all four builds:

| How the package names its files                                                         | b1                    | b2                                                          | b3                                                                            | b4                                           |
| --------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| One `new URL('./pdfjs/<folder>/<file>', import.meta.url)` per file, read by the factory | works                 | works                                                       | works                                                                         | works once the factory reads `data:` (below) |
| The same by the bare name, `new URL('pdfjs-dist/<folder>/<file>', …)`                   | 404                   | works                                                       | works                                                                         | works, the same way                          |
| One template, ``new URL(`./pdfjs/${folder}/${file}`, import.meta.url)``                 | works                 | works                                                       | works                                                                         | works, the same way                          |
| `import.meta.glob('./pdfjs/*/*', { query: '?url', eager: true })`                       | fails: not a function | works                                                       | works                                                                         | works, the same way                          |
| A folder the host serves, `cMapUrl: '/pdfjs/cmaps/'` and so on                          | rig's mount           | copied by hand                                              | 404                                                                           | copied into its `publicDir`                  |
| `wasmUrl` as `new URL('./pdfjs/wasm/', import.meta.url)` (a folder)                     | works                 | 404: Vite leaves it, and it resolves beside the built chunk | the whole document fails: `Invalid factory url … must include trailing slash` | 404, as b2                                   |
| `wasmUrl` as the openjpeg fallback's own address with `#/` after it                     | JPEG 2000 only        | JPEG 2000 only                                              | JPEG 2000 only                                                                | JPEG 2000 only                               |
| A worker hooked to ask the package for a fallback's address (below)                     | works                 | works                                                       | works                                                                         | works                                        |

- **Context Manager's build writes a small file into the code.** Its config leaves Vite's
  `assetsInlineLimit` at 4 kB, so 134 of the 168 character maps became `data:` addresses in the
  preview chunk (421 kB, where the local host's, built with the limit at 0, is 78 kB). Fetching one
  was refused under its `connect-src 'self'` and reported (Chromium; the vertical CJK PDF, whose
  `UniJIS-UCS2-V.bcmap` is 664 bytes). A factory that decodes a `data:` address itself, with no
  fetch, drew it in every build. `?no-inline` on the address may keep Vite from inlining; not tried.
- **The fallbacks have no package-only way in pdf.js as published.** The trial made one: a copy of
  `pdf.worker.mjs` generated with one line changed, so that the `import()` asks
  `globalThis.pdfjsFallbackUrl(name)` first, and a module in the worker that answers with one
  `new URL('./pdfjs/wasm/<fallback>', import.meta.url)` per fallback. JPEG 2000 and CCITT drew in
  all four builds and both browsers. Its generator fails if the line is not found exactly once.

### 3. JPEG 2000 and the policy

Neither host's `script-src` has `'wasm-unsafe-eval'`, and pdf.js compiles in its worker, whose
policy is the one its own response carries; both hosts send their page policy with every file, in
development mode too. In every build and both browsers:

- **WebAssembly is refused and reported,** in the worker, the same report in both browsers:
  `blockedURI: "wasm-eval"`, `violatedDirective` and `effectiveDirective: "script-src"`, the source
  file the worker's own. Chromium logs "Compiling or instantiating WebAssembly module violates the
  following Content Security policy directive because 'unsafe-eval' is not an allowed source of
  script"; Firefox "call to WebAssembly.instantiate() blocked by CSP".
- **The JavaScript fallback then draws the image,** where its address is reachable (table above),
  with the same share of inked pixels as WebAssembly under a policy with `'wasm-unsafe-eval'` (b1,
  run for comparison).
- **It costs time:** a 400×300 image's page drew in about 300 ms against 130 ms for a page with no
  image (Chromium). A page-sized scan, 1700×2200 (`jpx-scan.pdf`):

  | Page 1 drawn, ms         | Chromium    | Firefox     |
  | ------------------------ | ----------- | ----------- |
  | JavaScript fallback (b1) | 1,829–2,112 | 1,922–1,961 |
  | JavaScript fallback (b2) | 1,750–4,060 | 2,294–3,157 |
  | WebAssembly allowed (b1) | 340–362     | 455–596     |

- **Where neither works,** the page draws with the image's area blank and a warning in the
  console; nothing tells the element.
- **CCITT fax behaves the same,** through `jbig2.wasm` and its fallback. JBIG2 itself was not
  tried: there is no encoder here.
- **ICC profiles:** `qcms_bg.wasm` is refused and reported, and the images draw in their alternate
  space (sRGB here: the share of inked pixels moved from 0.268 to 0.269). The typst PDF here
  carries one, so even a plain text PDF brought two reports. Its CMYK profile is used only through
  `qcms`, so `iccUrl` does nothing under either policy.
- **`useWasm: false` stops every attempt:** no `.wasm` is fetched, no report, and the same pixels.

### 4. Everything else the policies touch

With the character maps, the standard fonts and the fallbacks reachable, b1 to b4, both browsers:

| PDF                                        | Result                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `embedded-fonts.pdf` (typst)               | Draws; the ICC report above                                                                               |
| `standard-fonts.pdf` (none embedded)       | Draws                                                                                                     |
| `cjk-cmap.pdf`, `cjk-vertical.pdf`         | Draws; the text is extracted                                                                              |
| `jpx.pdf`, `ccitt-g4.pdf`, `icc.pdf`       | Draws; reports as above                                                                                   |
| `scanned-jpeg.pdf` (one large JPEG a page) | Draws, no report                                                                                          |
| `ps-function.pdf` (a FunctionType 4)       | Draws; pdf.js compiles the function to WebAssembly, is refused and reported, and falls back to JavaScript |
| `pages-200.pdf` (4.1 MB)                   | Page 1 in 140 ms (Chromium, b2)                                                                           |
| `encrypted.pdf`                            | `onPassword` is called; without it, `PasswordException`                                                   |
| `not-a-pdf.pdf`                            | `InvalidPDFException: Invalid PDF structure.`                                                             |

No `font-src`, `style-src`, `img-src` or `worker-src` report came from pdf.js in any case: fonts
are loaded from bytes, and the text layer's inline styles fall under `'unsafe-inline'`, which both
hosts allow. pdf.js 6.5 has no `eval` to switch off; what it compiles, it compiles to WebAssembly.

### 5. Loading the file

Through a proxy in front of the built local host (Chromium; the 200 pages, 4.1 MB):

| Options                              | Before page 1 drew                                                           | After 3 s |
| ------------------------------------ | ---------------------------------------------------------------------------- | --------- |
| Defaults                             | 4 requests, 4.1 MB: a `bytes=0-0` probe, then the whole file streamed        | the same  |
| `disableAutoFetch` + `disableStream` | 5 requests, 698 kB: the probe, 512 kB of a stream it cut, three 64 kB ranges | the same  |
| The same, on a linearized copy       | 66 requests, 5.5 MB                                                          | the same  |
| `disableRange`                       | 2 requests, 4.1 MB                                                           | the same  |

- pdf.js asks for ranges, and the route answers them. By default it streams the whole file
  besides, which on a local host arrives before page 1 is drawn.
- **The second opening sent 1 byte:** every request came back `304` on the route's `ETag`
  (`Cache-Control: no-cache`). The route's `content-security-policy: sandbox` does not touch a
  `fetch`.
- A slower network was not tried, so what the defaults cost there is not measured.

### 6. Size, and loading on demand

| Part                                 | Package's build (tsup)                  | Built local host (Vite)          |
| ------------------------------------ | --------------------------------------- | -------------------------------- |
| pdf.js, main thread                  | external: 2.7 kB; built in: 868 kB      | 445 kB, 132 kB gzipped           |
| Worker                               | 2.12 MB (pdf.js built in, not minified) | 1.20 MB, 371 kB gzipped          |
| The preview, with its table of files | 47 kB                                   | 78 kB, 8 kB gzipped (b4: 421 kB) |
| Fallbacks                            | 471 kB                                  | 471 kB, 131 kB gzipped           |
| Character maps, standard fonts       | 1.17 MB, 774 kB                         | the same, each its own file      |
| `.wasm` files                        | 422 kB                                  | the same; never usable today     |

Opening a `.txt` in the built local host fetched nothing of pdf.js in either browser; opening a
PDF then fetched the preview, the engine and the worker. Only the files a PDF needs are fetched.

### 7. The text layer

pdf.js's `TextLayer` lays transparent spans over the canvas, each placed by an inline `style`, and
needs the `.textLayer` rules from `web/pdf_viewer.css` in the shadow root, with
`--total-scale-factor` set. In both browsers, in the built local host: no report; a span selected
by script and by a mouse drag gave its text; `window.find` found text in the shadow root.
Find-in-page from the browser's own bar was not tried. A canvas-only first version gives up
selecting and copying, finding, and any text a screen reader can read: a canvas is a picture.

### 8. jsdom

jsdom has no `Worker` and no 2d canvas. Under vitest in Node 24, pdf.js's modern build imports
but fails to read a PDF (`Uint8Array.prototype.toHex` is missing) and warns "Please use the
`legacy` build in Node.js environments". The legacy build, with no worker given, runs its worker
on the same thread and reads a PDF's pages, text, password and validity. It cannot draw
(`page.render` met a null context). The element, connected with a source, fails with `Worker is
not defined`. So jsdom can test the element's states with the engine mocked, and the reading of a
PDF through the legacy build; drawing, the worker, the fallbacks and the files need a browser.

### 9. Firefox and Safari

Firefox 159 behaved as Chromium in every case, a few hundred milliseconds slower to draw. Safari
was not run. The package says only that the `legacy/` build is for older browsers. Read from the
modern build, it uses `Map.prototype.getOrInsertComputed`, `Math.sumPrecise`,
`Uint8Array.prototype.toHex` and `fromBase64`, and `Float16Array`; a Safari without one of them
needs the legacy build. Its code carries a guard for Safari's limit on decoded bytes.

## Recommendation

### The package

- **Entries:** `.`, `./preview`, `./format`, and `./worker` by the README's convention. The
  descriptor opens `.pdf` and `needs: 'url'`. pdf.js stays a dependency, not built into `dist/`.
- **The worker** is the convention's `src/worker/worker.ts` and `start.ts`, the preview's element
  starts it once a PDF opens, and the engine is handed it as `GlobalWorkerOptions.workerPort`. The
  element fails the document when the worker reports `error`. One worker serves the page.
- **pdf.js's main module loads on demand,** through `createLazyLoader`, in the engine chunk. A text
  file loads none of it.
- **The files pdf.js fetches are copied into the package** by a generating step beside
  `gen:styles`, from the installed `pdfjs-dist`, into `src/preview/pdfjs/` (character maps,
  standard fonts) and `src/worker/pdfjs/` (the two fallbacks), and the package's build copies them
  into `dist/` at the same places. Ignored by git, as the styles are.
- **They are named by one template address** in a module the preview entry imports statically,
  ``new URL(`./pdfjs/${folder}/${file}`, import.meta.url)``, and read by the package's
  `BinaryDataFactory`, which reads a `data:` address itself.
- **The fallbacks are reached by the hooked worker** (my lean, see For Jamie 1).
- **Options:** `useWasm: false`, `useWorkerFetch: false`, the factory, `wasmUrl` left out,
  `useSystemFonts` left at its default; `isOffscreenCanvasSupported` and the rest at defaults. No
  `rendererSrc`.

### The convention it adds

For the README beside "Workers": files a library fetches by name at run time are copied into the
package beside the module that names them, named by `new URL()` relative to that module in an
entry's own file (as the worker is), and handed to the library through a function that maps a name
to an address. A host's Vite emits each as its own file. A file under 4 kB may come back as `data:`
in Context Manager's build, and the function must read it without a fetch. A worker's imports made
for their side effects are listed in `sideEffects`.

### What the spec should require

- The element's states: loading, drawn, a PDF that asks for a password (said in words; no field
  for one in a first version), not a PDF, the worker failed.
- Pages drawn as they come into view, not all at once: the trial drew three, and 200 canvases at
  full size would hold hundreds of megabytes.
- Browser tests in the package for the worker, a page drawn, the fallbacks and the character maps,
  with small PDFs in `dev/media/` made by command.
- A test that the generated worker's one change is in place, so an upgrade of pdf.js that moves the
  line fails the build.

And leave out of a first version: the text layer, a password field, the renderer worker, links and
annotations, the outline, printing, and zoom beyond fit-to-width.

### For Jamie

1. **How the decoders' fallbacks are shipped.** Without them a JPEG 2000 or fax scan is a blank
   page. Either a generated copy of pdf.js's worker with one line changed (no host configuration;
   a patch to keep up with each pdf.js upgrade), or a folder of fixed names each host copies and
   serves (configuration in both hosts, and none today in development mode), or neither in a first
   version. Lean (the agent's): the generated worker, and an issue offered to pdf.js asking for a
   hook so it can go.
2. **`'wasm-unsafe-eval'` in both hosts.** Refusing it costs: a scanned page in JPEG 2000 draws in
   about 2 s where it would in 0.35 s; ICC colour management is lost (barely visible on sRGB);
   PostScript functions run slower. Allowing it loosens `script-src` in both hosts, for every page.
   Lean: refuse for now, with `useWasm: false`, and ship no `.wasm`; revisit if scans are common.
3. **`@napi-rs/canvas`,** 35 MB of native binary that npm installs with pdf.js, unused in a
   browser. Lean: accept it rather than fight npm over an optional dependency.
4. **The text layer.** Without it a PDF cannot be selected, searched or read aloud. Lean: a second
   step of the same phase, not the first version.

## References

- The [brief](../../phase1/briefs/media_previews.md), the [seed](../../phase1/seeds/pdf-preview.md),
  the [worker spec](../../phase2/specs/a-worker-file-in-a-format-package.md) and the
  [streaming spike](../../phase1/spikes/a-video-player-that-streams.md).
- The policies: `packages/hosts/local/src/server/page.ts`; Context Manager's `src/routers/app.ts`
  and its `vite.config.ts`. The raw route: `packages/hosts/local/src/server/host.ts`.
- pdf.js as installed: `build/pdf.mjs` (`getDocument`, `PDFWorker`, `BinaryDataFactory`),
  `build/pdf.worker.mjs` (`WasmImage`, `IccColorSpace`, `buildPostScriptWasmFunction`),
  `types/src/display/api.d.ts`.
- The test PDFs, from nothing downloaded: ImageMagick 7.1, Ghostscript 10.06, typst 0.15 and a
  small PDF writer in Python with PIL (`make-pdfs.py`, which writes each object by hand):

  ```sh
  magick -size 400x300 -seed 7 plasma:red-blue -blur 0x2 jpx.png
  magick jpx.png -define jp2:rate=20 jpx.jp2                         # into jpx.pdf, /JPXDecode
  magick -size 1700x2200 -seed 1 plasma:wheat-white -quality 70 scan1.jpg
  magick -size 1700x2200 -seed 2 plasma:white-gray80 -quality 70 scan2.jpg   # scanned-jpeg.pdf
  magick scan1.jpg -define jp2:rate=20 jpx-scan.jp2                  # into jpx-scan.pdf
  python3 -I make-pdfs.py pdfs src-images   # standard-fonts, cjk-cmap (UniJIS-UCS2-H),
    # cjk-vertical (UniJIS-UCS2-V), jpx, jpx-scan, icc (Ghostscript's srgb.icc and ps_cmyk.icc),
    # scanned-jpeg, ps-function, pages-200 (a 160×160 noise JPEG and a line of text a page)
  typst compile embedded.typ embedded-fonts.pdf      # a heading and two lines; fonts embedded
  magick -size 1275x1650 xc:white -fill black -pointsize 60 -annotate +100+200 'CCITT Group 4 scan' \
    -draw 'rectangle 100,300 1175,1500' -fill white -draw 'rectangle 200,400 1075,1400' \
    -monochrome -compress Group4 ccitt-g4.pdf
  gs -q -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -sOwnerPassword=owner -sUserPassword=secret \
    -dEncryptionR=3 -dKeyLength=128 -o encrypted.pdf embedded-fonts.pdf
  printf 'This is a plain text file with a .pdf name.\n' > not-a-pdf.pdf
  gs -q -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dFastWebView=true -dPassThroughJPEGImages=true \
    -o pages-200-linear.pdf pages-200.pdf
  ```
