// What the contract leaves to the format: the words for each state, the two
// failures told apart, the one report of a failure, the note for a picture of no
// size, which media is heard, the old source let go, and the pause on leaving the
// page. jsdom loads and plays no media, so each test says when the length is
// known (and how wide the picture is) or the load failed, and pausing and
// loading are watched rather than done.
import { setErrorHandler } from '@stillpointlab/common-format';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VideoPreview } from './video-preview';

const NO_PICTURE = "This browser can't show this video's picture. Its sound plays.";

const create = (): VideoPreview => document.createElement('video-preview') as VideoPreview;
const mediaOf = (el: VideoPreview) => el.shadowRoot!.querySelector('video');
const statusOf = (el: VideoPreview) => el.shadowRoot!.querySelector('.spl-status');
const noteOf = (el: VideoPreview) => el.shadowRoot!.querySelector('.video-preview__note');
const covered = (el: VideoPreview) =>
  el.shadowRoot!.querySelector('.video-preview__loading') !== null;

/** The `<video>`'s picture is `width` wide (jsdom's is always 0). */
function pictureOf(media: HTMLVideoElement, width: number): void {
  Object.defineProperty(media, 'videoWidth', { value: width, configurable: true });
  Object.defineProperty(media, 'videoHeight', {
    value: Math.round((width * 9) / 16),
    configurable: true,
  });
}

/** The browser knows the length, and the picture is `width` wide. */
function loadWith(media: HTMLVideoElement, width = 64): void {
  pictureOf(media, width);
  media.dispatchEvent(new Event('loadedmetadata'));
}

/** The `<video>` says it failed, with `code` as its `MediaError`'s (none in jsdom by itself). */
function failWith(media: HTMLVideoElement, code: number | null): void {
  Object.defineProperty(media, 'error', {
    value: code === null ? null : { code },
    configurable: true,
  });
  media.dispatchEvent(new Event('error'));
}

/** A tick for the microtask that pauses an element taken out of the page. */
const tick = () => new Promise<void>((done) => setTimeout(done, 0));

describe('video-preview', () => {
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
    expect(customElements.get('video-preview')).toBe(VideoPreview);
  });

  it('says there is nothing to show without a source', () => {
    const el = create();
    document.body.append(el);

    expect(statusOf(el)?.textContent).toBe('No video selected.');
    expect(mediaOf(el)).toBeNull();
  });

  it('shows a player labelled with the name, covered until the length is known', async () => {
    const el = create();
    el.setSource('/files/clip.webm', 'clip.webm');
    document.body.append(el);

    const media = mediaOf(el)!;
    expect(media.getAttribute('src')).toBe('/files/clip.webm');
    expect(media.hasAttribute('controls')).toBe(true);
    expect(media.getAttribute('preload')).toBe('metadata');
    expect(media.hasAttribute('playsinline')).toBe(true);
    expect(media.getAttribute('aria-label')).toBe('clip.webm');
    expect(covered(el)).toBe(true);
    expect(el.hasAttribute('ready')).toBe(false);

    // Neither a time nor any event but the length settles it.
    media.dispatchEvent(new Event('loadstart'));
    media.dispatchEvent(new Event('progress'));
    expect(el.hasAttribute('ready')).toBe(false);

    loadWith(media);
    await el.whenReady();
    expect(covered(el)).toBe(false);
    expect(mediaOf(el)).toBe(media);
    expect(noteOf(el)).toBeNull();
  });

  it('does not start by itself', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
    const el = create();
    el.setSource('/files/clip.webm', 'clip.webm');
    document.body.append(el);
    loadWith(mediaOf(el)!);
    await el.whenReady();
    el.remove();
    document.body.append(el);
    await el.whenReady();

    expect(mediaOf(el)?.hasAttribute('autoplay')).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('says a picture of no size above the player once the length is known, and keeps the player', async () => {
    const el = create();
    el.setSource('/files/old.mkv', 'old.mkv');
    document.body.append(el);
    const media = mediaOf(el)!;

    // Not while it loads: the picture's size is not known yet.
    pictureOf(media, 0);
    expect(noteOf(el)).toBeNull();

    loadWith(media, 0);
    await el.whenReady();

    const note = noteOf(el)!;
    expect(note.textContent).toBe(NO_PICTURE);
    expect(note.getAttribute('role')).toBe('status');
    expect(statusOf(el)).toBeNull();
    expect(mediaOf(el)).toBe(media);
    // Above the player.
    expect(note.nextElementSibling).toBe(media);
  });

  it('takes the note away when a picture arrives after the length, and back when it goes', async () => {
    const el = create();
    el.setSource('/files/clip.mp4', 'clip.mp4');
    document.body.append(el);
    const media = mediaOf(el)!;
    loadWith(media, 0);
    await el.whenReady();
    expect(noteOf(el)).not.toBeNull();
    load.mockClear();

    pictureOf(media, 640);
    media.dispatchEvent(new Event('resize'));
    expect(noteOf(el)).toBeNull();
    expect(mediaOf(el)).toBe(media);

    pictureOf(media, 0);
    media.dispatchEvent(new Event('resize'));
    expect(noteOf(el)?.textContent).toBe(NO_PICTURE);
    expect(load).not.toHaveBeenCalled();
  });

  it('says a file that did not arrive in the first sentence, in place of the player, and reports it once', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    // The browser's code cannot tell a missing file from noise, so the address is asked.
    const fetch = vi.fn(async () => new Response('{"ok":false}', { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    const el = create();
    el.setSource('/files/missing.mp4', 'missing.mp4');
    document.body.append(el);

    failWith(mediaOf(el)!, 4);
    await el.whenReady();

    expect(statusOf(el)?.textContent).toBe("Couldn't load this video.");
    expect(statusOf(el)?.getAttribute('role')).toBe('alert');
    expect(mediaOf(el)).toBeNull();
    expect(noteOf(el)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('Video preview failed to load', {
      src: '/files/missing.mp4',
    });
  });

  it('says a file that arrived and has no decoder in the second sentence', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array(8), { status: 200 }));
    const el = create();
    el.setSource('/files/noise.mp4', 'noise.mp4');
    document.body.append(el);

    failWith(mediaOf(el)!, 4);
    await el.whenReady();

    expect(statusOf(el)?.textContent).toBe("This browser can't play this video.");
    expect(mediaOf(el)).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('takes a decode error and a network error at their word', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const decoded = create();
    decoded.setSource('/files/a.mp4', 'a.mp4');
    const dropped = create();
    dropped.setSource('/files/b.mp4', 'b.mp4');
    document.body.append(decoded, dropped);

    failWith(mediaOf(decoded)!, 3);
    failWith(mediaOf(dropped)!, 2);
    await Promise.all([decoded.whenReady(), dropped.whenReady()]);

    expect(statusOf(decoded)?.textContent).toBe("This browser can't play this video.");
    expect(statusOf(dropped)?.textContent).toBe("Couldn't load this video.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says a failure after the length was known, once, however often the player says it', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const el = create();
    el.setSource('/files/clip.webm', 'clip.webm');
    document.body.append(el);
    const media = mediaOf(el)!;
    loadWith(media, 0);
    await el.whenReady();

    failWith(media, 2);
    failWith(media, 2);
    await el.whenReady();
    await tick();

    expect(statusOf(el)?.textContent).toBe("Couldn't load this video.");
    expect(noteOf(el)).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('lets the old source go for a new one, and hears only the new one', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const el = create();
    el.setSource('/files/first.mp4', 'first.mp4');
    document.body.append(el);
    const first = mediaOf(el)!;
    loadWith(first);
    await el.whenReady();
    pause.mockClear();
    load.mockClear();

    el.setSource('/files/second.webm', 'second.webm');
    const second = mediaOf(el)!;

    expect(second).not.toBe(first);
    // Paused, its source taken away, then loaded with none: it stops and stops arriving.
    expect(first.hasAttribute('src')).toBe(false);
    expect(pause.mock.contexts).toEqual([first]);
    expect(load.mock.contexts).toEqual([first]);
    expect(pause.mock.invocationCallOrder[0]).toBeLessThan(load.mock.invocationCallOrder[0]);

    // What the one let go says late is about a source no longer shown.
    failWith(first, 2);
    loadWith(first, 0);
    first.dispatchEvent(new Event('resize'));
    await tick();
    expect(handler).not.toHaveBeenCalled();
    expect(el.hasAttribute('ready')).toBe(false);
    expect(noteOf(el)).toBeNull();

    loadWith(second);
    await el.whenReady();
    expect(mediaOf(el)?.getAttribute('src')).toBe('/files/second.webm');
  });

  it('lets the source go when it is taken away', async () => {
    const el = create();
    el.setSource('/files/clip.webm', 'clip.webm');
    document.body.append(el);
    const media = mediaOf(el)!;
    pause.mockClear();

    el.setSource('');
    await el.whenReady();

    expect(pause.mock.contexts).toEqual([media]);
    expect(media.hasAttribute('src')).toBe(false);
    expect(mediaOf(el)).toBeNull();
    expect(statusOf(el)?.textContent).toBe('No video selected.');
  });

  it('relabels the player for a new name, without loading again', async () => {
    const el = create();
    el.setSource('/files/clip.webm', 'old name');
    document.body.append(el);
    loadWith(mediaOf(el)!);
    await el.whenReady();
    const media = mediaOf(el);
    load.mockClear();

    el.setSource('/files/clip.webm', 'new name');

    expect(mediaOf(el)).toBe(media);
    expect(media?.getAttribute('aria-label')).toBe('new name');
    expect(load).not.toHaveBeenCalled();
    expect(el.hasAttribute('ready')).toBe(true);
  });

  it('pauses when it leaves the page, and is the same player, unpaused by nothing, when put back', async () => {
    const el = create();
    el.setSource('/files/clip.webm', 'clip.webm');
    document.body.append(el);
    const media = mediaOf(el)!;
    loadWith(media);
    await el.whenReady();
    pause.mockClear();

    el.remove();
    expect(el.hasAttribute('ready')).toBe(false);
    await tick();
    expect(pause.mock.contexts).toEqual([media]);

    document.body.append(el);
    await el.whenReady();
    expect(mediaOf(el)).toBe(media);
    expect(media.getAttribute('src')).toBe('/files/clip.webm');
  });

  it('does not pause for a move, out of the page and back in one task', async () => {
    const el = create();
    el.setSource('/files/clip.webm', 'clip.webm');
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    first.append(el);
    loadWith(mediaOf(el)!);
    await el.whenReady();
    pause.mockClear();

    second.append(el);
    await tick();

    expect(pause).not.toHaveBeenCalled();
    await el.whenReady();
  });
});
