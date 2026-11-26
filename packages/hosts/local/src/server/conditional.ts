// The raw route's validator, and the two questions a browser asks with it: "has
// it changed since the copy I kept?" (`If-None-Match`) and "is the range I ask
// for still of the file I have the rest of?" (`If-Range`). With them the browser
// may keep what a player has played and ask again, rather than download it again.

/**
 * A file's entity tag, from the `stat` the raw route already reads for its size:
 * its size and the time it was last written, to the nanosecond. A write through
 * the port (a temporary file renamed over it) or any editor's changes the time;
 * the same bytes written again change it too, which only costs a download.
 */
export function validatorOf(stat: { size: bigint; mtimeNs: bigint }): string {
  return `"${stat.size.toString(16)}-${stat.mtimeNs.toString(16)}"`;
}

/**
 * Whether an `If-None-Match` header names `etag`, so the browser's copy is the
 * file's (answered `304`). `*` names any file there is. The comparison is the
 * weak one the header asks for: a `W/` before a tag is set aside.
 */
export function noneMatch(header: string | null, etag: string): boolean {
  if (header === null) return false;
  if (header.trim() === '*') return true;
  return header.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag);
}

/**
 * Whether a `Range` may be answered as asked under `If-Range`: no such header,
 * or one equal to the file's entity tag. A date never is (the route sends no
 * `Last-Modified`), nor a weak tag; then the whole file is sent, so the part a
 * browser asks for is never laid beside parts of another file.
 */
export function rangeStillValid(ifRange: string | null, etag: string): boolean {
  return ifRange === null || ifRange.trim() === etag;
}
