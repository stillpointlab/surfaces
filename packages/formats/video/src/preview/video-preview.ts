/// <reference lib="dom" />

import {
  createLazyLoader,
  createNotice,
  createReadyGate,
  createStatus,
  defineElement,
  type MediaFailure,
  mediaFailureOf,
  type ReadyGate,
  releaseMedia,
  reportError,
  STATUS_MESSAGES,
} from '@stillpointlab/common-format';

import { previewStyles } from './preview.styles';
import { isPlaylist } from './stream';

import type { StartEngine, StreamEngine } from './stream';
import type { UrlPreviewElement } from '@stillpointlab/common-format';

/**
 * What a host may ask of `<video-preview>`: the contract of every preview
 * given a URL, under this format's own name. Add here what is this format's alone
 * (a position in the video) once a host asks for it, and not before.
 */
export interface VideoPreviewElement extends UrlPreviewElement {}

type VideoState = 'empty' | 'loading' | 'loaded' | 'failed';

/** What the element says in place of the player, for each of the two failures. */
const FAILED: Record<MediaFailure, string> = {
  load: "Couldn't load this video.",
  decode: "This browser can't play this video.",
};

/** What it says above a player whose picture the browser cannot show. */
const NO_PICTURE = "This browser can't show this video's picture. Its sound plays.";

// hls.js, imported the first time a playlist is opened and shared by every
// instance; a file never loads it. A failed import is tried again by the next
// playlist.
const loadHls = createLazyLoader(async () => (await import('./hls-engine')).startHls);

/**
 * Read-only player for the video file at a URL the host gives it: the
 * browser's own `<video controls>`, as large as the element with its own
 * proportions kept, on a dark ground, and labelled with the file's name. The
 * source and its name are the `src` and `name` attributes, which `setSource`
 * sets. It never starts by itself. Ready is pending until the browser knows the
 * file's length (`loadedmetadata`) or the load has failed, and settles at once
 * when there is nothing to show; a failure is said in one of two sentences and
 * reported once.
 *
 * An HLS playlist (an address whose path ends in `.m3u8`) plays through hls.js,
 * loaded for it alone: the engine feeds the `<video>`, and says which of the two
 * failures it met when it gives up. Where hls.js cannot run (no Media Source
 * Extensions), the playlist's address is the `<video>`'s own source, for a
 * browser that plays HLS itself. Everything else holds for a stream as for a
 * file.
 *
 * A file whose sound the browser plays and whose picture it has no decoder for
 * fails nothing: the browser gives it a picture of no size. Once its length is
 * known, the element says so above the player.
 *
 * A new source lets the old one go (paused, its download ended, its engine
 * with it), so a file switched away from stops sounding and stops arriving.
 * Leaving the page's tree pauses it and keeps the media, so put back it is
 * where it stopped.
 */
export class VideoPreview extends HTMLElement implements VideoPreviewElement {
  private readonly root: ShadowRoot;
  private readonly frame: HTMLDivElement;
  // The dark ground: the media, and above it the note when there is one.
  private readonly player: HTMLDivElement;
  private readonly note: HTMLElement;
  private readonly cover: HTMLDivElement;
  // Settled whenever connected with nothing left to load.
  private readonly ready: ReadyGate = createReadyGate(this);
  private state: VideoState = 'empty';
  private failure: MediaFailure = 'load';
  // The media playing `shown`; null while there is no source.
  private media: HTMLVideoElement | null = null;
  // The engine feeding `media` a stream; null for a file, and until it has loaded.
  private engine: StreamEngine | null = null;
  private shown = '';

  static get observedAttributes(): string[] {
    return ['src', 'name'];
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = previewStyles;
    this.frame = document.createElement('div');
    this.frame.className = 'video-preview';
    this.frame.setAttribute('part', 'container');
    this.player = document.createElement('div');
    this.player.className = 'video-preview__player';
    this.note = createNotice({ tone: 'warning', title: NO_PICTURE });
    this.note.classList.add('video-preview__note');
    this.cover = document.createElement('div');
    this.cover.className = 'video-preview__loading';
    this.cover.append(createStatus('loading', STATUS_MESSAGES.loading));
    this.root.append(style, this.frame);
  }

  connectedCallback(): void {
    this.update();
  }

  disconnectedCallback(): void {
    this.ready.begin();
    // Out of the page it falls silent, as a browser does with a media element
    // taken out of its document; a move, out and back in one task, does not.
    const media = this.media;
    queueMicrotask(() => {
      if (!this.isConnected) media?.pause();
    });
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    // A new name for the same source relabels the player; nothing reloads.
    if (name === 'name') this.label();
    else if (this.isConnected) this.update();
  }

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  setSource(src: string, name?: string): void {
    if (name !== undefined) this.setAttribute('name', name);
    if (src) this.setAttribute('src', src);
    else this.removeAttribute('src');
  }

  private get src(): string {
    return this.getAttribute('src')?.trim() ?? '';
  }

  private get sourceName(): string {
    return this.getAttribute('name') ?? '';
  }

  /** Show the current source: new media for a new one, the same media on a reconnect. */
  private update(): void {
    const src = this.src;
    if (src !== this.shown || (src && !this.media)) {
      this.letGo();
      this.shown = src;
      this.media = src ? this.createMedia(src) : null;
      this.state = src ? 'loading' : 'empty';
    }
    this.render();
    // A reconnect keeps media that has loaded or failed, so it settles at once.
    if (this.state === 'loading') this.ready.begin();
    else this.ready.settle();
  }

  private createMedia(src: string): HTMLVideoElement {
    const media = document.createElement('video');
    media.className = 'video-preview__media';
    media.setAttribute('controls', '');
    media.setAttribute('preload', 'metadata');
    media.setAttribute('playsinline', '');
    if (isPlaylist(src)) void this.stream(media, src);
    else media.setAttribute('src', src);
    // Only the media in the element is heard: one it let go may still say
    // something late, and that is about a source no longer shown.
    media.addEventListener('loadedmetadata', () => {
      if (this.media === media && this.state === 'loading') this.settle('loaded');
    });
    // A picture's size that changes after the length is known moves the note with it.
    media.addEventListener('resize', () => {
      if (this.media === media && this.state === 'loaded') this.render();
    });
    // Fed by an engine, the media's source is the engine's own `blob:`, and the
    // engine says which failure it was (and recovers what it can first).
    media.addEventListener('error', () => {
      if (this.media === media && this.state !== 'failed' && !this.engine) void this.fail(media);
    });
    return media;
  }

  /** Load the engine, then play the playlist at `src` through it, or through `media` itself. */
  private async stream(media: HTMLVideoElement, src: string): Promise<void> {
    let start: StartEngine;
    try {
      start = await loadHls();
    } catch {
      // The engine did not arrive, and so nor did the stream.
      if (this.media === media && this.state !== 'failed') this.failWith('load');
      return;
    }
    if (this.media !== media) return;
    const engine = start();
    if (!engine) {
      media.setAttribute('src', src);
      return;
    }
    this.engine = engine;
    engine.attach(media, src, (failure) => {
      if (this.media === media && this.state !== 'failed') this.failWith(failure);
    });
  }

  /** Let the media go, and the engine feeding it first. */
  private letGo(): void {
    this.engine?.release();
    this.engine = null;
    if (this.media) releaseMedia(this.media);
  }

  /** Which failure it was takes a moment to learn (see `mediaFailureOf`); ready waits for it. */
  private async fail(media: HTMLVideoElement): Promise<void> {
    const failure = await mediaFailureOf(media);
    if (this.media !== media || this.state === 'failed') return;
    this.failWith(failure);
  }

  private failWith(failure: MediaFailure): void {
    this.failure = failure;
    this.settle('failed');
  }

  private settle(state: 'loaded' | 'failed'): void {
    this.state = state;
    if (state === 'failed') reportError('Video preview failed to load', { src: this.shown });
    this.render();
    // Loaded while detached: the reconnect settles it.
    if (this.isConnected) this.ready.settle();
  }

  /** The player's label for a screen reader: the file's name. */
  private label(): void {
    const name = this.sourceName;
    if (name) this.media?.setAttribute('aria-label', name);
    else this.media?.removeAttribute('aria-label');
  }

  /**
   * The empty words, the failed words, or the player: covered while it loads,
   * and under the note once its length is known with a picture of no size.
   */
  private render(): void {
    if (!this.media) {
      this.frame.replaceChildren(createStatus('empty', 'No video selected.'));
      return;
    }
    if (this.state === 'failed') {
      this.frame.replaceChildren(createStatus('error', FAILED[this.failure]));
      return;
    }
    this.label();
    if (this.player.parentNode !== this.frame) this.frame.replaceChildren(this.player);
    if (this.state === 'loading') this.show(this.media, this.cover);
    else if (this.media.videoWidth === 0) this.show(this.note, this.media);
    else this.show(this.media);
  }

  /**
   * Make the player's children `nodes`, changing only what differs: the media
   * stays where it is from loading to loaded, never taken out and put back.
   */
  private show(...nodes: Node[]): void {
    for (const child of [...this.player.childNodes]) {
      if (!nodes.includes(child)) child.remove();
    }
    nodes.forEach((node, at) => {
      const there = this.player.childNodes[at] ?? null;
      if (there !== node) this.player.insertBefore(node, there);
    });
  }
}

defineElement('video-preview', VideoPreview);
