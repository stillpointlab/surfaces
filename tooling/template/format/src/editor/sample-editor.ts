/// <reference lib="dom" />

import { editorStyles } from './editor.styles';

import type { EditorElement } from '@stillpointlab/common-format';

/**
 * Interactive editor over one good's content. Implements the host's EditorElement:
 * string content in and out, `content-change` on every edit, focus.
 */
export class SampleEditor extends HTMLElement implements EditorElement {
  private readonly root: ShadowRoot;
  private readonly area: HTMLTextAreaElement;

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

if (!customElements.get('sample-editor')) {
  customElements.define('sample-editor', SampleEditor);
}
