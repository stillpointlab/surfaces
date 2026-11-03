// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { booleanAttribute, defineElement } from './elements';
import { setReporter } from './log';

describe('defineElement', () => {
  afterEach(() => setReporter(null));

  it('registers a free tag and returns the constructor', () => {
    class First extends HTMLElement {}
    expect(defineElement('spl-define-free', First)).toBe(First);
    expect(customElements.get('spl-define-free')).toBe(First);
  });

  it('is a no-op for the same constructor registered again', () => {
    class Again extends HTMLElement {}
    const reporter = vi.fn();
    setReporter(reporter);
    defineElement('spl-define-again', Again);
    expect(() => defineElement('spl-define-again', Again)).not.toThrow();
    expect(reporter).not.toHaveBeenCalled();
  });

  it('keeps the first constructor and warns when another copy registers', () => {
    class Original extends HTMLElement {}
    class Copy extends HTMLElement {}
    const reporter = vi.fn();
    setReporter(reporter);
    defineElement('spl-define-copy', Original);

    expect(defineElement('spl-define-copy', Copy)).toBe(Original);
    expect(customElements.get('spl-define-copy')).toBe(Original);
    expect(reporter).toHaveBeenCalledWith(expect.stringContaining('<spl-define-copy>'), {
      level: 'warn',
    });
  });
});

describe('booleanAttribute', () => {
  const el = (value?: string) => {
    const element = document.createElement('div');
    if (value !== undefined) element.setAttribute('opt', value);
    return element;
  };

  it('is on when present and not "false"', () => {
    expect(booleanAttribute(el(''), 'opt')).toBe(true);
    expect(booleanAttribute(el('true'), 'opt')).toBe(true);
    expect(booleanAttribute(el('yes'), 'opt')).toBe(true);
    expect(booleanAttribute(el('false'), 'opt')).toBe(false);
  });

  it('falls back to the default when absent', () => {
    expect(booleanAttribute(el(), 'opt')).toBe(false);
    expect(booleanAttribute(el(), 'opt', { defaultOn: true })).toBe(true);
    expect(booleanAttribute(el('false'), 'opt', { defaultOn: true })).toBe(false);
  });
});
