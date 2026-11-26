/// <reference lib="dom" />

import {
  createReadyGate,
  createStatus,
  defineElement,
  type ReadyGate,
  reportError,
  STATUS_MESSAGES,
} from '@stillpointlab/common-format';

import { previewStyles } from './preview.styles';

import type { UrlPreviewElement } from '@stillpointlab/common-format';

/**
 * What a host may ask of `<sample-url-preview>`: the contract of every preview
 * given a URL, under this format's own name. Add here what is this format's alone
 * (a video's position, a PDF's page) once a host asks for it, and not before.
 */
export interface SamplePreviewElement extends UrlPreviewElement {}

type SampleState = 'empty' | 'loading' | 'loaded' | 'failed';

/**
 * Read-only view of the media at a URL the host gives it, with no editor. The
 * source and its name are the `src` and `name` attributes, which `setSource`
 * sets. Ready is pending while the source loads and settles once it has loaded
 * or failed, or when there is nothing to show; a failure is said in words and
 * reported once. The sample shows its source as an image: a real format puts its
 * own media element where the `<img>` is and listens to that element's events.
 */
export class SamplePreview extends HTMLElement implements SamplePreviewElement {
  private readonly root: ShadowRoot;
  private readonly frame: HTMLDivElement;
  // Settled whenever connected with nothing left to load.
  private readonly ready: ReadyGate = createReadyGate(this);
  private state: SampleState = 'empty';
  // The media showing `shown`; null while there is no source.
  private media: HTMLImageElement | null = null;
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
    this.frame.className = 'sample-url-preview';
    this.frame.setAttribute('part', 'container');
    this.root.append(style, this.frame);
  }

  connectedCallback(): void {
    this.update();
  }

  disconnectedCallback(): void {
    this.ready.begin();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    // A new name for the same source labels the media it shows; nothing reloads.
    if (name === 'name') this.media?.setAttribute('alt', this.sourceName);
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
      this.shown = src;
      this.media = src ? this.createMedia(src) : null;
      this.state = src ? 'loading' : 'empty';
    }
    this.render();
    // A reconnect keeps media that has loaded or failed, so it settles at once.
    if (this.state === 'loading') this.ready.begin();
    else this.ready.settle();
  }

  private createMedia(src: string): HTMLImageElement {
    const media = document.createElement('img');
    media.className = 'sample-url-preview__media';
    media.setAttribute('src', src);
    media.setAttribute('alt', this.sourceName);
    // Only the media in the element is heard: one it replaced may still finish
    // late, and that is about a source no longer shown.
    media.addEventListener('load', () => this.media === media && this.settle('loaded'), {
      once: true,
    });
    media.addEventListener('error', () => this.media === media && this.settle('failed'), {
      once: true,
    });
    return media;
  }

  private settle(state: 'loaded' | 'failed'): void {
    this.state = state;
    if (state === 'failed') reportError('Sample preview failed to load', { src: this.shown });
    this.render();
    // Loaded while detached: the reconnect settles it.
    if (this.isConnected) this.ready.settle();
  }

  /** The empty or failed words, or the media with a loading cover until it has loaded. */
  private render(): void {
    if (!this.media) {
      this.frame.replaceChildren(createStatus('empty', 'No sample selected.'));
    } else if (this.state === 'failed') {
      this.frame.replaceChildren(createStatus('error', "Couldn't load this sample."));
    } else if (this.state === 'loading') {
      const cover = document.createElement('div');
      cover.className = 'sample-url-preview__loading';
      cover.append(createStatus('loading', STATUS_MESSAGES.loading));
      this.frame.replaceChildren(this.media, cover);
    } else {
      this.frame.replaceChildren(this.media);
    }
  }
}

defineElement('sample-url-preview', SamplePreview);
