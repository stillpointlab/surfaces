// The one range of a file a `Range` header asks for: what a media element sends
// to seek, and a streaming library to fetch a segment kept inside a larger file.

/** The first and last byte of a range, both counted from 0 and both in it. */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * What a `Range` header asks of a file of `size` bytes: one range (`bytes=a-b`,
 * `bytes=a-`, the last `n` as `bytes=-n`), cut to the file's end;
 * `'unsatisfiable'` for one that starts at or past the end (and any, of an empty
 * file); or `null` to send the whole file, as if no range were asked: no header,
 * one that does not parse (`bytes=5-2` among them), or several ranges, since an
 * answer in parts is more than a media element or a streaming library asks for.
 */
export function rangeOf(header: string | null, size: number): ByteRange | 'unsatisfiable' | null {
  if (header === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (match === null) return null;
  const [, first, last] = match;
  if (first === '') {
    if (last === '') return null;
    const length = Number(last);
    if (length === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(first);
  if (last !== '' && Number(last) < start) return null;
  if (start >= size) return 'unsatisfiable';
  return { start, end: last === '' ? size - 1 : Math.min(Number(last), size - 1) };
}
