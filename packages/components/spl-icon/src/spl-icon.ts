/// <reference lib="dom" />

// An icon button: one glyph from `icon.scss`, chosen by `icon-name`, drawn as a mask
// over `currentColor`. Moved from Context Manager.

import { defineElement } from '@stillpointlab/common-format/elements';

import { iconStyles } from './icon.styles';

export class SplIcon extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['icon-name', 'aria-label', 'data-size', 'data-padding'];
  }

  private readonly button: HTMLDivElement;
  private readonly glyph: HTMLSpanElement;

  // The shadow DOM is built once, and attribute changes only set attributes on it:
  // a label can carry text a person typed (a provider or model name), so it never
  // goes through markup.
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = iconStyles;
    this.button = document.createElement('div');
    this.button.className = 'spl-icon';
    this.button.setAttribute('role', 'button');
    this.button.setAttribute('tabindex', '0');
    this.glyph = document.createElement('span');
    this.glyph.className = 'icon';
    this.button.append(this.glyph);
    shadow.append(style, this.button);
    this.update();
  }

  connectedCallback(): void {
    this.update();
  }

  attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue !== newValue) this.update();
  }

  private update(): void {
    const size = this.getAttribute('data-size') || '';
    const padding = this.getAttribute('data-padding') || '';
    if (size) this.button.setAttribute('data-size', size);
    else this.button.removeAttribute('data-size');
    if (padding) this.button.setAttribute('data-padding', padding);
    else this.button.removeAttribute('data-padding');
    this.button.setAttribute('aria-label', this.getAttribute('aria-label') || '');
    this.glyph.setAttribute('data-icon', this.getAttribute('icon-name') || '');
  }
}

defineElement('spl-icon', SplIcon);
