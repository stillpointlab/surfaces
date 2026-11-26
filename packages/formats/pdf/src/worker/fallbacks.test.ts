// The worker's answer to the copy of pdf.js's worker, which asks it for a
// decoder fallback's address before it imports one.
import { describe, expect, it } from 'vitest';

import { fallbackUrl } from './fallbacks';

describe('fallbackUrl', () => {
  it('names the two fallbacks beside this module', () => {
    expect(fallbackUrl('openjpeg_nowasm_fallback.js')).toBe(
      new URL('./pdfjs/openjpeg_nowasm_fallback.js', import.meta.url).href
    );
    expect(fallbackUrl('jbig2_nowasm_fallback.js')).toBe(
      new URL('./pdfjs/jbig2_nowasm_fallback.js', import.meta.url).href
    );
  });

  it('names nothing else, so pdf.js goes on to its own address', () => {
    expect(fallbackUrl('quickjs-eval.js')).toBeUndefined();
    expect(fallbackUrl('toString')).toBeUndefined();
  });

  it('is what the worker’s global answers', () => {
    const global = globalThis as { pdfjsFallbackUrl?: (name: string) => string | undefined };
    expect(global.pdfjsFallbackUrl).toBe(fallbackUrl);
  });
});
