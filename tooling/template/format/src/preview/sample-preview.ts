/// <reference lib="dom" />

import {
  createNotice,
  createRawView,
  createReadyGate,
  createViewState,
  defineElement,
  parseView,
  type RawView,
  type ReadyGate,
} from '@stillpointlab/common-format';

import { formatSampleIssue, parseSample, validateSample } from '../core/parse';

import { previewStyles } from './preview.styles';

import type { PreviewElement } from '@stillpointlab/common-format';

/**
 * Read-only view of one good's content. Implements the host's PreviewElement and
 * the raw view capability: `view="raw"` shows the source, and content that does
 * not parse shows the source with its errors until valid content arrives.
 */
export class SamplePreview extends HTMLElement implements PreviewElement {
  private readonly root: ShadowRoot;
  private readonly body: HTMLDivElement;
  // Settled whenever connected and rendered; in raw, once the raw view is ready.
  private readonly ready: ReadyGate = createReadyGate(this);
  private readonly viewState = createViewState(this);
  private text = '';
  // True while showing raw only because the content does not parse.
  private fallback = false;
  private raw: RawView | null = null;

  static get observedAttributes(): string[] {
    return ['view'];
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = previewStyles;
    this.body = document.createElement('div');
    this.root.append(style, this.body);
  }

  connectedCallback(): void {
    this.render();
  }

  disconnectedCallback(): void {
    this.ready.begin();
  }

  attributeChangedCallback(_name: string, _oldValue: string | null, newValue: string | null): void {
    if (this.viewState.reflecting) return;
    const view = parseView(newValue);
    // The rendered view cannot show invalid content; refuse and say so.
    if (view === 'rich' && validateSample(this.text).length > 0) {
      this.viewState.reflect();
      return;
    }
    this.fallback = false;
    this.viewState.commit(view, 'host');
    this.render();
  }

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  setContent(content: string): void {
    this.text = content;
    const invalid = validateSample(content).length > 0;
    if (invalid && this.viewState.current === 'rich') {
      this.fallback = true;
      this.viewState.commit('raw', 'fallback');
    } else if (!invalid && this.fallback) {
      // A preview's fallback is not sticky: nobody can fix the text here.
      this.fallback = false;
      this.viewState.commit('rich', 'fallback');
    }
    this.raw?.setValue(content);
    this.render();
  }

  private render(): void {
    if (this.viewState.current === 'raw') {
      this.raw ??= createRawView({ value: this.text, label: 'Sample source' });
      const issues = validateSample(this.text);
      const notice =
        issues.length > 0
          ? [
              createNotice({
                tone: 'error',
                title: 'This content cannot be shown as a sample; showing the raw text.',
                items: issues.map(formatSampleIssue),
              }),
            ]
          : [];
      this.body.replaceChildren(...notice, this.raw.element);
    } else {
      this.raw = null;
      const pre = document.createElement('pre');
      pre.className = 'sample-preview';
      pre.textContent = parseSample(this.text).lines.join('\n');
      this.body.replaceChildren(pre);
    }
    if (!this.isConnected) return;
    const cycle = this.ready.begin();
    void (this.raw?.whenReady() ?? Promise.resolve()).then(() => this.ready.settle(cycle));
  }
}

defineElement('sample-preview', SamplePreview);
