/// <reference lib="dom" />

import { createReadyGate, defineElement, type ReadyGate } from '@stillpointlab/common-format';

import { parseSample } from '../core/parse';

import { previewStyles } from './preview.styles';

import type { PreviewElement } from '@stillpointlab/common-format';

/** Read-only view of one good's content. Implements the host's PreviewElement. */
export class SamplePreview extends HTMLElement implements PreviewElement {
  private readonly root: ShadowRoot;
  private readonly body: HTMLPreElement;
  // Rendering is synchronous: settled whenever connected (see the contract in common).
  private readonly ready: ReadyGate = createReadyGate(this);

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = previewStyles;
    this.body = document.createElement('pre');
    this.body.className = 'sample-preview';
    this.root.append(style, this.body);
  }

  connectedCallback(): void {
    this.ready.settle();
  }

  disconnectedCallback(): void {
    this.ready.begin();
  }

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  setContent(content: string): void {
    this.body.textContent = parseSample(content).lines.join('\n');
  }
}

defineElement('sample-preview', SamplePreview);
