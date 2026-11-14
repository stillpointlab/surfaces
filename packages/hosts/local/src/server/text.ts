// What the host counts as text: UTF-8 without NUL bytes. The port reads a file by
// this rule, and git's module reads a file's last committed bytes by it.

/** The bytes as text, or `null` when they are not (a NUL byte, or not UTF-8). */
export function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    // `ignoreBOM` keeps a byte order mark in the text, so a write gives it back.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}
