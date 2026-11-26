// What the contract leaves to the format: the words for each state, the two
// failures told apart, the one report of a failure, which media is heard, the
// old source let go, and the pause on leaving the page. jsdom loads and plays no
// media, so each test says when the length is known or the load failed, and
// pausing and loading are watched rather than done.
import { setErrorHandler } from '@stillpointlab/common-format';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioPreview } from './audio-preview';

const create = (): AudioPreview => document.createElement('audio-preview') as AudioPreview;
const mediaOf = (el: AudioPreview) => el.shadowRoot!.querySelector('audio');
const statusOf = (el: AudioPreview) => el.shadowRoot!.querySelector('.spl-status');
const nameOf = (el: AudioPreview) => el.shadowRoot!.querySelector('.audio-preview__name');
const covered = (el: AudioPreview) =>
  el.shadowRoot!.querySelector('.audio-preview__loading') !== null;

/** The `<audio>` says it failed, with `code` as its `MediaError`'s (none in jsdom by itself). */
function failWith(media: HTMLAudioElement, code: number | null): void {
  Object.defineProperty(media, 'error', {
    value: code === null ? null : { code },
    configurable: true,
  });
  media.dispatchEvent(new Event('error'));
}

/** A tick for the microtask that pauses an element taken out of the page. */
const tick = () => new Promise<void>((done) => setTimeout(done, 0));

describe('audio-preview', () => {
  let pause: ReturnType<typeof vi.spyOn>;
  let load: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    document.body.replaceChildren();
    // The pause for leaving the page runs a microtask later, still stood in for.
    await tick();
    setErrorHandler(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('is defined by its module', () => {
    expect(customElements.get('audio-preview')).toBe(AudioPreview);
  });

  it('says there is nothing to show without a source', () => {
    const el = create();
    document.body.append(el);

    expect(statusOf(el)?.textContent).toBe('No audio selected.');
    expect(mediaOf(el)).toBeNull();
  });

  it('shows the name over a player labelled with it, covered until the length is known', async () => {
    const el = create();
    el.setSource('/files/tone.mp3', 'tone.mp3');
    document.body.append(el);

    const media = mediaOf(el)!;
    expect(nameOf(el)?.textContent).toBe('tone.mp3');
    expect(media.getAttribute('src')).toBe('/files/tone.mp3');
    expect(media.hasAttribute('controls')).toBe(true);
    expect(media.getAttribute('preload')).toBe('metadata');
    expect(media.getAttribute('aria-label')).toBe('tone.mp3');
    expect(covered(el)).toBe(true);
    expect(el.hasAttribute('ready')).toBe(false);

    // Neither a time nor any event but the length settles it.
    media.dispatchEvent(new Event('loadstart'));
    media.dispatchEvent(new Event('progress'));
    expect(el.hasAttribute('ready')).toBe(false);

    media.dispatchEvent(new Event('loadedmetadata'));
    await el.whenReady();
    expect(covered(el)).toBe(false);
    expect(mediaOf(el)).toBe(media);
  });

  it('does not start by itself', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
    const el = create();
    el.setSource('/files/tone.mp3', 'tone.mp3');
    document.body.append(el);
    mediaOf(el)!.dispatchEvent(new Event('loadedmetadata'));
    await el.whenReady();
    el.remove();
    document.body.append(el);
    await el.whenReady();

    expect(mediaOf(el)?.hasAttribute('autoplay')).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('says a file that did not arrive in the first sentence, in place of the player, and reports it once', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    // The browser's code cannot tell a missing file from noise, so the address is asked.
    const fetch = vi.fn(async () => new Response('{"ok":false}', { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    const el = create();
    el.setSource('/files/missing.mp3', 'missing.mp3');
    document.body.append(el);

    failWith(mediaOf(el)!, 4);
    await el.whenReady();

    expect(statusOf(el)?.textContent).toBe("Couldn't load this audio.");
    expect(statusOf(el)?.getAttribute('role')).toBe('alert');
    expect(nameOf(el)?.textContent).toBe('missing.mp3');
    expect(mediaOf(el)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('Audio preview failed to load', {
      src: '/files/missing.mp3',
    });
  });

  it('says a file that arrived and has no decoder in the second sentence', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array(8), { status: 200 }));
    const el = create();
    el.setSource('/files/noise.mp3', 'noise.mp3');
    document.body.append(el);

    failWith(mediaOf(el)!, 4);
    await el.whenReady();

    expect(statusOf(el)?.textContent).toBe("This browser can't play this audio.");
    expect(mediaOf(el)).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('takes a decode error and a network error at their word', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const decoded = create();
    decoded.setSource('/files/a.mp3', 'a.mp3');
    const dropped = create();
    dropped.setSource('/files/b.mp3', 'b.mp3');
    document.body.append(decoded, dropped);

    failWith(mediaOf(decoded)!, 3);
    failWith(mediaOf(dropped)!, 2);
    await Promise.all([decoded.whenReady(), dropped.whenReady()]);

    expect(statusOf(decoded)?.textContent).toBe("This browser can't play this audio.");
    expect(statusOf(dropped)?.textContent).toBe("Couldn't load this audio.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says a failure after the length was known, once, however often the player says it', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const el = create();
    el.setSource('/files/tone.mp3', 'tone.mp3');
    document.body.append(el);
    const media = mediaOf(el)!;
    media.dispatchEvent(new Event('loadedmetadata'));
    await el.whenReady();

    failWith(media, 2);
    failWith(media, 2);
    await el.whenReady();
    await tick();

    expect(statusOf(el)?.textContent).toBe("Couldn't load this audio.");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('lets the old source go for a new one, and hears only the new one', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const el = create();
    el.setSource('/files/first.mp3', 'first.mp3');
    document.body.append(el);
    const first = mediaOf(el)!;
    first.dispatchEvent(new Event('loadedmetadata'));
    await el.whenReady();
    pause.mockClear();
    load.mockClear();

    el.setSource('/files/second.mp3', 'second.mp3');
    const second = mediaOf(el)!;

    expect(second).not.toBe(first);
    // Paused, its source taken away, then loaded with none: it stops and stops arriving.
    expect(first.hasAttribute('src')).toBe(false);
    expect(pause.mock.contexts).toEqual([first]);
    expect(load.mock.contexts).toEqual([first]);
    expect(pause.mock.invocationCallOrder[0]).toBeLessThan(load.mock.invocationCallOrder[0]);

    // What the one let go says late is about a source no longer shown.
    failWith(first, 2);
    first.dispatchEvent(new Event('loadedmetadata'));
    await tick();
    expect(handler).not.toHaveBeenCalled();
    expect(el.hasAttribute('ready')).toBe(false);

    second.dispatchEvent(new Event('loadedmetadata'));
    await el.whenReady();
    expect(mediaOf(el)?.getAttribute('src')).toBe('/files/second.mp3');
  });

  it('lets the source go when it is taken away', async () => {
    const el = create();
    el.setSource('/files/tone.mp3', 'tone.mp3');
    document.body.append(el);
    const media = mediaOf(el)!;
    pause.mockClear();

    el.setSource('');
    await el.whenReady();

    expect(pause.mock.contexts).toEqual([media]);
    expect(media.hasAttribute('src')).toBe(false);
    expect(mediaOf(el)).toBeNull();
    expect(statusOf(el)?.textContent).toBe('No audio selected.');
  });

  it('relabels the player for a new name, without loading again', async () => {
    const el = create();
    el.setSource('/files/tone.mp3', 'old name');
    document.body.append(el);
    mediaOf(el)!.dispatchEvent(new Event('loadedmetadata'));
    await el.whenReady();
    const media = mediaOf(el);
    load.mockClear();

    el.setSource('/files/tone.mp3', 'new name');

    expect(mediaOf(el)).toBe(media);
    expect(media?.getAttribute('aria-label')).toBe('new name');
    expect(nameOf(el)?.textContent).toBe('new name');
    expect(load).not.toHaveBeenCalled();
    expect(el.hasAttribute('ready')).toBe(true);
  });

  it('pauses when it leaves the page, and is the same player, unpaused by nothing, when put back', async () => {
    const el = create();
    el.setSource('/files/tone.mp3', 'tone.mp3');
    document.body.append(el);
    const media = mediaOf(el)!;
    media.dispatchEvent(new Event('loadedmetadata'));
    await el.whenReady();
    pause.mockClear();

    el.remove();
    expect(el.hasAttribute('ready')).toBe(false);
    await tick();
    expect(pause.mock.contexts).toEqual([media]);

    document.body.append(el);
    await el.whenReady();
    expect(mediaOf(el)).toBe(media);
    expect(media.getAttribute('src')).toBe('/files/tone.mp3');
  });

  it('does not pause for a move, out of the page and back in one task', async () => {
    const el = create();
    el.setSource('/files/tone.mp3', 'tone.mp3');
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    first.append(el);
    mediaOf(el)!.dispatchEvent(new Event('loadedmetadata'));
    await el.whenReady();
    pause.mockClear();

    second.append(el);
    await tick();

    expect(pause).not.toHaveBeenCalled();
    await el.whenReady();
  });
});
