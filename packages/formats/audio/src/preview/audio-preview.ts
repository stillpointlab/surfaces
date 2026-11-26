/// <reference lib="dom" />

import {
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

import type { UrlPreviewElement } from '@stillpointlab/common-format';

/**
 * What a host may ask of `<audio-preview>`: the contract of every preview
 * given a URL, under this format's own name. Add here what is this format's alone
 * (a position in the track) once a host asks for it, and not before.
 */
export interface AudioPreviewElement extends UrlPreviewElement {}

type AudioState = 'empty' | 'loading' | 'loaded' | 'failed';

/** What the element says in place of the player, for each of the two failures. */
const FAILED: Record<MediaFailure, string> = {
  load: "Couldn't load this audio.",
  decode: "This browser can't play this audio.",
};

/**
 * Read-only player for the audio file at a URL the host gives it: the file's
 * name, and under it the browser's own `<audio controls>`, labelled with the
 * name. The source and its name are the `src` and `name` attributes, which
 * `setSource` sets. It never starts by itself. Ready is pending until the
 * browser knows the file's length (`loadedmetadata`) or the load has failed, and
 * settles at once when there is nothing to show; a failure is said in one of
 * two sentences and reported once.
 *
 * A new source lets the old one go (paused, its download ended), so a file
 * switched away from stops sounding and stops arriving. Leaving the page's tree
 * pauses it and keeps the media, so put back it is where it stopped.
 */
export class AudioPreview extends HTMLElement implements AudioPreviewElement {
  private readonly root: ShadowRoot;
  private readonly frame: HTMLDivElement;
  // The name over the player, or over the words that replace it.
  private readonly player: HTMLDivElement;
  private readonly nameLine: HTMLParagraphElement;
  private readonly cover: HTMLDivElement;
  // Settled whenever connected with nothing left to load.
  private readonly ready: ReadyGate = createReadyGate(this);
  private state: AudioState = 'empty';
  private failure: MediaFailure = 'load';
  // The media playing `shown`; null while there is no source.
  private media: HTMLAudioElement | null = null;
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
    this.frame.className = 'audio-preview';
    this.frame.setAttribute('part', 'container');
    this.player = document.createElement('div');
    this.player.className = 'audio-preview__player';
    this.nameLine = document.createElement('p');
    this.nameLine.className = 'audio-preview__name';
    this.nameLine.dir = 'auto';
    this.cover = document.createElement('div');
    this.cover.className = 'audio-preview__loading';
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
      if (this.media) releaseMedia(this.media);
      this.shown = src;
      this.media = src ? this.createMedia(src) : null;
      this.state = src ? 'loading' : 'empty';
    }
    this.render();
    // A reconnect keeps media that has loaded or failed, so it settles at once.
    if (this.state === 'loading') this.ready.begin();
    else this.ready.settle();
  }

  private createMedia(src: string): HTMLAudioElement {
    const media = document.createElement('audio');
    media.className = 'audio-preview__media';
    media.setAttribute('controls', '');
    media.setAttribute('preload', 'metadata');
    media.setAttribute('src', src);
    // Only the media in the element is heard: one it let go may still say
    // something late, and that is about a source no longer shown.
    media.addEventListener('loadedmetadata', () => {
      if (this.media === media && this.state === 'loading') this.settle('loaded');
    });
    media.addEventListener('error', () => {
      if (this.media === media && this.state !== 'failed') void this.fail(media);
    });
    return media;
  }

  /** Which failure it was takes a moment to learn (see `mediaFailureOf`); ready waits for it. */
  private async fail(media: HTMLAudioElement): Promise<void> {
    const failure = await mediaFailureOf(media);
    if (this.media !== media || this.state === 'failed') return;
    this.failure = failure;
    this.settle('failed');
  }

  private settle(state: 'loaded' | 'failed'): void {
    this.state = state;
    if (state === 'failed') reportError('Audio preview failed to load', { src: this.shown });
    this.render();
    // Loaded while detached: the reconnect settles it.
    if (this.isConnected) this.ready.settle();
  }

  /** The name over the player, and the player's label for a screen reader. */
  private label(): void {
    const name = this.sourceName;
    this.nameLine.textContent = name;
    this.nameLine.hidden = !name;
    if (name) this.media?.setAttribute('aria-label', name);
    else this.media?.removeAttribute('aria-label');
  }

  /** The empty words, or the name over the player (covered while it loads) or the failed words. */
  private render(): void {
    if (!this.media) {
      this.frame.replaceChildren(createStatus('empty', 'No audio selected.'));
      return;
    }
    this.label();
    if (this.player.parentNode !== this.frame) this.frame.replaceChildren(this.player);
    if (this.state === 'failed') {
      this.show(this.nameLine, createStatus('error', FAILED[this.failure]));
    } else if (this.state === 'loading') {
      this.show(this.nameLine, this.media, this.cover);
    } else {
      this.show(this.nameLine, this.media);
    }
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

defineElement('audio-preview', AudioPreview);
