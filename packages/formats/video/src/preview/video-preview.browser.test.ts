// What jsdom cannot show: the browser itself loads the clip, plays it, seeks in
// it, fails to load it, or plays the sound of one whose picture it cannot show.
// Nothing is dispatched by hand, and each test waits for the element's ready
// signal or the player's own event, never for a time. The clips are files of
// this package; the README has the command that made each.
import { setErrorHandler } from '@stillpointlab/common-format';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './video-preview';

import type { VideoPreview } from './video-preview';

// 4 s of a test picture, 64×36, and a 440 Hz tone: VP9 and Opus in WebM.
const clip = new URL('../../dev/media/clip.webm', import.meta.url).href;
// Theora and Vorbis in Matroska: both browsers play the sound and have no
// decoder for the picture.
const noPicture = new URL('../../dev/media/no-picture.mkv', import.meta.url).href;
// Bytes of noise under a video ending: it arrives, and nothing decodes it.
const noise = new URL('../../dev/media/noise.mp4', import.meta.url).href;

const create = (): VideoPreview => document.createElement('video-preview') as VideoPreview;
const mediaOf = (el: VideoPreview) => el.shadowRoot!.querySelector('video');
const statusOf = (el: VideoPreview) => el.shadowRoot!.querySelector('.spl-status');
const noteOf = (el: VideoPreview) => el.shadowRoot!.querySelector('.video-preview__note');

/** Resolves on the first `type` from `media` for which `when` holds. */
function eventOf(media: HTMLMediaElement, type: string, when: () => boolean): Promise<void> {
  return new Promise((done) => {
    const heard = () => {
      if (!when()) return;
      media.removeEventListener(type, heard);
      done();
    };
    media.addEventListener(type, heard);
  });
}

async function loaded(src: string, name: string): Promise<VideoPreview> {
  const el = create();
  el.setSource(src, name);
  document.body.append(el);
  await el.whenReady();
  return el;
}

describe('video-preview in a browser', () => {
  afterEach(() => {
    document.body.replaceChildren();
    setErrorHandler(null);
  });

  it('loads a clip and knows its length and its picture, without playing it', async () => {
    const el = await loaded(clip, 'clip.webm');

    const media = mediaOf(el)!;
    expect(media.duration).toBeCloseTo(4, 0);
    expect([media.videoWidth, media.videoHeight]).toEqual([64, 36]);
    expect(media.paused).toBe(true);
    expect(media.currentTime).toBe(0);
    expect(el.shadowRoot!.querySelector('.video-preview__loading')).toBeNull();
    expect(noteOf(el)).toBeNull();
  });

  it('plays, and its time moves', async () => {
    const media = mediaOf(await loaded(clip, 'clip.webm'))!;

    const moved = eventOf(media, 'timeupdate', () => media.currentTime > 0.2);
    await media.play();
    await moved;

    expect(media.paused).toBe(false);
    expect(media.currentTime).toBeGreaterThan(0.2);
  });

  it('seeks', async () => {
    const media = mediaOf(await loaded(clip, 'clip.webm'))!;

    const sought = eventOf(media, 'seeked', () => true);
    media.currentTime = 3;
    await sought;

    expect(media.currentTime).toBeCloseTo(3, 1);
  });

  it('says a picture it cannot show above the player, and plays the sound', async () => {
    const el = await loaded(noPicture, 'no-picture.mkv');

    const media = mediaOf(el)!;
    expect(media.videoWidth).toBe(0);
    expect(noteOf(el)?.textContent).toBe(
      "This browser can't show this video's picture. Its sound plays."
    );
    expect(statusOf(el)).toBeNull();

    const moved = eventOf(media, 'timeupdate', () => media.currentTime > 0.2);
    await media.play();
    await moved;
    expect(media.currentTime).toBeGreaterThan(0.2);
  });

  it('says a file of noise is one it cannot play, and reports it once', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const el = await loaded(noise, 'noise.mp4');

    expect(statusOf(el)?.textContent).toBe("This browser can't play this video.");
    expect(mediaOf(el)).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('Video preview failed to load', { src: noise });
  });
});
