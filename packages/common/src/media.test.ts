// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mediaFailureOf, releaseMedia } from './media';

/** An `<audio>` that met `code`, at `src`; jsdom never sets `error` itself. */
function failed(code: number | null, src = 'http://host.test/clip.mp3'): HTMLAudioElement {
  const media = document.createElement('audio');
  media.setAttribute('src', src);
  Object.defineProperty(media, 'error', { value: code === null ? null : { code } });
  return media;
}

describe('mediaFailureOf', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('takes a decode error and a network error at their word, asking nothing', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    expect(await mediaFailureOf(failed(3))).toBe('decode');
    expect(await mediaFailureOf(failed(2))).toBe('load');
    expect(await mediaFailureOf(failed(1))).toBe('load');
    expect(await mediaFailureOf(failed(null))).toBe('load');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks the address once when the source was not supported: an answer that arrived is decode', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ cancel: () => void (cancelled = true) });
    const fetch = vi.fn(async () => new Response(body, { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    expect(await mediaFailureOf(failed(4))).toBe('decode');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('http://host.test/clip.mp3', { cache: 'no-store' });
    expect(cancelled).toBe(true);
  });

  it('is load when the address answers a refusal, or nothing at all', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"ok":false}', { status: 404 }));
    expect(await mediaFailureOf(failed(4))).toBe('load');

    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await mediaFailureOf(failed(4))).toBe('load');
  });

  it('is load when there was no source to ask', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const media = document.createElement('audio');
    Object.defineProperty(media, 'error', { value: { code: 4 } });

    expect(await mediaFailureOf(media)).toBe('load');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('releaseMedia', () => {
  afterEach(() => vi.restoreAllMocks());

  it('pauses, takes the source away, then loads nothing, in that order', () => {
    const calls: string[] = [];
    const media = document.createElement('video');
    media.setAttribute('src', '/clip.webm');
    vi.spyOn(media, 'pause').mockImplementation(() => void calls.push('pause'));
    vi.spyOn(media, 'load').mockImplementation(
      () => void calls.push(`load with src ${media.getAttribute('src')}`)
    );

    releaseMedia(media);

    expect(calls).toEqual(['pause', 'load with src null']);
    expect(media.hasAttribute('src')).toBe(false);
  });
});
