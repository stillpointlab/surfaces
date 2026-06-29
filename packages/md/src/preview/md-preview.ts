/// <reference lib="dom" />
import { reportError } from '../editor/log';

import { previewStyles } from './preview.styles';
import { getPreviewRenderer } from './render';

/**
 * Read-only markdown preview web component — the companion to `<md-editor>`.
 *
 * It implements only the minimal Preview contract (`setContent`): it renders the
 * given markdown to HTML via the injected preview renderer (see
 * `setPreviewRenderer`) and shows it in its shadow root, styled with the shared
 * markdown styles. It pulls markdown rendering only — never the ProseMirror
 * editor — so importing `@stillpointlab/md-editor/preview` stays lightweight.
 *
 * The default renderer is UNSANITIZED (dev playground only); hosts must inject a
 * renderer that sanitizes before the HTML reaches the DOM.
 */
export class MdPreview extends HTMLElement {
  private _content = '';
  private _shadowRoot: ShadowRoot;
  // Guards against out-of-order async renders: only the latest write wins.
  private renderToken = 0;

  constructor() {
    super();
    this._shadowRoot = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.renderShell();
    void this.renderContent();
  }

  disconnectedCallback(): void {
    // Invalidate any in-flight render so a late resolve doesn't write to a
    // detached root.
    this.renderToken++;
  }

  /** Set the markdown source to preview. Renders asynchronously; latest call wins. */
  setContent(content: string): void {
    this._content = content;
    void this.renderContent();
  }

  private async renderContent(): Promise<void> {
    const token = ++this.renderToken;
    if (!this.isConnected) return; // buffered until connected
    const body = this._shadowRoot.querySelector('.md-preview-body');
    if (!body) return;
    try {
      const html = await getPreviewRenderer()(this._content);
      if (token !== this.renderToken || !this.isConnected) return; // superseded
      body.innerHTML = html;
    } catch (err) {
      if (token !== this.renderToken) return;
      reportError('Failed to render markdown preview', err);
    }
  }

  private renderShell(): void {
    this._shadowRoot.innerHTML = `<style>${previewStyles}</style><div class="md-preview-body"></div>`;
  }
}

customElements.define('md-preview', MdPreview);
