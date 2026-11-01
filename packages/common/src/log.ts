// Lightweight, injectable logging so a surface never depends on a host logging
// facility. Defaults to the console; a host routes messages to its own reporter
// with setErrorHandler / setReporter. One module instance serves every format
// (this package is external to their builds), so the host configures it once.

export type Level = 'info' | 'warn' | 'error';
export type ErrorHandler = (message: string, err?: unknown) => void;
export type Reporter = (message: string, opts?: { level?: Level }) => void;

let errorHandler: ErrorHandler | null = null;
let reporter: Reporter | null = null;

/** Route errors to the host; `null` restores the console default. */
export function setErrorHandler(handler: ErrorHandler | null): void {
  errorHandler = handler;
}

/** Route reports to the host; `null` restores the console default. */
export function setReporter(handler: Reporter | null): void {
  reporter = handler;
}

export function reportError(message: string, err?: unknown): void {
  if (errorHandler) errorHandler(message, err);
  else console.error(message, err);
}

export function report(message: string, opts?: { level?: Level }): void {
  if (reporter) {
    reporter(message, opts);
    return;
  }
  if (opts?.level === 'error') console.error(message);
  else if (opts?.level === 'warn') console.warn(message);
  else console.info(message);
}
