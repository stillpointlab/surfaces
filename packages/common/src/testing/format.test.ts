// @vitest-environment jsdom
// The descriptor suite over a stand-in format, so the suite is proved apart from
// the five real ones: its elements are defined only by `load()`, the editor reads
// back what it was given, and `apply` picks a setter from the path.
import { createReadyGate } from '../ready';

import { describeFormatDescriptor } from './format';

import type { FormatDescriptor } from '../format';

class SampleSurface extends HTMLElement {
  private readonly ready = createReadyGate(this);
  private content = '';

  connectedCallback(): void {
    this.attachShadow({ mode: 'open' }).textContent = this.content;
    this.ready.settle();
  }

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  setContent(content: string): void {
    this.content = content;
    if (this.shadowRoot) this.shadowRoot.textContent = content;
  }

  /** A second setter, as the sheet has for a `.sheet` document. */
  setUpperContent(content: string): void {
    this.setContent(content);
    this.dataset.upper = '';
  }

  getContent(): string {
    return this.content;
  }
}

const defineOnce = (tag: string) => {
  if (!customElements.get(tag)) customElements.define(tag, class extends SampleSurface {});
  return { tag };
};
let previewModule: object | null = null;
let editorModule: object | null = null;

const sampleFormat: FormatDescriptor = {
  id: 'sample',
  opens: ['.sample', '.smp'],
  needs: 'text',
  preview: {
    tag: 'sample-format-preview',
    load: async () => (previewModule ??= defineOnce('sample-format-preview')),
  },
  editor: {
    tag: 'sample-format-editor',
    load: async () => (editorModule ??= defineOnce('sample-format-editor')),
  },
  apply(element, file) {
    const surface = element as SampleSurface;
    if (file.path.endsWith('.smp')) surface.setUpperContent(file.text ?? '');
    else surface.setContent(file.text ?? '');
  },
};

describeFormatDescriptor(sampleFormat, [
  { path: 'notes/one.sample', text: 'one\ntwo\n' },
  { path: 'TWO.SMP', text: 'three' },
]);
