// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HostMenu } from './menu';

import type { MenuEntry } from './menu';

let menu: HostMenu;
let chosen: string[];
let opener: HTMLButtonElement;

function entries(...labels: string[]): MenuEntry[] {
  return labels.map((label) => ({ label, action: () => chosen.push(label) }));
}

const items = () => [...menu.element.querySelectorAll<HTMLElement>('[role="menuitem"]')];
const focused = () => document.activeElement?.textContent;

function key(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

beforeEach(() => {
  chosen = [];
  opener = document.createElement('button');
  opener.textContent = 'opener';
  document.body.append(opener);
  opener.focus();
  menu = new HostMenu(document.body);
});

afterEach(() => {
  menu.destroy();
  document.body.replaceChildren();
});

describe('opening', () => {
  it('is a menu of menuitems at the point, with focus on the first', () => {
    menu.open({ x: 30, y: 40, entries: entries('Rename…', 'Delete…'), label: 'Options for a.md' });
    expect(menu.isOpen).toBe(true);
    expect(menu.element.hidden).toBe(false);
    expect(menu.element.getAttribute('role')).toBe('menu');
    expect(menu.element.getAttribute('aria-label')).toBe('Options for a.md');
    expect(items().map((item) => [item.getAttribute('role'), item.textContent])).toEqual([
      ['menuitem', 'Rename…'],
      ['menuitem', 'Delete…'],
    ]);
    expect(menu.element.style.left).toBe('30px');
    expect(menu.element.style.top).toBe('40px');
    expect(focused()).toBe('Rename…');
  });

  it('opens nothing for no entries', () => {
    menu.open({ x: 0, y: 0, entries: [] });
    expect(menu.isOpen).toBe(false);
    expect(menu.element.hidden).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it('is one menu: opening again replaces what it showed', () => {
    menu.open({ x: 0, y: 0, entries: entries('One') });
    menu.open({ x: 5, y: 5, entries: entries('Two', 'Three') });
    expect(items().map((item) => item.textContent)).toEqual(['Two', 'Three']);
    expect(document.querySelectorAll('.host-menu')).toHaveLength(1);
  });

  it('marks a danger entry and a disabled one, with its reason', () => {
    menu.open({
      x: 0,
      y: 0,
      entries: [
        { label: 'Delete…', action: () => undefined, danger: true },
        { label: 'Rename…', action: () => undefined, disabled: true, title: 'Not here.' },
      ],
    });
    const [remove, rename] = items();
    expect(remove!.classList.contains('host-menu-danger')).toBe(true);
    expect(rename!.getAttribute('aria-disabled')).toBe('true');
    expect(rename!.title).toBe('Not here.');
  });

  it('stays inside the viewport near the right and bottom edges', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(400);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(300);
    vi.spyOn(menu.element, 'getBoundingClientRect').mockReturnValue({
      width: 160,
      height: 100,
    } as DOMRect);
    menu.open({ x: 380, y: 280, entries: entries('One') });
    // Left of the point by as much as it must, and above it.
    expect(menu.element.style.left).toBe(`${400 - 4 - 160}px`);
    expect(menu.element.style.top).toBe(`${280 - 100}px`);
    // Taller than the room above the point: as low as it can go.
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(120);
    menu.open({ x: 10, y: 60, entries: entries('One') });
    expect(menu.element.style.top).toBe('16px');
    expect(menu.element.style.left).toBe('10px');
    vi.restoreAllMocks();
  });
});

describe('the keyboard', () => {
  beforeEach(() => {
    menu.open({ x: 0, y: 0, entries: entries('New file…', 'Rename…', 'Delete…') });
  });

  it('Down and Up move and wrap; Home and End go to the ends', () => {
    key('ArrowDown');
    expect(focused()).toBe('Rename…');
    key('ArrowDown');
    key('ArrowDown');
    expect(focused()).toBe('New file…');
    key('ArrowUp');
    expect(focused()).toBe('Delete…');
    key('Home');
    expect(focused()).toBe('New file…');
    key('End');
    expect(focused()).toBe('Delete…');
  });

  it('a letter moves to the next entry that starts with it', () => {
    key('d');
    expect(focused()).toBe('Delete…');
    key('r');
    expect(focused()).toBe('Rename…');
  });

  it('Enter chooses: the menu closes, focus goes back, then the action runs', () => {
    let focusWhenRun: Element | null = null;
    menu.open({
      x: 0,
      y: 0,
      entries: [{ label: 'Go', action: () => (focusWhenRun = document.activeElement) }],
    });
    key('Enter');
    expect(menu.isOpen).toBe(false);
    expect(focusWhenRun).toBe(opener);
  });

  it('Space chooses as well', () => {
    key('ArrowDown');
    key(' ');
    expect(chosen).toEqual(['Rename…']);
  });

  it('Escape closes with no choice and gives focus back; the key goes no further', () => {
    const heard = vi.fn();
    document.addEventListener('keydown', heard);
    const event = key('Escape');
    document.removeEventListener('keydown', heard);
    expect(menu.isOpen).toBe(false);
    expect(chosen).toEqual([]);
    expect(document.activeElement).toBe(opener);
    expect(event.defaultPrevented).toBe(true);
    expect(heard).not.toHaveBeenCalled();
  });

  it('Tab closes it too', () => {
    key('Tab');
    expect(menu.isOpen).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('gives focus where the request says, in place of the opener', () => {
    const row = document.createElement('div');
    row.tabIndex = -1;
    document.body.append(row);
    menu.open({ x: 0, y: 0, entries: entries('One'), returnFocus: () => row.focus() });
    key('Escape');
    expect(document.activeElement).toBe(row);
  });

  it('a disabled entry is reached but not chosen', () => {
    menu.open({
      x: 0,
      y: 0,
      entries: [{ label: 'Off', action: () => chosen.push('Off'), disabled: true }],
    });
    expect(focused()).toBe('Off');
    key('Enter');
    expect(chosen).toEqual([]);
    expect(menu.isOpen).toBe(true);
  });
});

describe('the pointer and the window', () => {
  beforeEach(() => {
    menu.open({ x: 0, y: 0, entries: entries('Rename…', 'Delete…') });
  });

  it('a click on an entry chooses it', () => {
    items()[1]!.click();
    expect(chosen).toEqual(['Delete…']);
    expect(menu.isOpen).toBe(false);
  });

  it('a press outside closes it with no choice, leaving focus alone', () => {
    const elsewhere = document.createElement('input');
    document.body.append(elsewhere);
    elsewhere.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(menu.isOpen).toBe(false);
    expect(chosen).toEqual([]);
    // A press inside does not.
    menu.open({ x: 0, y: 0, entries: entries('One') });
    items()[0]!.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(menu.isOpen).toBe(true);
  });

  it('closes when the page scrolls or the window resizes', () => {
    document.body.dispatchEvent(new Event('scroll'));
    expect(menu.isOpen).toBe(false);
    menu.open({ x: 0, y: 0, entries: entries('One') });
    window.dispatchEvent(new Event('resize'));
    expect(menu.isOpen).toBe(false);
  });

  it('closes when focus leaves it for something else', () => {
    const elsewhere = document.createElement('input');
    document.body.append(elsewhere);
    elsewhere.focus();
    expect(menu.isOpen).toBe(false);
  });
});
