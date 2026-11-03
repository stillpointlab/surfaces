import { TextSelection } from 'prosemirror-state';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import './prosemirror-editor';

import type { ProseMirrorEditor } from './prosemirror-editor';
import type { EditorView } from 'prosemirror-view';

beforeAll(() => {
  // ProseMirror's focus path uses execCommand, which jsdom does not provide.
  if (typeof document.execCommand !== 'function') {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    });
  }
});

afterEach(() => document.body.replaceChildren());

async function mount(content = '# Title\n\nplain **bold** text'): Promise<ProseMirrorEditor> {
  const el = document.createElement('md-editor') as ProseMirrorEditor;
  el.setContent(content);
  document.body.append(el);
  await el.whenReady();
  return el;
}

const $ = <T extends Element>(el: ProseMirrorEditor, selector: string) =>
  el.shadowRoot!.querySelector<T>(selector)!;
const press = (target: HTMLElement, key: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe('md-editor toolbar', () => {
  it('is a labelled toolbar whose icon buttons have accessible names', async () => {
    const el = await mount();
    const toolbar = $(el, '.prosemirror-editor-toolbar');
    expect(toolbar.getAttribute('role')).toBe('toolbar');
    expect(toolbar.getAttribute('aria-label')).toBe('Formatting');
    expect($(el, '[data-command="toggleBold"]').getAttribute('aria-label')).toBe('Bold (Ctrl+B)');
    expect($(el, '[data-popover="link"]').getAttribute('aria-label')).toBe('Add Link (Ctrl+K)');
    const unnamed = [...toolbar.querySelectorAll<HTMLButtonElement>('.toolbar-button')].filter(
      (button) => !button.getAttribute('aria-label') && !button.textContent?.trim()
    );
    expect(unnamed).toEqual([]);
  });

  it('exposes pressed state for toggle commands', async () => {
    const el = await mount();
    const bold = $(el, '[data-command="toggleBold"]');
    expect(bold.getAttribute('aria-pressed')).toBe('false');

    const view = (el as unknown as { view: EditorView }).view;
    let start = 0;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'bold') start = pos;
    });
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, start + 1, start + 3))
    );
    expect(bold.getAttribute('aria-pressed')).toBe('true');
  });

  it('tracks popover state and closes on Escape or an outside pointer', async () => {
    const el = await mount();
    const heading = $<HTMLButtonElement>(el, '[data-popover="heading"]');
    expect(heading.getAttribute('aria-haspopup')).toBe('menu');
    expect(heading.getAttribute('aria-expanded')).toBe('false');
    expect($(el, '[data-popover="link"]').getAttribute('aria-haspopup')).toBe('dialog');

    heading.click();
    expect(heading.getAttribute('aria-expanded')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(heading.getAttribute('aria-expanded')).toBe('false');

    heading.click();
    expect(heading.getAttribute('aria-expanded')).toBe('true');
    heading.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(heading.getAttribute('aria-expanded')).toBe('true');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(heading.getAttribute('aria-expanded')).toBe('false');
    expect(el.shadowRoot!.querySelector('.toolbar-popover.is-open')).toBeNull();
  });

  it('moves focus between top-level controls with one tab stop', async () => {
    const el = await mount();
    const toolbar = $(el, '.prosemirror-editor-toolbar');
    // Top-level controls only; buttons inside a closed popover are hidden.
    const stops = () =>
      [...toolbar.querySelectorAll<HTMLElement>('.toolbar-button, .spl-switch')].filter(
        (control) => !control.closest('.toolbar-popover') && control.tabIndex === 0
      );
    expect(stops()).toHaveLength(1);

    const bold = $<HTMLButtonElement>(el, '[data-command="toggleBold"]');
    bold.focus();
    press(bold, 'ArrowRight');
    expect(el.shadowRoot!.activeElement).toBe($(el, '[data-command="toggleItalic"]'));
    press(el.shadowRoot!.activeElement as HTMLElement, 'End');
    expect(el.shadowRoot!.activeElement).toBe($(el, '.markdown-toggle'));
    expect(stops()).toEqual([$(el, '.markdown-toggle')]);
  });

  it('gives hidden controls no tab stop when compact mode changes', async () => {
    const el = await mount();
    const toolbar = $(el, '.prosemirror-editor-toolbar');
    const overflow = $<HTMLButtonElement>(el, '[data-popover="overflow"]');
    expect(toolbar.classList.contains('is-compact')).toBe(false);
    expect(overflow.tabIndex).toBe(-1);

    // Force the narrow measurement the ResizeObserver would react to.
    Object.defineProperty(toolbar, 'scrollWidth', { configurable: true, value: 500 });
    Object.defineProperty(toolbar, 'clientWidth', { configurable: true, value: 200 });
    (el as unknown as { toolbar: { updateOverflow(): void } }).toolbar.updateOverflow();

    expect(toolbar.classList.contains('is-compact')).toBe(true);
    const collapsed = $<HTMLButtonElement>(
      el,
      '[data-collapsible] [data-command="toggleBlockquote"]'
    );
    expect(collapsed.tabIndex).toBe(-1);
    const stops = [...toolbar.querySelectorAll<HTMLElement>('.toolbar-button, .spl-switch')].filter(
      (control) => !control.closest('.toolbar-popover') && control.tabIndex === 0
    );
    expect(stops).toHaveLength(1);
  });

  it('reflects readonly as aria-readonly on the editing surface', async () => {
    const el = await mount();
    const surface = $(el, '.ProseMirror');
    expect(surface.getAttribute('aria-readonly')).toBe('false');
    el.setAttribute('readonly', 'true');
    expect(surface.getAttribute('aria-readonly')).toBe('true');
    expect($<HTMLButtonElement>(el, '.markdown-toggle').disabled).toBe(true);
    el.removeAttribute('readonly');
    expect(surface.getAttribute('aria-readonly')).toBe('false');
  });
});
