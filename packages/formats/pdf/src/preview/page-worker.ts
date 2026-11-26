// The page's one worker for pdf.js, started when the first PDF opens and shared
// by every `<pdf-preview>` after. Here, in a module the preview's element
// imports statically, so `startWorker()` is built into the preview entry's own
// file (see "Workers" in the root README).

import { startWorker } from '../worker/start';

/** The worker, and a promise that rejects if it fails to load. */
export interface PageWorker {
  readonly worker: Worker;
  readonly failed: Promise<never>;
}

let current: (PageWorker & { dead: boolean }) | null = null;

/**
 * The page's worker, started now if there is none or the last one failed to
 * load: a worker that did not arrive is tried again by the next PDF, as a
 * failed import is.
 *
 * Handed a port, pdf.js never hears that the worker failed to load: it sends
 * its request and waits for ever. So the worker's `error` is heard here, until
 * the worker's first message (pdf.js's worker says "ready" as soon as it has
 * started); after that an error is pdf.js's to report, as pdf.js does for a
 * worker it starts itself. Throws where there is no `Worker` (jsdom).
 */
export function pageWorker(): PageWorker {
  if (current && !current.dead) return current;
  const worker = startWorker();
  let started = false;
  let fail: (error: Error) => void = () => undefined;
  const failed = new Promise<never>((_resolve, reject) => {
    fail = reject;
  });
  // Raced against each document's loading: one that settled first leaves this unheard.
  failed.catch(() => undefined);
  const entry = { worker, failed, dead: false };
  worker.addEventListener('message', () => (started = true), { once: true });
  worker.addEventListener('error', (event) => {
    if (started || entry.dead) return;
    entry.dead = true;
    worker.terminate();
    const message = event instanceof ErrorEvent && event.message ? `: ${event.message}` : '';
    fail(new Error(`The PDF worker failed to load${message}`));
  });
  current = entry;
  return entry;
}
