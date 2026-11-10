---
title: 'PDF preview'
tags: [feature, formats]
created: 2026-09-08T15:58:42-07:00
---

- Add a preview-only `<pdf-preview>` web component in the same vein as `<image-preview>`: a new
  `packages/pdf-editor` submodule mirroring image-editor's shape (`./preview` export, tsup build,
  loading / error states), plus a `pdf-preview` digital-good route alongside `image-preview`. Not an
  editor — just read-only viewing of PDF goods in the good pane.
- Library survey (2026-09-08). The app CSP (`src/routers/app.ts`) shapes the choice:
  `object-src 'none'` blocks `<object>` / `<embed>` embeds, there is no `worker-src` so workers fall
  back to `script-src 'self'` (+ asset origin), and there is no `wasm-unsafe-eval`.
  - **pdf.js core (`pdfjs-dist`, Apache-2.0, Mozilla)** — the recommended fit. Use the document API
    only (not the bundled viewer UI): render each page to a canvas in the shadow root, all pages in
    a scrolling fit-to-width column; add the text layer later if selection / find matter. Fetches
    over XHR (connect-src self covers it; range requests keep large files cheap). Costs ~1 MB of JS
    and a worker file that tsup / Vite must emit as its own same-origin chunk. Recent versions
    decode JPX (JPEG 2000) and ICC via wasm with a JS fallback shipped alongside — verify the
    fallback actually engages under our CSP, since scanned PDFs commonly use JPX.
  - **Same-origin `<iframe>` to the `pdf-preview` route** — zero client code, allowed today
    (frame-src falls back to default-src self); uses the browser's built-in viewer. No theming,
    browser-specific print/download chrome, and iOS Safari historically shows only the first page in
    a frame. Fine as a v0 while the component is built; only needs inline Content-Disposition.
  - **Server-side rasterization reusing `<image-preview>`** (poppler `pdftoppm` or pdf.js in Node →
    PNG per page through the existing image route). No client bundle, perfect CSP fit, but adds a
    server dependency, per-page caching and pagination UI. Only worth it if we also want thumbnails
    for listings.
  - **PDFium via wasm (`@embedpdf/pdfium`, MIT; EmbedPDF viewer on top)** — better fidelity on nasty
    PDFs, but 4–5 MB of wasm and a CSP change. Overkill for a preview.
  - Not a fit: `react-pdf`, `@react-pdf-viewer`, `vue-pdf`, `ngx-extended-pdf-viewer` (framework
    wrappers around pdf.js); mupdf.js (AGPL); PSPDFKit / Apryse / PDF.js Express (commercial).
- Recommendation: build `@stillpointlab/pdf-editor` on pdf.js core, canvas-only first; ship the
  iframe route first if something is needed in front of users quickly.
- Open checks before briefing: (1) can tsup emit the pdf.js worker as its own chunk under the
  current package config; (2) what pdf.js does under our CSP when it hits a JPX image.
- Written when the editors were Context Manager submodules: here it is a format package beside
  image (`packages/formats/pdf`), and the CSP checks are still Context Manager's, as the host.
- Moved from Context Manager's backlog pool, 2026-11-10.
