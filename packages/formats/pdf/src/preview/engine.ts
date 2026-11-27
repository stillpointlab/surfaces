// pdf.js's document API: the element imports this module with `import()` (through
// `createLazyLoader`) when a PDF opens, so pdf.js's main module is a file of its
// own in every build and a file that is not a PDF never loads it. What the
// element and its page column use of pdf.js's classes comes from here too.

import { getDocument, PDFWorker } from 'pdfjs-dist';

import type { PackageFiles } from './files';
import type { PDFDocumentLoadingTask } from 'pdfjs-dist';

/**
 * pdf.js's text layer: a page's text as transparent spans over its canvas, each
 * placed by an inline style. The page column is handed it from here, so pdf.js's
 * main module stays behind this module's `import()`.
 */
export { TextLayer } from 'pdfjs-dist';

/**
 * Open the PDF at `url` in the page's worker, as pdf.js loads a file by default
 * (a first request, then ranges and a stream). `files` answers pdf.js for the
 * files it fetches by name; it comes from the element's entry, where its
 * addresses are right.
 *
 * - The worker is pdf.js's by its port, in a `PDFWorker` pdf.js keeps for that
 *   port, and given to each document, so destroying a document never touches
 *   the worker another is using.
 * - `useWasm: false`: neither host's policy lets the worker compile
 *   WebAssembly, so pdf.js never tries; the decoders' JavaScript fallbacks draw
 *   the same pictures, slower.
 * - `useWorkerFetch: false`, with the package's own `BinaryDataFactory`.
 * - Every other option as pdf.js has it.
 */
export function openPdf(
  url: string,
  worker: Worker,
  files: typeof PackageFiles
): PDFDocumentLoadingTask {
  return getDocument({
    url,
    worker: PDFWorker.create({ port: worker, name: 'pdf-worker' }),
    useWasm: false,
    useWorkerFetch: false,
    BinaryDataFactory: files,
  });
}
