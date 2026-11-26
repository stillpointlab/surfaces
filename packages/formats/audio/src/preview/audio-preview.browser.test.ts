// What jsdom cannot show: the browser itself loads the clip, plays it, seeks in
// it, or fails to load it. Nothing is dispatched by hand, and each test waits for
// the element's ready signal or the player's own event, never for a time. The
// clips are files of this package; the README has the command that made each.
import { setErrorHandler } from '@stillpointlab/common-format';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './audio-preview';

import type { AudioPreview } from './audio-preview';

// 4 s of a 440 Hz tone, MP3.
const tone = new URL('../../dev/media/tone.mp3', import.meta.url).href;
// Bytes of noise under an audio ending: it arrives, and nothing decodes it.
const noise = new URL('../../dev/media/noise.mp3', import.meta.url).href;

const create = (): AudioPreview => document.createElement('audio-preview') as AudioPreview;
const mediaOf = (el: AudioPreview) => el.shadowRoot!.querySelector('audio');
const statusOf = (el: AudioPreview) => el.shadowRoot!.querySelector('.spl-status');

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

async function loaded(src: string, name: string): Promise<AudioPreview> {
  const el = create();
  el.setSource(src, name);
  document.body.append(el);
  await el.whenReady();
  return el;
}

describe('audio-preview in a browser', () => {
  afterEach(() => {
    document.body.replaceChildren();
    setErrorHandler(null);
  });

  it('loads a clip and knows its length, without playing it', async () => {
    const el = await loaded(tone, 'tone.mp3');

    const media = mediaOf(el)!;
    expect(media.duration).toBeCloseTo(4, 0);
    expect(media.paused).toBe(true);
    expect(media.currentTime).toBe(0);
    expect(el.shadowRoot!.querySelector('.audio-preview__loading')).toBeNull();
  });

  it('plays, and its time moves', async () => {
    const media = mediaOf(await loaded(tone, 'tone.mp3'))!;

    const moved = eventOf(media, 'timeupdate', () => media.currentTime > 0.2);
    await media.play();
    await moved;

    expect(media.paused).toBe(false);
    expect(media.currentTime).toBeGreaterThan(0.2);
  });

  it('seeks', async () => {
    const media = mediaOf(await loaded(tone, 'tone.mp3'))!;

    const sought = eventOf(media, 'seeked', () => true);
    media.currentTime = 3;
    await sought;

    expect(media.currentTime).toBeCloseTo(3, 1);
  });

  it('says a file of noise is one it cannot play, and reports it once', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const el = await loaded(noise, 'noise.mp3');

    expect(statusOf(el)?.textContent).toBe("This browser can't play this audio.");
    expect(mediaOf(el)).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('Audio preview failed to load', { src: noise });
  });

  it('says a missing file did not load, and reports it once', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const missing = new URL('no-such-file.mp3', tone).href;
    const el = await loaded(missing, 'no-such-file.mp3');

    expect(statusOf(el)?.textContent).toBe("Couldn't load this audio.");
    expect(mediaOf(el)).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('Audio preview failed to load', { src: missing });
  });
});
