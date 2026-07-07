type Level = 'info' | 'warn' | 'error';
type ErrorReporter = (message: string, err?: unknown) => void;
type Reporter = (message: string, opts?: { level?: Level }) => void;

let errorReporter: ErrorReporter = (message, err) => console.error(message, err);
let reporter: Reporter = (message, opts) => {
  if (opts?.level === 'error') console.error(message);
  else if (opts?.level === 'warn') console.warn(message);
  else console.info(message);
};

export function setErrorHandler(handler: ErrorReporter): void {
  errorReporter = handler;
}

export function setReporter(handler: Reporter): void {
  reporter = handler;
}

export function reportError(message: string, err?: unknown): void {
  errorReporter(message, err);
}

export function report(message: string, opts?: { level?: Level }): void {
  reporter(message, opts);
}
