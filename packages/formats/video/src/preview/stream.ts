// What `<video-preview>` asks of an engine that plays a stream through its
// `<video>`. Inside the package and not exported from it: hls.js stands behind it
// now, and an engine for MPEG-DASH or a live source would stand behind it later.
// It has no member the one engine does not use.

import type { MediaFailure } from '@stillpointlab/common-format';

/** One stream played through one `<video>`. */
export interface StreamEngine {
  /**
   * Play the playlist at `src` through `media`, which has no source of its own.
   * A failure it cannot recover from is told to `failed`, as one of the
   * element's two: a playlist or segment that did not arrive is `load`, a stream
   * with nothing the browser can decode is `decode`.
   */
  attach(media: HTMLVideoElement, src: string, failed: (failure: MediaFailure) => void): void;
  /** Let go: stop loading, and leave the media with no source. */
  release(): void;
}

/**
 * A new engine, or null where none can run in this browser (no Media Source
 * Extensions). The element then gives the playlist's address to the `<video>`
 * itself, for a browser that plays the stream on its own.
 */
export type StartEngine = () => StreamEngine | null;

/**
 * Whether `src` names an HLS playlist, by the ending of the address's path: a
 * query (the local host's `?rev=`) or a fragment does not hide it, and the
 * ending is read in any case, as a format's `opens` is.
 */
export function isPlaylist(src: string): boolean {
  let path: string;
  try {
    path = new URL(src, document.baseURI).pathname;
  } catch {
    return false;
  }
  return path.toLowerCase().endsWith('.m3u8');
}
