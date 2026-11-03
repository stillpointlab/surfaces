/// <reference lib="dom" />

import { createReadyGate, defineElement, type ReadyGate } from '@stillpointlab/common-format';

import { editorStyles } from './editor.styles';

import type { EditorElement } from '@stillpointlab/common-format';

/**
 * Interactive editor over one good's content. Implements the host's EditorElement:
 * string content in and out, `content-change` on every edit, focus.
 */
export class SampleEditor extends HTMLElement implements EditorElement {
  private readonly root: ShadowRoot;
  private readonly area: HTMLTextAreaElement;
  // Rendering is synchronous: settled whenever connected (see the contract in common).
  private readonly ready: ReadyGate = createReadyGate(this);

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = editorStyles;
    this.area = document.createElement('textarea');
    this.area.className = 'sample-editor';
    this.area.addEventListener('input', () => {
      this.dispatchEvent(
        new CustomEvent('content-change', { detail: { content: this.area.value } })
      );
    });
    this.root.append(style, this.area);
  }

  static get observedAttributes(): string[] {
    return ['readonly'];
  }

  connectedCallback(): void {
    this.ready.settle();
  }

  disconnectedCallback(): void {
    this.ready.begin();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (name === 'readonly') this.area.readOnly = newValue === 'true';
  }

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  setContent(content: string): void {
    this.area.value = content;
  }

  getContent(): string {
    return this.area.value;
  }

  focus(): void {
    this.area.focus();
  }
}

defineElement('sample-editor', SampleEditor);
