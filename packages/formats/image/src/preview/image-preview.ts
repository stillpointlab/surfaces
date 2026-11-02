/// <reference lib="dom" />

import { createReadyGate, reportError, type ReadyGate } from '@stillpointlab/common-format';

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
    this.svgSizing = await classifySvgSizing(this.src);
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

    let body = '<div class="image-preview__message">No image selected.</div>';
    if (src) {
      const loading =
        this.state === 'loading'
          ? '<div class="image-preview__loading"><span class="image-preview__message">Loading...</span></div>'
          : '';
      const error =
        this.state === 'error'
          ? '<div class="image-preview__message image-preview__message--error">Could not load this image.</div>'
          : '';
      const imageClass =
        this.svgSizing === 'scalable'
          ? 'image-preview__image image-preview__image--scalable'
          : 'image-preview__image';
      body = `
        <div class="image-preview__frame">
          ${
            this.state === 'error'
              ? error
              : `<img class="${imageClass}" src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" />${loading}`
          }
        </div>`;
    }

    this.root.innerHTML = `
      <style>${previewStyles}</style>
      <div class="image-preview" part="container">${body}</div>
    `;

    const img = this.root.querySelector('img');
    img?.addEventListener('load', this.handleLoad, { once: true });
    img?.addEventListener('error', this.handleError, { once: true });

    if (this.state === 'loading') this.ready.begin();
    else this.ready.settle();
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

if (!customElements.get('image-preview')) {
  customElements.define('image-preview', ImagePreview);
}
