// Which of the element's three failures a document met, told from the error
// pdf.js gives for it. pdf.js passes its errors from the worker by name, so
// they are told apart by name, and this module imports nothing of pdf.js.

/**
 * The file, the worker or pdf.js itself did not arrive (`load`); it arrived and
 * is not a PDF pdf.js can read (`read`); or it asks for a password (`password`).
 */
export type PdfFailure = 'load' | 'read' | 'password';

/**
 * - `PasswordException`: the document is encrypted with a password to open it
 *   (pdf.js asks `onPassword` first; the element gives none).
 * - `InvalidPDFException`: the bytes arrived and are not a PDF, or are empty.
 * - `UnknownErrorException`: anything else the worker met. When it carries a
 *   `TypeError` (`details`) it is a fetch that failed, the network's (Chromium:
 *   "Failed to fetch"; Firefox: "NetworkError when attempting to fetch
 *   resource."), so the file did not arrive; otherwise the worker could not
 *   read what did.
 * - `ResponseException` (the server's answer was not a success: a missing
 *   file), and every error that is not pdf.js's (the worker that failed to
 *   load, an import that did not arrive): the file did not arrive.
 */
export function failureOf(error: unknown): PdfFailure {
  const { name, details } = (error ?? {}) as { name?: unknown; details?: unknown };
  if (name === 'PasswordException') return 'password';
  if (name === 'InvalidPDFException') return 'read';
  if (name === 'UnknownErrorException') {
    return typeof details === 'string' && /^TypeError\b/.test(details) ? 'load' : 'read';
  }
  return 'load';
}
