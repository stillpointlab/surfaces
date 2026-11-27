// Starts the format's worker: the one expression every build between the source
// and the page follows to `./worker.js` (see "Workers" in the root README). The
// preview's element imports this module statically, so it is built into
// `dist/preview.js`, beside `dist/worker.js`.
export function startWorker(): Worker {
  return new Worker(new URL('./worker.js', import.meta.url), {
    type: 'module',
    name: 'pdf-worker',
  });
}
