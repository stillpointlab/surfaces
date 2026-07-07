import { parseXmdl } from '../parser/parse';

import { previewStyles } from './preview.styles';

export class XmdlPreview extends HTMLElement {
  private content = '';

  connectedCallback(): void {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.render();
  }

  setContent(content: string): void {
    this.content = content;
    this.render();
  }

  private render(): void {
    if (!this.shadowRoot) return;

    const result = parseXmdl(this.content);
    const body = result.ok ? result.document.body : this.content;
    const title = result.ok ? result.document.title : 'Invalid XMDL';
    const meta = result.ok
      ? [result.document.version, result.document.outputFileType]
      : result.errors.map((error) => error.message);

    this.shadowRoot.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = previewStyles;

    const wrapper = document.createElement('section');
    wrapper.className = 'xmdl-preview';

    const heading = document.createElement('h2');
    heading.textContent = title;

    const metaList = document.createElement('div');
    metaList.className = result.ok ? 'xmdl-preview__meta' : 'xmdl-preview__error';
    for (const item of meta) {
      const pill = document.createElement(result.ok ? 'span' : 'p');
      pill.className = result.ok ? 'xmdl-preview__pill' : '';
      pill.textContent = item;
      metaList.append(pill);
    }

    const pre = document.createElement('pre');
    pre.className = 'xmdl-preview__body';
    pre.textContent = body;

    wrapper.append(heading, metaList, pre);
    this.shadowRoot.append(style, wrapper);
  }
}

if (!customElements.get('xmdl-preview')) {
  customElements.define('xmdl-preview', XmdlPreview);
}
