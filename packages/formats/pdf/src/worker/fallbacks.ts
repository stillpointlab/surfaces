// Where each WebAssembly decoder's JavaScript fallback is, for the copy of
// pdf.js's worker that asks `globalThis.pdfjsFallbackUrl(name)` before it
// imports one (tooling/gen-pdfjs.ts). WebAssembly is off (`useWasm: false`):
// neither host's policy lets the worker compile it, so these are what draw a
// scan's images. One `new URL('<literal>', import.meta.url)` each, so every
// build between the source and the page (the package's, a host's Vite, the
// local host's development mode) finds the file and gives the address it ends
// up at.

/** The fallbacks by the name pdf.js asks for: JPEG 2000, and JBIG2 with CCITT fax. */
const FALLBACKS: Readonly<Record<string, () => string>> = {
  'openjpeg_nowasm_fallback.js': () =>
    new URL('./pdfjs/openjpeg_nowasm_fallback.js', import.meta.url).href,
  'jbig2_nowasm_fallback.js': () =>
    new URL('./pdfjs/jbig2_nowasm_fallback.js', import.meta.url).href,
};

/**
 * The address of the fallback named `name`; undefined for any other name, so
 * pdf.js goes on to its own (a folder no host has, and the image stays blank).
 */
export function fallbackUrl(name: string): string | undefined {
  return Object.hasOwn(FALLBACKS, name) ? FALLBACKS[name]() : undefined;
}

(globalThis as { pdfjsFallbackUrl?: (name: string) => string | undefined }).pdfjsFallbackUrl =
  fallbackUrl;
