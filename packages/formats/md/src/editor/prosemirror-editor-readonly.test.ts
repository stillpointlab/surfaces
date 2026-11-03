import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import './prosemirror-editor';

import type { ProseMirrorEditor } from './prosemirror-editor';

const CONTENT = '# Title\n\nSome text.';

describe('ProseMirrorEditor readonly', () => {
  beforeAll(() => {
    // ProseMirror's focus path uses execCommand for a Safari compatibility
    // workaround; jsdom does not provide the deprecated DOM method.
    if (typeof document.execCommand !== 'function') {
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: vi.fn(() => false),
      });
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function query<T extends Element>(el: ProseMirrorEditor, selector: string): T {
    const match = el.shadowRoot?.querySelector<T>(selector);
    if (!match) throw new Error(`Not found: ${selector}`);
    return match;
  }

  const blockquote = (el: ProseMirrorEditor) =>
    query<HTMLButtonElement>(el, '.toolbar-button[data-command="toggleBlockquote"]');
  const rawToggle = (el: ProseMirrorEditor) => query<HTMLButtonElement>(el, '.markdown-toggle');
  const rawTextarea = (el: ProseMirrorEditor) =>
    query<HTMLTextAreaElement>(el, 'textarea[data-spl-raw]');

  function contentChanges(el: ProseMirrorEditor): string[] {
    const seen: string[] = [];
    el.addEventListener('content-change', (event) => {
      seen.push((event as CustomEvent<{ content: string }>).detail.content);
    });
    return seen;
  }

  async function mount(readonly: boolean): Promise<ProseMirrorEditor> {
    const el = document.createElement('md-editor') as ProseMirrorEditor;
    if (readonly) el.setAttribute('readonly', 'true');
    el.setContent(CONTENT);
    document.body.append(el);
    await el.whenReady();
    return el;
  }

  it('disables the toolbar but not the raw switch when readonly is set before load', async () => {
    const el = await mount(true);

    expect(blockquote(el).disabled).toBe(true);
    expect(rawToggle(el).disabled).toBe(false);
    expect(query<HTMLElement>(el, '.ProseMirror').getAttribute('contenteditable')).toBe('false');
  });

  it('restores editing when readonly is removed', async () => {
    const el = await mount(true);
    const seen = contentChanges(el);

    blockquote(el).click();
    expect(seen).toEqual([]);
    expect(el.getContent()).toBe(CONTENT);

    el.removeAttribute('readonly');
    expect(blockquote(el).disabled).toBe(false);
    expect(query<HTMLElement>(el, '.ProseMirror').getAttribute('contenteditable')).toBe('true');

    blockquote(el).click();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('> ');
    expect(el.getContent()).toContain('> ');
  });

  it('keeps the raw view when readonly is set, with the raw text read-only', async () => {
    const el = await mount(false);
    const seen = contentChanges(el);

    rawToggle(el).click();
    await el.whenReady();
    expect(el.getAttribute('view')).toBe('raw');
    rawTextarea(el).value = '# Edited\n\nSome text.';
    rawTextarea(el).dispatchEvent(new Event('input', { bubbles: true }));
    expect(seen).toHaveLength(1);

    el.setAttribute('readonly', 'true');
    expect(el.getAttribute('view')).toBe('raw');
    expect(rawTextarea(el).readOnly).toBe(true);
    rawTextarea(el).value = 'ignored';
    rawTextarea(el).dispatchEvent(new Event('input', { bubbles: true }));
    expect(seen).toHaveLength(1);
    expect(el.getContent()).toBe('# Edited\n\nSome text.');

    // The switch still works: back to the (read-only) rich view, edit applied.
    expect(rawToggle(el).disabled).toBe(false);
    rawToggle(el).click();
    expect(el.getAttribute('view')).toBe('rich');
    expect(query<HTMLElement>(el, '.ProseMirror').textContent).toContain('Edited');
    expect(blockquote(el).disabled).toBe(true);
  });
});
