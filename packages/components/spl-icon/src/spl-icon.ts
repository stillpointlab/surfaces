/// <reference lib="dom" />

// An icon button: one glyph from `icon.scss`, chosen by `icon-name`, drawn as a mask
// over `currentColor`. Moved from Context Manager.

import { defineElement } from '@stillpointlab/common-format/elements';

import { iconStyles } from './icon.styles';

export class SplIcon extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['icon-name', 'aria-label', 'data-size', 'data-padding'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
    if (oldValue !== newValue) {
      this.render();
    }
  }

  private render(): void {
    const iconName = this.getAttribute('icon-name') || '';
    const ariaLabel = this.getAttribute('aria-label') || '';
    const size = this.getAttribute('data-size') || '';
    const padding = this.getAttribute('data-padding') || '';

    this.shadowRoot!.innerHTML = `
      <style>
        ${iconStyles}
      </style>

      <div
        class="spl-icon"
        ${size ? `data-size="${size}"` : ''}
        ${padding ? `data-padding="${padding}"` : ''}
        aria-label="${ariaLabel}"
        role="button"
        tabindex="0"
      >
        <span class="icon" data-icon="${iconName}"></span>
      </div>
    `;
  }
}

defineElement('spl-icon', SplIcon);
