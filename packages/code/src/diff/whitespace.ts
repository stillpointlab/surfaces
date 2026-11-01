// Helper for the "ignore whitespace" diff mode. CodeMirror's MergeView has no
// built-in whitespace-insensitive option, but its `diffConfig.override` lets us
// supply a custom diff. We diff a whitespace-stripped copy of each side, then map
// the resulting offsets back onto the original text (see code-diff.ts).

// Intra-line whitespace removed when comparing. Newlines are KEPT so line structure
// — which MergeView aligns the two sides on — is preserved; only whitespace within
// lines (indentation, spacing) is ignored.
const STRIP = new Set([' ', '\t', '\r', '\f', '\v']);

export interface StrippedText {
  /** The text with intra-line whitespace removed. */
  norm: string;
  /**
   * Maps each index in `norm` to its index in the original string, with
   * `map[norm.length] === original.length`, so a diff computed over `norm` can be
   * translated back to original-text offsets.
   */
  map: number[];
}

/** Remove intra-line whitespace from `s`, keeping a normalized→original index map. */
export function stripInlineWhitespace(s: string): StrippedText {
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (STRIP.has(ch)) continue;
    norm += ch;
    map.push(i);
  }
  // Anchor the end so a change ending at norm's end maps to the original's end.
  map.push(s.length);
  return { norm, map };
}
