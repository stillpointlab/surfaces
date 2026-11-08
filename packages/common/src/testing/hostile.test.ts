// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { expectNoHostileMarkup, hostile, HOSTILE_PAYLOAD } from './hostile';

describe('hostile', () => {
  it('appends the payload to strings at every depth', () => {
    const state = { title: 'a', nested: { list: ['b', { deep: 'c' }] } };

    expect(hostile(state)).toEqual({
      title: `a${HOSTILE_PAYLOAD}`,
      nested: { list: [`b${HOSTILE_PAYLOAD}`, { deep: `c${HOSTILE_PAYLOAD}` }] },
    });
  });

  it('keeps object keys as they are', () => {
    const state = { fieldValues: { 'serial-no': 'x' } };

    expect(Object.keys(hostile(state).fieldValues)).toEqual(['serial-no']);
  });

  it('leaves numbers, booleans and null alone', () => {
    const state = { count: 3, enabled: false, missing: null, gone: undefined };

    expect(hostile(state)).toEqual(state);
  });

  it('keeps strings under the excepted property names, in arrays too', () => {
    const state = { mode: 'configured', kinds: ['a', 'b'], label: 'x' };

    expect(hostile(state, { except: ['mode', 'kinds'] })).toEqual({
      mode: 'configured',
      kinds: ['a', 'b'],
      label: `x${HOSTILE_PAYLOAD}`,
    });
  });

  it('does not change its input', () => {
    const state = { title: 'a', list: ['b'] };
    const before = structuredClone(state);

    hostile(state);

    expect(state).toEqual(before);
  });

  it('poisons a bare string', () => {
    expect(hostile('a')).toBe(`a${HOSTILE_PAYLOAD}`);
  });
});

describe('expectNoHostileMarkup', () => {
  afterEach(() => {
    document.body.replaceChildren();
    delete (globalThis as { __hostile?: unknown }).__hostile;
  });

  function unsafe(markup: string): HTMLElement {
    const root = document.createElement('div');
    // The point of this test: markup built without escaping.
    root.innerHTML = markup;
    document.body.append(root);
    return root;
  }

  it('passes for escaped text', () => {
    const root = document.createElement('div');
    root.textContent = `a${HOSTILE_PAYLOAD}`;

    expect(() => expectNoHostileMarkup(root)).not.toThrow();
  });

  it('fails when the payload opened an element in text', () => {
    const root = unsafe(`<p>a${HOSTILE_PAYLOAD}</p>`);

    expect(() => expectNoHostileMarkup(root)).toThrow(/<img data-hostile>/);
  });

  it('fails when the payload broke out of an attribute', () => {
    const root = unsafe(`<p title="a${HOSTILE_PAYLOAD}"></p>`);

    expect(() => expectNoHostileMarkup(root)).toThrow(/<p> has a data-hostile-attr attribute/);
  });

  it('fails when the payload broke out of a single-quoted attribute', () => {
    const root = unsafe(`<p title='a${HOSTILE_PAYLOAD}'></p>`);

    expect(() => expectNoHostileMarkup(root)).toThrow(/data-hostile-attr/);
  });

  it('looks inside open shadow roots', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<span>${HOSTILE_PAYLOAD}</span>`;
    const root = document.createElement('div');
    root.append(host);

    expect(() => expectNoHostileMarkup(root)).toThrow(/<img data-hostile>/);
  });

  it('checks a shadow root passed as the root', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<span>${HOSTILE_PAYLOAD}</span>`;

    expect(() => expectNoHostileMarkup(shadow)).toThrow(/<img data-hostile>/);
  });

  it('fails when the payload ran', () => {
    (globalThis as { __hostile?: unknown }).__hostile = 1;

    expect(() => expectNoHostileMarkup(document.createElement('div'))).toThrow(/__hostile/);
  });
});
