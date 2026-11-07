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
