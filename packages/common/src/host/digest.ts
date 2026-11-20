// A short, stable digest of a text, for the memory port's versions and the
// runner's revisions: two 53-bit hashes (cyrb53, with two seeds) as hex. Not a
// cryptographic hash: a version only has to tell one text from another, and
// this code may load nothing beyond plain JavaScript.

function hash53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ unit, 2654435761);
    h2 = Math.imul(h2 ^ unit, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** The text's digest: 28 hex digits, equal for equal texts. */
export function digest(text: string): string {
  return [0, 1].map((seed) => hash53(text, seed).toString(16).padStart(14, '0')).join('');
}
