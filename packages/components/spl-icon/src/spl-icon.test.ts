import { expectNoHostileMarkup, HOSTILE_PAYLOAD } from '@stillpointlab/common-format/testing';
import { afterEach, describe, expect, it } from 'vitest';

import './spl-icon';

function mount(attributes: Record<string, string>): HTMLElement {
  const icon = document.createElement('spl-icon');
  for (const [name, value] of Object.entries(attributes)) icon.setAttribute(name, value);
  document.body.appendChild(icon);
  return icon;
}

describe('<spl-icon>', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the named glyph', () => {
    const icon = mount({ 'icon-name': 'gear' });

    expect(icon.shadowRoot!.querySelector('.icon')!.getAttribute('data-icon')).toBe('gear');
  });

  it('carries size, padding and label to the rendered button', () => {
    const icon = mount({
      'icon-name': 'close',
      'data-size': 'small',
      'data-padding': 'none',
      'aria-label': 'Close',
    });

    const button = icon.shadowRoot!.querySelector('.spl-icon')!;
    expect(button.getAttribute('data-size')).toBe('small');
    expect(button.getAttribute('data-padding')).toBe('none');
    expect(button.getAttribute('aria-label')).toBe('Close');
  });

  it('leaves out size and padding that are not set', () => {
    const button = mount({ 'icon-name': 'close' }).shadowRoot!.querySelector('.spl-icon')!;

    expect(button.hasAttribute('data-size')).toBe(false);
    expect(button.hasAttribute('data-padding')).toBe(false);
  });

  it('re-renders when an attribute changes', () => {
    const icon = mount({ 'icon-name': 'gear' });

    icon.setAttribute('icon-name', 'trash');

    expect(icon.shadowRoot!.querySelector('.icon')!.getAttribute('data-icon')).toBe('trash');
  });
});

describe('<spl-icon> with hostile attributes', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete (globalThis as { __hostile?: unknown }).__hostile;
  });

  const attributes = ['icon-name', 'aria-label', 'data-size', 'data-padding'] as const;

  for (const name of attributes) {
    it(`writes no markup from ${name}, and the value reads back intact`, () => {
      const value = `x${HOSTILE_PAYLOAD}`;
      const icon = mount({ 'icon-name': 'gear', [name]: value });

      expectNoHostileMarkup(icon.shadowRoot!);
      const target =
        name === 'icon-name'
          ? icon.shadowRoot!.querySelector('.icon')!.getAttribute('data-icon')
          : icon.shadowRoot!.querySelector('.spl-icon')!.getAttribute(name);
      expect(target).toBe(value);
    });
  }

  it('keeps its nodes when an attribute changes', () => {
    const icon = mount({ 'icon-name': 'gear', 'aria-label': 'Settings' });
    const button = icon.shadowRoot!.querySelector('.spl-icon');

    icon.setAttribute('aria-label', `Settings${HOSTILE_PAYLOAD}`);
    icon.setAttribute('icon-name', 'trash');

    expect(icon.shadowRoot!.querySelector('.spl-icon')).toBe(button);
    expect(icon.shadowRoot!.children).toHaveLength(2);
    expectNoHostileMarkup(icon.shadowRoot!);
  });

  it('drops size and padding when they are removed', () => {
    const icon = mount({ 'icon-name': 'gear', 'data-size': 'small', 'data-padding': 'none' });

    icon.removeAttribute('data-size');
    icon.removeAttribute('data-padding');

    const button = icon.shadowRoot!.querySelector('.spl-icon')!;
    expect(button.hasAttribute('data-size')).toBe(false);
    expect(button.hasAttribute('data-padding')).toBe(false);
  });

  it('still renders the button as before: role, tab stop, label and stylesheet', () => {
    const icon = mount({ 'icon-name': 'gear' });

    const button = icon.shadowRoot!.querySelector('.spl-icon')!;
    expect(button.getAttribute('role')).toBe('button');
    expect(button.getAttribute('tabindex')).toBe('0');
    expect(button.getAttribute('aria-label')).toBe('');
    expect(icon.shadowRoot!.querySelector('style')!.textContent).toContain('.icon');
  });
});
