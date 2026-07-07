/// <reference lib="dom" />

import { reportError } from './log';
import { previewStyles } from './preview.styles';

type ImageState = 'empty' | 'loading' | 'loaded' | 'error';

export class ImagePreview extends HTMLElement {
  private readonly root: ShadowRoot;
  private state: ImageState = 'empty';

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
  }

  private handleLoad = (): void => {
    this.state = 'loaded';
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
      body = `
        <div class="image-preview__frame">
          ${
            this.state === 'error'
              ? error
              : `<img class="image-preview__image" src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" />${loading}`
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
  }
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
