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

import type { ImagePreviewElement } from '@stillpointlab/common-format';

type ImageState = 'empty' | 'loading' | 'loaded' | 'error';
type SvgSizing = 'fixed' | 'scalable';

export class ImagePreview extends HTMLElement implements ImagePreviewElement {
  private readonly root: ShadowRoot;
  private state: ImageState = 'empty';
  private svgSizing: SvgSizing = 'fixed';
  // Pending while an image loads; settled once it has loaded or failed, or when
  // there is nothing to show.
  private readonly ready: ReadyGate = createReadyGate(this);

  static get observedAttributes(): string[] {
    return ['src', 'alt'];
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.syncStateFromSource();
    this.render();
  }

  disconnectedCallback(): void {
    this.ready.begin();
  }

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    if (name === 'src') {
      this.syncStateFromSource();
    }
    if (this.isConnected) this.render();
  }

  setSource(src: string, alt?: string): void {
    if (alt !== undefined) {
      this.setAttribute('alt', alt);
    }
    if (src) {
      this.setAttribute('src', src);
    } else {
      this.removeAttribute('src');
    }
  }

  private get src(): string {
    return this.getAttribute('src')?.trim() ?? '';
  }

  private get alt(): string {
    return this.getAttribute('alt') ?? '';
  }

  private syncStateFromSource(): void {
    this.state = this.src ? 'loading' : 'empty';
    this.svgSizing = 'fixed';
  }

  private handleLoad = async (): Promise<void> => {
    if (this.state === 'loaded') return;
    this.state = 'loaded';
    const src = this.src;
    const sizing = await classifySvgSizing(src);
    // The source changed while its SVG was read: the new one has its own load to come.
    if (this.src !== src) return;
    this.svgSizing = sizing;
    this.render();
  };

  private handleError = (): void => {
    this.state = 'error';
    reportError('Image preview failed to load', { src: this.src });
    this.render();
  };

  private render(): void {
    const src = this.src;
    const alt = this.alt;

    let body = '';
    if (src) {
      const imageClass =
        this.svgSizing === 'scalable'
          ? 'image-preview__image image-preview__image--scalable'
          : 'image-preview__image';
      body = `
        <div class="image-preview__frame">
          ${
            this.state === 'error'
              ? ''
              : `<img class="${imageClass}" src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" />`
          }
        </div>`;
    }

    this.root.innerHTML = `
      <style>${previewStyles}</style>
      <div class="image-preview" part="container">${body}</div>
    `;
    this.renderStatus();

    // Each render makes a new <img>, which loads its source and says so itself.
    // The one it replaced may still say something late (its `alt` and `src`
    // changed together, say): that is about a source no longer shown, so only the
    // image in the element is heard. Nothing is lost by it: the image that is
    // there always has its own load or error to come.
    const img = this.root.querySelector('img');
    if (img) {
      const current = (): boolean => this.root.contains(img);
      img.addEventListener('load', () => current() && void this.handleLoad(), { once: true });
      img.addEventListener('error', () => current() && this.handleError(), { once: true });
    }

    if (this.state === 'loading') this.ready.begin();
    else this.ready.settle();
  }

  /** The empty, loading or error placeholder over the frame. */
  private renderStatus(): void {
    if (!this.src) {
      this.root
        .querySelector('.image-preview')
        ?.append(createStatus('empty', 'No image selected.'));
    } else if (this.state === 'loading') {
      const overlay = document.createElement('div');
      overlay.className = 'image-preview__loading';
      overlay.append(createStatus('loading', STATUS_MESSAGES.loading));
      this.root.querySelector('.image-preview__frame')?.append(overlay);
    } else if (this.state === 'error') {
      this.root
        .querySelector('.image-preview__frame')
        ?.append(createStatus('error', "Couldn't load this image."));
    }
  }
}

async function classifySvgSizing(src: string): Promise<SvgSizing> {
  if (!/\.svg(?:$|[?#])/i.test(src)) return 'fixed';

  try {
    const response = await fetch(src);
    if (!response.ok) return 'fixed';
    const doc = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    const svg = doc.documentElement;
    if (svg.nodeName.toLowerCase() !== 'svg') return 'fixed';

    const width = svg.getAttribute('width');
    const height = svg.getAttribute('height');
    return hasFixedSvgLength(width) && hasFixedSvgLength(height) ? 'fixed' : 'scalable';
  } catch {
    return 'fixed';
  }
}

function hasFixedSvgLength(value: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.endsWith('%')) return false;
  return /^\d*\.?\d+(?:px|pt|pc|mm|cm|in)?$/i.test(trimmed);
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

defineElement('image-preview', ImagePreview);
