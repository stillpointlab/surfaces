// A stream in the element, with the engine faked: the choice by the address's
// ending, the engine started for a playlist and never loaded for a file, let go
// on a new source, and the failure it names said in its sentence. jsdom has no
// Media Source Extensions and plays nothing; the browser tests play real streams.
import { setErrorHandler } from '@stillpointlab/common-format';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isPlaylist } from './stream';

import './video-preview';

import type { StreamEngine } from './stream';
import type { VideoPreview } from './video-preview';
import type { MediaFailure } from '@stillpointlab/common-format';

interface FakeEngine extends StreamEngine {
  media: HTMLVideoElement | null;
  src: string | null;
  failed: ((failure: MediaFailure) => void) | null;
  release: ReturnType<typeof vi.fn<() => void>>;
}

// What the fake engine module was asked, and how it answers: `supported` false is
// a browser with no Media Source Extensions; `arrives` false, an engine whose
// file did not come.
const engines = vi.hoisted(() => ({
  evaluated: 0,
  started: [] as FakeEngine[],
  supported: true,
  arrives: true,
}));

vi.mock('./hls-engine', () => {
  engines.evaluated += 1;
  return {
    get startHls() {
      if (!engines.arrives) throw new Error('the engine did not arrive');
      return (): FakeEngine | null => {
        if (!engines.supported) return null;
        const engine: FakeEngine = {
          media: null,
          src: null,
          failed: null,
          attach(media, src, failed) {
            engine.media = media;
            engine.src = src;
            engine.failed = failed;
          },
          release: vi.fn<() => void>(),
        };
        engines.started.push(engine);
        return engine;
      };
    },
  };
});

const create = (): VideoPreview => document.createElement('video-preview') as VideoPreview;
const mediaOf = (el: VideoPreview) => el.shadowRoot!.querySelector('video');
const statusOf = (el: VideoPreview) => el.shadowRoot!.querySelector('.spl-status');
const covered = (el: VideoPreview) =>
  el.shadowRoot!.querySelector('.video-preview__loading') !== null;

/** Until the engine's import and start have run: a task, past their microtasks. */
const loadedEngine = () => new Promise<void>((done) => setTimeout(done, 0));

/** The `<video>` says it failed, with `code` as its `MediaError`'s. */
function failWith(media: HTMLVideoElement, code: number): void {
  Object.defineProperty(media, 'error', { value: { code }, configurable: true });
  media.dispatchEvent(new Event('error'));
}

/** A connected element given `src`, once its engine (if any) has had its turn. */
async function shown(src: string, name = 'clip'): Promise<VideoPreview> {
  const el = create();
  el.setSource(src, name);
  document.body.append(el);
  await loadedEngine();
  return el;
}

describe('isPlaylist', () => {
  it.each([
    ['/api/raw/films/talk/index.m3u8', true],
    ['/api/raw/films/talk/index.m3u8?rev=1a2b-3c4d', true],
    ['/api/raw/films/talk/INDEX.M3U8', true],
    ['https://example.test/live/index.m3u8#t=10', true],
    ['index.m3u8', true],
    ['/api/raw/films/talk.mp4', false],
    ['/api/raw/films/talk.mp4?rev=x.m3u8', false],
    ['/api/raw?path=films%2Findex.m3u8', false],
    ['/api/raw/films/index.m3u8.mp4', false],
    ['blob:http://localhost/0c4b7c52-1f4e-4a55-9b9a-6f0f7b5e8a11', false],
  ])('%s is a playlist: %s', (src, playlist) => {
    expect(isPlaylist(src)).toBe(playlist);
  });
});

describe('video-preview with a stream', () => {
  let pause: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    document.body.replaceChildren();
    // The pause for leaving the page runs a microtask later, still stood in for.
    await loadedEngine();
    engines.started.length = 0;
    engines.supported = true;
    engines.arrives = true;
    setErrorHandler(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // First, before any playlist: the module registry is shared by the file.
  it('never loads the engine for a file, whose address is the player’s own source', async () => {
    const el = await shown('/api/raw/films/clip.mp4?rev=1a-2b', 'clip.mp4');

    expect(mediaOf(el)?.getAttribute('src')).toBe('/api/raw/films/clip.mp4?rev=1a-2b');
    expect(engines.evaluated).toBe(0);
    expect(engines.started).toEqual([]);
  });

  // Second, before any engine has loaded: a loaded one is kept for the next.
  it('says the first sentence, once, when the engine itself does not arrive', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    engines.arrives = false;
    const el = await shown('/api/raw/talk/index.m3u8');
    await el.whenReady();

    expect(statusOf(el)?.textContent).toBe("Couldn't load this video.");
    expect(handler).toHaveBeenCalledTimes(1);

    // The next playlist tries again.
    engines.arrives = true;
    el.setSource('/api/raw/two/index.m3u8');
    await loadedEngine();
    expect(engines.started).toHaveLength(1);
  });

  it('gives a playlist to the engine, behind the host’s ?rev=, and the player no source', async () => {
    const src = '/api/raw/films/talk/index.m3u8?rev=1a-2b';
    const el = await shown(src, 'index.m3u8');

    const media = mediaOf(el)!;
    expect(engines.started).toHaveLength(1);
    const [engine] = engines.started;
    expect(engine.media).toBe(media);
    expect(engine.src).toBe(src);
    expect(media.hasAttribute('src')).toBe(false);
    expect(media.hasAttribute('controls')).toBe(true);
    expect(media.getAttribute('aria-label')).toBe('index.m3u8');
  });

  it('is covered and not ready until the stream’s length is known', async () => {
    const el = await shown('/api/raw/talk/index.m3u8');

    expect(covered(el)).toBe(true);
    expect(el.hasAttribute('ready')).toBe(false);

    mediaOf(el)!.dispatchEvent(new Event('loadedmetadata'));
    await el.whenReady();
    expect(covered(el)).toBe(false);
  });

  it('lets the engine go, then the media, for a new source, and hears the old one no more', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const el = await shown('/api/raw/talk/index.m3u8');
    const first = mediaOf(el)!;
    const [engine] = engines.started;
    pause.mockClear();

    el.setSource('/api/raw/films/clip.mp4', 'clip.mp4');
    await loadedEngine();

    expect(engine.release).toHaveBeenCalledTimes(1);
    expect(pause.mock.contexts).toEqual([first]);
    expect(engine.release.mock.invocationCallOrder[0]).toBeLessThan(
      pause.mock.invocationCallOrder[0]
    );
    // A file after it starts no engine.
    expect(engines.started).toHaveLength(1);
    expect(mediaOf(el)?.getAttribute('src')).toBe('/api/raw/films/clip.mp4');

    // What the engine let go says late is about a source no longer shown.
    engine.failed?.('load');
    await loadedEngine();
    expect(handler).not.toHaveBeenCalled();
    expect(mediaOf(el)?.getAttribute('src')).toBe('/api/raw/films/clip.mp4');
  });

  it('lets the engine go when the source is taken away, as the pane does for a player it puts aside', async () => {
    const el = await shown('/api/raw/talk/index.m3u8');
    const [engine] = engines.started;

    el.setSource('');

    expect(engine.release).toHaveBeenCalledTimes(1);
    expect(mediaOf(el)).toBeNull();
    expect(statusOf(el)?.textContent).toBe('No video selected.');
  });

  it('starts a new engine for another playlist, and keeps its engine through a reconnect', async () => {
    const el = await shown('/api/raw/one/index.m3u8');
    const [first] = engines.started;

    el.remove();
    document.body.append(el);
    await loadedEngine();
    expect(first.release).not.toHaveBeenCalled();
    expect(engines.started).toHaveLength(1);

    el.setSource('/api/raw/two/index.m3u8');
    await loadedEngine();
    expect(first.release).toHaveBeenCalledTimes(1);
    expect(engines.started).toHaveLength(2);
    expect(engines.started[1].src).toBe('/api/raw/two/index.m3u8');
  });

  it.each<[MediaFailure, string]>([
    ['load', "Couldn't load this video."],
    ['decode', "This browser can't play this video."],
  ])(
    'says the failure the engine names (%s), in place of the player, and reports it once',
    async (failure, words) => {
      const handler = vi.fn();
      setErrorHandler(handler);
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const src = '/api/raw/talk/index.m3u8';
      const el = await shown(src);
      const [engine] = engines.started;

      engine.failed?.(failure);
      engine.failed?.(failure);
      await el.whenReady();

      expect(statusOf(el)?.textContent).toBe(words);
      expect(mediaOf(el)).toBeNull();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('Video preview failed to load', { src });
      // The engine said which: the address is not asked.
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('leaves the player’s own error to the engine, which may recover from it', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const el = await shown('/api/raw/talk/index.m3u8');

    const media = mediaOf(el)!;
    failWith(media, 3);
    await loadedEngine();

    // Still the player, under its cover, waiting.
    expect(mediaOf(el)).toBe(media);
    expect(covered(el)).toBe(true);
    expect(el.hasAttribute('ready')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('gives a browser with no Media Source Extensions the playlist as the player’s own source', async () => {
    engines.supported = false;
    const src = '/api/raw/talk/index.m3u8?rev=9';
    const el = await shown(src);

    const media = mediaOf(el)!;
    expect(media.getAttribute('src')).toBe(src);
    expect(engines.started).toEqual([]);

    // The browser's own player fails as a file's does: the address is asked.
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    failWith(media, 4);
    await el.whenReady();
    expect(statusOf(el)?.textContent).toBe("Couldn't load this video.");
  });
});
