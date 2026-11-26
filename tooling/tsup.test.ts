// The shared build's worker guard: a split file in `dist/chunks/` may not name
// `./worker.js`, since from there it is not the package's worker; an entry's own
// file may. Proved in builds by hand (the worker spec's proof); held here.
import { describe, expect, it } from 'vitest';

import { WORKER_ADDRESS, workerAddressInEntries } from './tsup';

const START = "new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });";

/** The guard as tsup calls it on one written file. */
function render(path: string, code: string): unknown {
  // The guard reads only the file's path and code, not tsup's context.
  return workerAddressInEntries.renderChunk?.call(undefined as never, code, {
    type: 'chunk',
    code,
    path,
  });
}

describe('workerAddressInEntries', () => {
  it('fails a file in dist/chunks/ that names ./worker.js', () => {
    const path = '/repo/packages/formats/pdf/dist/chunks/start-3PUWD2KM.js';
    expect(() => render(path, START)).toThrow(
      `${path} names ./worker.js, which from dist/chunks/ is not the package's worker: ` +
        'start the worker in a module one entry imports, statically.'
    );
  });

  it('fails a chunk under a Windows path too', () => {
    expect(() => render('C:\\repo\\dist\\chunks\\start-3PUWD2KM.js', START)).toThrow(
      /names \.\/worker\.js/
    );
  });

  it("passes the same address in an entry's own file", () => {
    expect(render('/repo/packages/formats/pdf/dist/preview.js', START)).toBeUndefined();
  });

  it('passes a chunk that does not name the worker', () => {
    const code = "export const other = new URL('./other.js', import.meta.url);";
    expect(render('/repo/packages/formats/pdf/dist/chunks/chunk-7LUM2E7C.js', code)).toBe(
      undefined
    );
  });
});

describe('WORKER_ADDRESS', () => {
  it.each([
    ['single quotes', "new URL('./worker.js', import.meta.url)"],
    ['double quotes', 'new URL("./worker.js", import.meta.url)'],
    ['backticks', 'new URL(`./worker.js`, import.meta.url)'],
    ['no spaces', 'new URL("./worker.js",import.meta.url)'],
    ['odd spacing', 'new URL(  "./worker.js"  ,\n    import.meta.url\n)'],
  ])('finds the address in %s', (_, code) => {
    expect(WORKER_ADDRESS.test(code)).toBe(true);
  });

  it.each([
    ['another file', "new URL('./other.js', import.meta.url)"],
    ['a worker in another folder', "new URL('../worker.js', import.meta.url)"],
    ['another base', "new URL('./worker.js', location.href)"],
  ])('does not take %s', (_, code) => {
    expect(WORKER_ADDRESS.test(code)).toBe(false);
  });
});
