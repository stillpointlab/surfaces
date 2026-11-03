/// <reference lib="dom" />
import {
  createRawView,
  createReadyGate,
  createViewState,
  defineElement,
  parseView,
  type RawView,
  type ReadyGate,
  reportError,
} from '@stillpointlab/common-format';

import { previewStyles } from './preview.styles';
import { getPreviewRenderer } from './render';

import type { PreviewElement } from '@stillpointlab/common-format';

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
 *
 * The `frontmatter` attribute picks how a leading `---` block renders:
 * omitted/anything else → hidden (body only); `frontmatter="panel"` → a small
 * metadata panel above the body. The mode is passed to the renderer; injected
 * renderers must forward it to `renderMarkdown` for it to take effect.
 *
 * `view="raw"` shows the Markdown source instead, exactly as set (the raw view
 * convention in common). Markdown always renders, so there is no fallback.
 */
export class MdPreview extends HTMLElement implements PreviewElement {
  private _content = '';
  private _shadowRoot: ShadowRoot;
  // Guards against out-of-order async renders: only the latest write wins.
  private renderToken = 0;
  // Settled once the latest render has landed (see the contract in common).
  private readonly ready: ReadyGate = createReadyGate(this);
  private readonly viewState = createViewState(this);
  private raw: RawView | null = null;

  static get observedAttributes(): string[] {
    return ['frontmatter', 'view'];
  }

  constructor() {
    super();
    this._shadowRoot = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.renderShell();
    void this.renderContent();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (name === 'view') {
      if (this.viewState.reflecting) return;
      this.viewState.commit(parseView(newValue), 'host');
    }
    if (this.isConnected) void this.renderContent();
  }

  disconnectedCallback(): void {
    // Invalidate any in-flight render so a late resolve doesn't write to a
    // detached root, and go pending until reconnected and rendered.
    this.renderToken++;
    this.ready.begin();
  }

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  /** Set the markdown source to preview. Renders asynchronously; latest call wins. */
  setContent(content: string): void {
    this._content = content;
    this.raw?.setValue(content);
    void this.renderContent();
  }

  private async renderContent(): Promise<void> {
    const token = ++this.renderToken;
    const cycle = this.ready.begin();
    if (!this.isConnected) return; // buffered until connected
    const body = this._shadowRoot.querySelector<HTMLElement>('.md-preview-body');
    const rawContainer = this._shadowRoot.querySelector<HTMLElement>('.md-preview-raw');
    if (!body || !rawContainer) return;

    const raw = this.viewState.current === 'raw';
    body.hidden = raw;
    rawContainer.hidden = !raw;
    if (raw) {
      this.raw ??= createRawView({
        value: this._content,
        language: 'markdown',
        label: 'Markdown source',
      });
      if (this.raw.element.parentNode !== rawContainer)
        rawContainer.replaceChildren(this.raw.element);
      const surface = this.raw;
      await surface.whenReady();
      if (token === this.renderToken) this.ready.settle(cycle);
      return;
    }
    this.raw = null;
    rawContainer.replaceChildren();
    try {
      const frontmatter = this.getAttribute('frontmatter') === 'panel' ? 'panel' : 'hidden';
      const html = await getPreviewRenderer()(this._content, { frontmatter });
      if (token !== this.renderToken || !this.isConnected) return; // superseded
      body.innerHTML = html;
      this.dispatchEvent(
        new CustomEvent('md-preview-rendered', {
          detail: { root: body },
          bubbles: true,
          composed: true,
        })
      );
      this.ready.settle(cycle);
    } catch (err) {
      if (token !== this.renderToken) return;
      reportError('Failed to render markdown preview', err);
      this.ready.settle(cycle);
    }
  }

  private renderShell(): void {
    this._shadowRoot.innerHTML = `<style>${previewStyles}</style><div class="md-preview-body"></div><div class="md-preview-raw" hidden></div>`;
  }
}

defineElement('md-preview', MdPreview);
