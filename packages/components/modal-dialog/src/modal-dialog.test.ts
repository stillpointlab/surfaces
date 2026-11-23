import { expectNoHostileMarkup, HOSTILE_PAYLOAD } from '@stillpointlab/common-format/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './modal-dialog.js';

import type { ModalDialog } from './modal-dialog.js';

// jsdom has no layout, so the component's isVisible() check (offsetWidth /
// offsetHeight > 0) would reject every candidate. Give slotted controls a box.
function stubLayout(el: HTMLElement): void {
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: 120 });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: 24 });
}

/** open() focuses on the next frame; run the callback and settle. */
async function openAndSettle(dialog: ModalDialog): Promise<void> {
  const frame = new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  dialog.open();
  await frame;
}

function mount(bodyHtml: string): { dialog: ModalDialog; body: HTMLElement } {
  const dialog = document.createElement('modal-dialog') as ModalDialog;
  dialog.title = 'Test dialog';
  const body = document.createElement('div');
  body.setAttribute('slot', 'body');
  body.innerHTML = bodyHtml;
  dialog.appendChild(body);
  document.body.appendChild(dialog);
  body.querySelectorAll<HTMLElement>('input, button, textarea, select').forEach(stubLayout);
  return { dialog, body };
}

describe('ModalDialog focus on open', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // Regression: focus preferred the shadow root, so it landed on the × close
  // button — and because it runs on the next frame it also undid any page-side
  // input.focus()/select(). Every dialog with a text field was affected.
  it('focuses a slotted input rather than the shadow close button', async () => {
    const { dialog, body } = mount('<input id="field" type="text" />');
    const input = body.querySelector('#field') as HTMLInputElement;

    await openAndSettle(dialog);

    expect(document.activeElement).toBe(input);
  });

  it('prefers an explicit [autofocus] over document order', async () => {
    const { dialog, body } = mount(
      '<input id="first" type="text" /><input id="second" type="text" autofocus />'
    );
    const second = body.querySelector('#second') as HTMLInputElement;

    await openAndSettle(dialog);

    expect(document.activeElement).toBe(second);
  });

  // Pages mark the focus target with data-autofocus instead of the native
  // attribute: pre-upgrade, native autofocus would scroll the fresh page load
  // down to the (still in-flow) dialog markup.
  it('prefers an explicit [data-autofocus] over document order', async () => {
    const { dialog, body } = mount(
      '<input id="first" type="text" /><input id="second" type="text" data-autofocus />'
    );
    const second = body.querySelector('#second') as HTMLInputElement;

    await openAndSettle(dialog);

    expect(document.activeElement).toBe(second);
  });

  it('preserves focus placed inside the dialog before deferred autofocus runs', async () => {
    const { dialog, body } = mount(
      '<input id="title" type="text" value="Existing title" />' +
        '<input id="container" type="text" value="pantry" />'
    );
    const title = body.querySelector('#title') as HTMLInputElement;
    const container = body.querySelector('#container') as HTMLInputElement;
    const frame = new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    dialog.open();
    container.focus();
    container.select();
    await frame;

    expect(document.activeElement).toBe(container);
    expect(container.selectionStart).toBe(0);
    expect(container.selectionEnd).toBe('pantry'.length);
    expect(title.selectionEnd).toBe(0);
  });

  it('selects an existing value so typing replaces it', async () => {
    const { dialog, body } = mount('<input id="field" type="text" />');
    const input = body.querySelector('#field') as HTMLInputElement;
    input.value = 'existing title';

    await openAndSettle(dialog);

    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('existing title'.length);
  });

  it('leaves an empty input unselected and still focused', async () => {
    const { dialog, body } = mount('<input id="field" type="text" />');
    const input = body.querySelector('#field') as HTMLInputElement;

    await openAndSettle(dialog);

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(0);
  });

  it('falls back to the shadow root when nothing is slotted', async () => {
    const dialog = document.createElement('modal-dialog') as ModalDialog;
    dialog.title = 'Empty';
    document.body.appendChild(dialog);

    await openAndSettle(dialog);

    // The × close button lives in the shadow root; focus lands inside it.
    expect(dialog.shadowRoot?.activeElement).not.toBeNull();
  });

  it('skips a disabled slotted control', async () => {
    const { dialog, body } = mount(
      '<button id="nope" disabled>Disabled</button><input id="field" type="text" />'
    );
    const input = body.querySelector('#field') as HTMLInputElement;

    await openAndSettle(dialog);

    expect(document.activeElement).toBe(input);
  });
});

describe('ModalDialog close-on-overlay-click', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function closedCount(dialog: ModalDialog): () => number {
    let count = 0;
    dialog.addEventListener('modal-closed', () => (count += 1));
    return () => count;
  }

  it('closes on a click on the scrim', async () => {
    const { dialog } = mount('<button id="ok">OK</button>');
    dialog.setAttribute('close-on-overlay-click', '');
    const closed = closedCount(dialog);
    await openAndSettle(dialog);
    dialog.shadowRoot!.querySelector<HTMLElement>('.modal-overlay')!.click();
    expect(closed()).toBe(1);
  });

  it('stays open on a click inside the dialog, a slotted button included', async () => {
    const { dialog, body } = mount('<button id="ok">OK</button>');
    dialog.setAttribute('close-on-overlay-click', '');
    const closed = closedCount(dialog);
    await openAndSettle(dialog);
    let clicked = 0;
    const button = body.querySelector<HTMLButtonElement>('#ok')!;
    button.addEventListener('click', () => (clicked += 1));
    button.click();
    dialog.shadowRoot!.querySelector<HTMLElement>('.modal-body')!.click();
    expect(clicked).toBe(1);
    expect(closed()).toBe(0);
  });

  it('stays open on a click on the scrim without the attribute', async () => {
    const { dialog } = mount('<button id="ok">OK</button>');
    const closed = closedCount(dialog);
    await openAndSettle(dialog);
    dialog.shadowRoot!.querySelector<HTMLElement>('.modal-overlay')!.click();
    expect(closed()).toBe(0);
  });
});

describe('ModalDialog title', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  // Regression: the title went into innerHTML, and a caller's escaping does not
  // survive the attribute parser, so a typed name could render as markup.
  it('renders markup in the title as text', () => {
    const dialog = document.createElement('modal-dialog') as ModalDialog;
    const title = '<img src=x onerror="alert(1)"> is waiting on you';
    dialog.setAttribute('title', title);
    dialog.setAttribute('is-open', '');
    document.body.appendChild(dialog);

    const heading = dialog.shadowRoot!.querySelector('.modal-title')!;
    expect(heading.textContent).toBe(title);
    expect(heading.querySelector('img')).toBeNull();
    dialog.close();
  });

  it('keeps showing the title after it changes while open', () => {
    const dialog = document.createElement('modal-dialog') as ModalDialog;
    dialog.title = 'First';
    document.body.appendChild(dialog);
    dialog.open();
    dialog.title = 'Second';

    expect(dialog.shadowRoot!.querySelector('.modal-title')!.textContent).toBe('Second');
    dialog.close();
  });
});

describe('ModalDialog markup', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete (globalThis as { __hostile?: unknown }).__hostile;
  });

  it('writes no markup from a hostile title', () => {
    const dialog = document.createElement('modal-dialog') as ModalDialog;
    dialog.title = `Edit${HOSTILE_PAYLOAD}`;
    document.body.appendChild(dialog);
    dialog.open();

    expectNoHostileMarkup(dialog.shadowRoot!);
    expect(dialog.shadowRoot!.querySelector('.modal-title')!.textContent).toBe(
      `Edit${HOSTILE_PAYLOAD}`
    );
    dialog.close();
  });

  it('keeps its stylesheet first in the shadow root, closed and open', () => {
    const dialog = document.createElement('modal-dialog') as ModalDialog;
    document.body.appendChild(dialog);
    const shadow = dialog.shadowRoot!;
    const style = shadow.firstElementChild;

    expect(style!.tagName).toBe('STYLE');
    expect(style!.textContent).toContain('.modal');
    dialog.open();
    expect(shadow.firstElementChild).toBe(style);
    expect(shadow.querySelectorAll('style')).toHaveLength(1);
    dialog.close();
    expect(shadow.firstElementChild).toBe(style);
    expect(shadow.querySelector('.modal')).toBeNull();
  });
});

// jsdom moves no focus for a Tab key, so these do what a browser does: the key
// goes to the document, and then focus lands on whatever is next. Inside the
// dialog the next stop past either end is one of its two edges.
describe('ModalDialog body', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const section = (dialog: ModalDialog): Element =>
    dialog.shadowRoot!.querySelector('.modal-body')!;
  /** A MutationObserver's callback runs in a microtask. */
  const settle = (): Promise<void> => Promise.resolve();

  it('draws no body when nothing is slotted into it', () => {
    const dialog = document.createElement('modal-dialog') as ModalDialog;
    dialog.innerHTML = '<div slot="footer"><button>OK</button></div>';
    document.body.append(dialog);
    dialog.open();
    expect(section(dialog).hasAttribute('data-empty')).toBe(true);
  });

  it('draws the body when something is, and follows it while open', async () => {
    const { dialog, body } = mount('<p>Detail.</p>');
    dialog.open();
    expect(section(dialog).hasAttribute('data-empty')).toBe(false);

    body.hidden = true;
    await settle();
    expect(section(dialog).hasAttribute('data-empty')).toBe(true);
    body.hidden = false;
    await settle();
    expect(section(dialog).hasAttribute('data-empty')).toBe(false);

    body.remove();
    await settle();
    expect(section(dialog).hasAttribute('data-empty')).toBe(true);
    dialog.append(body);
    await settle();
    expect(section(dialog).hasAttribute('data-empty')).toBe(false);
  });

  it('still knows after the title changes while open', () => {
    const dialog = document.createElement('modal-dialog') as ModalDialog;
    document.body.append(dialog);
    dialog.open();
    dialog.title = 'Another';
    expect(section(dialog).hasAttribute('data-empty')).toBe(true);
  });
});

describe('ModalDialog keeps Tab inside', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  class Inner extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML =
        '<button id="one">one</button><button id="two">two</button>';
      this.shadowRoot?.querySelectorAll<HTMLElement>('button').forEach(stubLayout);
    }
  }
  if (!customElements.get('x-inner-stops')) customElements.define('x-inner-stops', Inner);

  const FOOTER = '<button id="cancel">Cancel</button><button id="save">Save</button>';

  async function opened(bodyHtml: string): Promise<ModalDialog> {
    const { dialog } = mount(bodyHtml);
    await openAndSettle(dialog);
    const close = dialog.shadowRoot?.querySelector<HTMLElement>('.modal-close-button');
    if (close) stubLayout(close);
    return dialog;
  }

  const closeButton = (dialog: ModalDialog): HTMLElement =>
    dialog.shadowRoot?.querySelector('.modal-close-button') as HTMLElement;

  const edge = (dialog: ModalDialog, which: 'start' | 'end'): HTMLElement =>
    dialog.shadowRoot?.querySelector(`.modal-edge[data-edge="${which}"]`) as HTMLElement;

  /** The key as the document hears it. Answers whether the dialog took it. */
  function tab(options: { shift?: boolean; prevented?: boolean } = {}): boolean {
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: options.shift ?? false,
      bubbles: true,
      cancelable: true,
    });
    if (options.prevented) event.preventDefault();
    document.dispatchEvent(event);
    return !options.prevented && event.defaultPrevented;
  }

  /** The focused element, followed down through shadow roots. */
  function focused(): Element | null {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
  }

  it('Shift+Tab from the close button goes to the last control', async () => {
    const dialog = await opened(`<input id="name" type="text" />${FOOTER}`);
    closeButton(dialog).focus();

    // Focus is in the dialog's shadow root, where the document sees only the dialog.
    expect(document.activeElement).toBe(dialog);
    expect(tab({ shift: true })).toBe(false);
    edge(dialog, 'start').focus();

    expect(focused()).toBe(dialog.querySelector('#save'));
  });

  it('Tab from the last control goes to the first', async () => {
    const dialog = await opened(`<input id="name" type="text" />${FOOTER}`);
    dialog.querySelector<HTMLElement>('#save')?.focus();

    expect(tab()).toBe(false);
    edge(dialog, 'end').focus();

    expect(focused()).toBe(closeButton(dialog));
  });

  it('counts the stops inside a slotted element’s own shadow root', async () => {
    const dialog = await opened('<button id="outer">outer</button><x-inner-stops></x-inner-stops>');
    const inner = dialog.querySelector('x-inner-stops') as HTMLElement;
    closeButton(dialog).focus();

    tab({ shift: true });
    edge(dialog, 'start').focus();

    expect(focused()).toBe(inner.shadowRoot?.querySelector('#two'));
  });

  it('leaves Tab alone while focus is inside such an element', async () => {
    const dialog = await opened('<button id="outer">outer</button><x-inner-stops></x-inner-stops>');
    const inner = dialog.querySelector('x-inner-stops') as HTMLElement;
    const last = inner.shadowRoot?.querySelector<HTMLElement>('#two');
    last?.focus();

    // The document sees the slotted element, not the button in it; the dialog must
    // not take that for focus having left.
    expect(tab()).toBe(false);
    expect(focused()).toBe(last);
  });

  it('goes forward to the first control from the start edge', async () => {
    // Tab with focus on the dialog itself (where it opens with nothing to focus)
    // lands on the start edge going forward.
    const dialog = await opened(`<input id="name" type="text" />${FOOTER}`);

    tab();
    edge(dialog, 'start').focus();

    expect(focused()).toBe(closeButton(dialog));
  });

  it('brings focus in from the page behind', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const dialog = await opened(`<input id="name" type="text" />${FOOTER}`);

    outside.focus();
    expect(tab()).toBe(true);
    expect(focused()).toBe(closeButton(dialog));

    outside.focus();
    expect(tab({ shift: true })).toBe(true);
    expect(focused()).toBe(dialog.querySelector('#save'));
  });

  it('with two open, leaves focus in the other one, and takes focus from the page for the one on top', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const under = await opened(`<input id="under" type="text" />${FOOTER}`);
    const over = await opened(`<input id="over" type="text" />${FOOTER}`);

    // Focus in the one on top: the one under it does not pull it away.
    over.querySelector<HTMLElement>('#over')!.focus();
    expect(tab()).toBe(false);
    expect(focused()).toBe(over.querySelector('#over'));
    // And in the one under: the key is the browser's there too.
    under.querySelector<HTMLElement>('#under')!.focus();
    expect(tab()).toBe(false);
    expect(focused()).toBe(under.querySelector('#under'));

    // From the page behind both, focus comes into the one opened last.
    outside.focus();
    expect(tab()).toBe(true);
    expect(focused()).toBe(closeButton(over));

    // Closed, the other one is the only one again.
    over.close();
    outside.focus();
    expect(tab()).toBe(true);
    expect(focused()).toBe(closeButton(under));
  });

  it('leaves alone a Tab that something inside took for itself', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    await opened(`<input id="name" type="text" />${FOOTER}`);
    outside.focus();

    expect(tab({ prevented: true })).toBe(false);
    expect(focused()).toBe(outside);
  });

  it('does not open with focus on an edge', async () => {
    const dialog = await opened('<p>Nothing to focus.</p>');

    expect(dialog.shadowRoot?.activeElement?.classList.contains('modal-edge')).toBe(false);
    expect(dialog.shadowRoot?.activeElement).not.toBeNull();
  });
});
