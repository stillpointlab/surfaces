// The `./worker` entry: pdf.js's worker, which starts itself on the global it
// runs in (`WorkerMessageHandler.initializeFromPort(self)`). The page starts it
// with `startWorker()` and hands it to pdf.js as the port of a `PDFWorker`.
//
// It is the copy of pdf.js's worker that tooling/gen-pdfjs.ts writes beside
// this file, with one line changed so a decoder's JavaScript fallback is asked
// of `fallbacks.ts` first. Both are imported for their effect alone, so the
// package's `sideEffects` lists them: a bundler would drop them otherwise, and
// the worker would be empty. The package's build leaves the copy as a file of
// its own beside `dist/worker.js` (see tsup.config.ts), for a host's build to
// make the worker of.
import './fallbacks';
import './pdfjs/pdf.worker.mjs';
