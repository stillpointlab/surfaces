// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setReporter } from './log';
import {
  dismissOnOutside,
  isReadonly,
  moveToolbarFocus,
  reflectReadonly,
  setToolbarTabStop,
} from './toolbar';

afterEach(() => {
  document.body.replaceChildren();
  setReporter(null);
});

function toolbar(labels: string[], disabled: string[] = []) {
  const bar = document.createElement('div');
  const items = labels.map((label) => {
    const button = document.createElement('button');
    button.textContent = label;
    button.disabled = disabled.includes(label);
    bar.append(button);
    return button;
  });
  document.body.append(bar);
  return items;
}

const key = (target: HTMLElement, name: string) => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'target', { value: target });
  return event;
};

describe('setToolbarTabStop', () => {
  it('gives the preferred item the only tab stop', () => {
    const [a, b, c] = toolbar(['a', 'b', 'c']);
    expect(setToolbarTabStop([a, b, c], b)).toBe(b);
    expect([a.tabIndex, b.tabIndex, c.tabIndex]).toEqual([-1, 0, -1]);
  });

  it('falls back to the first enabled item when the preferred one is disabled', () => {
    const [a, b, c] = toolbar(['a', 'b', 'c'], ['a', 'c']);
    expect(setToolbarTabStop([a, b, c], c)).toBe(b);
    expect([a.tabIndex, b.tabIndex, c.tabIndex]).toEqual([-1, 0, -1]);
  });
});

describe('moveToolbarFocus', () => {
  it('moves right and left with wrapping, skipping disabled items', () => {
    const items = toolbar(['a', 'b', 'c', 'd'], ['c']);
    const [a, b, , d] = items;

    expect(moveToolbarFocus(key(a, 'ArrowRight'), items)).toBe(b);
    expect(document.activeElement).toBe(b);
    expect(moveToolbarFocus(key(b, 'ArrowRight'), items)).toBe(d);
    expect(moveToolbarFocus(key(d, 'ArrowRight'), items)).toBe(a);
    expect(moveToolbarFocus(key(a, 'ArrowLeft'), items)).toBe(d);
    expect(d.tabIndex).toBe(0);
    expect(a.tabIndex).toBe(-1);
  });

  it('goes to the ends with Home and End and prevents the default', () => {
    const items = toolbar(['a', 'b', 'c']);
    const end = key(items[1], 'End');
    expect(moveToolbarFocus(end, items)).toBe(items[2]);
    expect(end.defaultPrevented).toBe(true);
    expect(moveToolbarFocus(key(items[2], 'Home'), items)).toBe(items[0]);
  });

  it('leaves other keys alone', () => {
    const items = toolbar(['a', 'b']);
    const enter = key(items[0], 'Enter');
    expect(moveToolbarFocus(enter, items)).toBeNull();
    expect(enter.defaultPrevented).toBe(false);
  });

  it('finds the item that contains the event target', () => {
    const items = toolbar(['a', 'b']);
    const icon = document.createElement('span');
    items[0].append(icon);
    expect(moveToolbarFocus(key(icon, 'ArrowRight'), items)).toBe(items[1]);
  });
});

describe('dismissOnOutside', () => {
  const pointerdown = (target: EventTarget) =>
    target.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));

  it('closes on a pointer outside, ignores one inside, and disposes', () => {
    const menu = document.createElement('div');
    const outside = document.createElement('div');
    document.body.append(menu, outside);
    const close = vi.fn();
    const dispose = dismissOnOutside(menu, { isOpen: () => true, close });

    pointerdown(menu);
    expect(close).not.toHaveBeenCalled();
    pointerdown(outside);
    expect(close).toHaveBeenCalledWith('outside');

    dispose();
    pointerdown(outside);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('treats a click inside a shadow root of the menu as inside', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const menu = document.createElement('div');
    const item = document.createElement('button');
    menu.append(item);
    const elsewhere = document.createElement('button');
    root.append(menu, elsewhere);
    const close = vi.fn();
    dismissOnOutside(menu, { isOpen: () => true, close });

    pointerdown(item);
    expect(close).not.toHaveBeenCalled();
    pointerdown(elsewhere);
    expect(close).toHaveBeenCalledWith('outside');
  });

  it('accepts several inside elements and does nothing while closed', () => {
    const menu = document.createElement('div');
    const trigger = document.createElement('button');
    const outside = document.createElement('div');
    document.body.append(menu, trigger, outside);
    const close = vi.fn();
    let open = false;
    dismissOnOutside(() => [menu, trigger], { isOpen: () => open, close });

    pointerdown(outside);
    expect(close).not.toHaveBeenCalled();
    open = true;
    pointerdown(trigger);
    expect(close).not.toHaveBeenCalled();
    pointerdown(outside);
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes on Escape unless the element handles it', () => {
    const close = vi.fn();
    const menu = document.createElement('div');
    dismissOnOutside(menu, { isOpen: () => true, close });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(close).toHaveBeenCalledWith('escape');

    const own = vi.fn();
    dismissOnOutside(menu, { isOpen: () => true, close: own, escape: false });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(own).not.toHaveBeenCalled();
  });
});

describe('readonly helpers', () => {
  it('isReadonly is the contract value "true" only', () => {
    const el = document.createElement('div');
    expect(isReadonly(el)).toBe(false);
    el.setAttribute('readonly', '');
    expect(isReadonly(el)).toBe(false);
    el.setAttribute('readonly', 'true');
    expect(isReadonly(el)).toBe(true);
  });

  it('reflectReadonly mirrors the attribute, or an explicit state, as aria-readonly', () => {
    const el = document.createElement('div');
    const root = document.createElement('div');
    reflectReadonly(el, root);
    expect(root.getAttribute('aria-readonly')).toBe('false');
    el.setAttribute('readonly', 'true');
    reflectReadonly(el, root);
    expect(root.getAttribute('aria-readonly')).toBe('true');
    reflectReadonly(el, root, false);
    expect(root.getAttribute('aria-readonly')).toBe('false');
  });

  it('reflectReadonly warns when there is no editing root', () => {
    const reporter = vi.fn();
    setReporter(reporter);
    reflectReadonly(document.createElement('md-editor'), null);
    expect(reporter).toHaveBeenCalledWith(expect.stringContaining('<md-editor>'), {
      level: 'warn',
    });
  });
});
