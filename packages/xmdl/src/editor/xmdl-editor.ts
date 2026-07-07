import { editorStyles } from './editor.styles';

export class XmdlEditor extends HTMLElement {
  private textarea?: HTMLTextAreaElement;
  private content = '';

  connectedCallback(): void {
    if (this.shadowRoot) return;

    const shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = editorStyles;

    const wrapper = document.createElement('div');
    wrapper.className = 'xmdl-editor';

    const textarea = document.createElement('textarea');
    textarea.className = 'xmdl-editor__source';
    textarea.value = this.content;
    textarea.setAttribute('aria-label', 'XMDL source');
    textarea.addEventListener('input', () => {
      this.content = textarea.value;
      this.dispatchEvent(new CustomEvent('content-change', { bubbles: true }));
    });

    wrapper.append(textarea);
    shadow.append(style, wrapper);
    this.textarea = textarea;
  }

  setContent(content: string): void {
    this.content = content;
    if (this.textarea) this.textarea.value = content;
  }

  getContent(): string {
    return this.textarea?.value ?? this.content;
  }

  focus(): void {
    this.textarea?.focus();
  }
}

if (!customElements.get('xmdl-editor')) {
  customElements.define('xmdl-editor', XmdlEditor);
}
