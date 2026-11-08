// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { html, render } from './html';
import { expectNoHostileMarkup, HOSTILE_PAYLOAD } from './testing/hostile';

const hostileText = `Attic${HOSTILE_PAYLOAD}`;

describe('render', () => {
  afterEach(() => {
    document.body.replaceChildren();
    delete (globalThis as { __hostile?: unknown }).__hostile;
  });

  it('sets the markup html built', () => {
    const target = document.createElement('div');

    render(target, html`<p class="a">${'text'}</p>`);

    expect(target.innerHTML).toBe('<p class="a">text</p>');
  });

  it('replaces what was there', () => {
    const target = document.createElement('div');
    target.append(document.createElement('span'));

    render(target, html`<i></i>`);

    expect(target.children).toHaveLength(1);
    expect(target.firstElementChild!.tagName).toBe('I');
  });

  it('renders into a shadow root', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });

    render(shadow, html`<b>${'<i>'}</b>`);

    expect(shadow.querySelector('b')!.textContent).toBe('<i>');
  });

  it('refuses a plain string', () => {
    const target = document.createElement('div');

    expect(() => render(target, '<b>' as never)).toThrow(TypeError);
    expect(target.innerHTML).toBe('');
  });

  it('makes no element from a hostile string in text, and it reads back intact', () => {
    const target = document.createElement('div');
    document.body.append(target);

    render(target, html`<p>${hostileText}</p>`);

    expectNoHostileMarkup(target);
    expect(target.children).toHaveLength(1);
    expect(target.querySelector('p')!.textContent).toBe(hostileText);
  });

  it('makes no attribute from a hostile string in a double- or single-quoted attribute', () => {
    const target = document.createElement('div');
    document.body.append(target);

    render(target, html`<p title="${hostileText}"></p><p title='${hostileText}'></p>`);

    expectNoHostileMarkup(target);
    for (const p of target.querySelectorAll('p')) {
      expect(p.getAttributeNames()).toEqual(['title']);
      expect(p.getAttribute('title')).toBe(hostileText);
    }
  });
});
