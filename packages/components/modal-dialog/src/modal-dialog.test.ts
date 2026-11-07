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
