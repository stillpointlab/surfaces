// The HLS engine: hls.js behind `StreamEngine`. The element imports this module
// with `import()` the first time it is given a playlist, so hls.js is a file of
// its own in every build and loads for a playlist alone, never for a file.

import Hls, { ErrorDetails, ErrorTypes, type ErrorData } from 'hls.js';

import type { StartEngine, StreamEngine } from './stream';
import type { MediaFailure } from '@stillpointlab/common-format';

/**
 * Network errors that are about what arrived, not about its arriving: a playlist
 * that came and does not parse, or names no segment.
 */
const ARRIVED = new Set<string>([
  ErrorDetails.MANIFEST_PARSING_ERROR,
  ErrorDetails.LEVEL_PARSING_ERROR,
  ErrorDetails.LEVEL_EMPTY_ERROR,
]);

/**
 * Media errors that say the stream has nothing this browser decodes. Recovering
 * would load the same codecs into a new source and hear nothing more of them.
 */
const UNDECODABLE = new Set<string>([
  ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR,
  ErrorDetails.BUFFER_INCOMPATIBLE_CODECS_ERROR,
]);

/** Which of the element's two failures a fatal error of hls.js's is. */
function failureOf(data: ErrorData): MediaFailure {
  return data.type === ErrorTypes.NETWORK_ERROR && !ARRIVED.has(data.details) ? 'load' : 'decode';
}

/**
 * A request the server refused (`4xx`): a file the folder does not have. hls.js
 * does not retry such an answer, but for a segment of a stream with no other
 * level it asks again with a growing wait, and gives up some 30 s later
 * (measured: 31.7 s in Chromium 158). The element says so at once.
 */
function refused(data: ErrorData): boolean {
  const code = data.response?.code ?? 0;
  return data.type === ErrorTypes.NETWORK_ERROR && code >= 400 && code < 500;
}

/**
 * hls.js feeding one `<video>` through Media Source Extensions. No worker
 * (`enableWorker: false`): the host's policy refuses a `blob:` worker, and hls.js
 * runs on the page's own thread without one.
 *
 * hls.js retries what it can by itself, and says `fatal` when it has given up. A
 * fatal media error is recovered once, with `recoverMediaError()` (the source
 * rebuilt and the media attached again, where it was), unless it says no codec
 * of the stream can be decoded; a second is a failure. Every other fatal error
 * is a failure at once, and so is a file the server refused.
 */
class HlsEngine implements StreamEngine {
  private hls: Hls | null = null;

  attach(media: HTMLVideoElement, src: string, failed: (failure: MediaFailure) => void): void {
    const hls = new Hls({ enableWorker: false });
    this.hls = hls;
    let recovered = false;
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (this.hls !== hls) return;
      if (!data.fatal && !refused(data)) return;
      if (data.type === ErrorTypes.MEDIA_ERROR && !recovered && !UNDECODABLE.has(data.details)) {
        recovered = true;
        hls.recoverMediaError();
        return;
      }
      // A fatal error has stopped loading already; a refusal would ask again.
      hls.stopLoad();
      failed(failureOf(data));
    });
    hls.loadSource(src);
    hls.attachMedia(media);
  }

  release(): void {
    this.hls?.destroy();
    this.hls = null;
  }
}

/** hls.js where it can run here: wherever the browser has Media Source Extensions. */
export const startHls: StartEngine = () => (Hls.isSupported() ? new HlsEngine() : null);
