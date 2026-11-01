/// <reference lib="dom" />

import { parseSample } from '../core/parse';

import { previewStyles } from './preview.styles';

import type { PreviewElement } from '@stillpointlab/common-format';

/** Read-only view of one good's content. Implements the host's PreviewElement. */
export class SamplePreview extends HTMLElement implements PreviewElement {
  private readonly root: ShadowRoot;
  private readonly body: HTMLPreElement;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = previewStyles;
    this.body = document.createElement('pre');
    this.body.className = 'sample-preview';
    this.root.append(style, this.body);
  }

  setContent(content: string): void {
    this.body.textContent = parseSample(content).lines.join('\n');
  }
}

if (!customElements.get('sample-preview')) {
  customElements.define('sample-preview', SamplePreview);
}
