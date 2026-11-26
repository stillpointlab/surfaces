// What a preview over an `<audio>` or a `<video>` needs that is not its own:
// which of its two failures a media element met, and letting a media element go.
// The audio and video previews are alike in everything but the tag they hold,
// and each is written on these two. Controls of their own are not here.

/**
 * Why a media element failed: its file did not arrive (`load`), or it arrived
 * and the browser has no decoder for it (`decode`).
 */
export type MediaFailure = 'load' | 'decode';

// `MediaError`'s codes, by number: jsdom, where the elements' tests run, has no
// `MediaError` to name them by.
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

/**
 * Which of the two failures `media` met, once its `error` event has fired.
 *
 * `MediaError.code` says it only sometimes. A network failure part way through
 * is `MEDIA_ERR_NETWORK` and a bad frame while playing is `MEDIA_ERR_DECODE`,
 * but a source that never played is `MEDIA_ERR_SRC_NOT_SUPPORTED` in Chromium
 * and Firefox alike, whether the server answered 404 or sent bytes no decoder
 * reads (only the browsers' own messages differ, and those are not a contract).
 * So for that code the address is asked once, by itself: an answer that is not
 * a success, or no answer, is `load`; a success is the bytes having arrived,
 * so `decode`. The answer's body is let go unread, and the browser's cache is
 * neither read nor filled by it.
 */
export async function mediaFailureOf(media: HTMLMediaElement): Promise<MediaFailure> {
  const code = media.error?.code;
  if (code === MEDIA_ERR_DECODE) return 'decode';
  if (code !== MEDIA_ERR_SRC_NOT_SUPPORTED) return 'load';
  const src = media.currentSrc || media.getAttribute('src') || '';
  if (!src) return 'load';
  try {
    const response = await fetch(src, { cache: 'no-store' });
    void response.body?.cancel().catch(() => undefined);
    return response.ok ? 'decode' : 'load';
  } catch {
    return 'load';
  }
}

/**
 * Let a media element go: it stops sounding and stops arriving. Pausing alone
 * leaves its download running; taking its source away and loading nothing ends
 * that, and leaves it empty.
 */
export function releaseMedia(media: HTMLMediaElement): void {
  media.pause();
  media.removeAttribute('src');
  media.load();
}
