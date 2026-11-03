// When ProseMirror cannot load, the editor falls back to the raw text.
import { afterEach, describe, expect, it, vi } from 'vitest';

import './prosemirror-editor';

import type { ProseMirrorEditor } from './prosemirror-editor';

vi.mock('prosemirror-history', () => {
  throw new Error('engine unavailable');
});

afterEach(() => document.body.replaceChildren());

describe('md-editor when the engine fails to load', () => {
  it('shows the raw text with a notice, editable, and settles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const views: unknown[] = [];
    const changes: unknown[] = [];
    const el = document.createElement('md-editor') as ProseMirrorEditor;
    el.addEventListener('view-change', (event) => views.push((event as CustomEvent).detail));
    el.addEventListener('content-change', (event) => changes.push((event as CustomEvent).detail));
    el.setContent('# Kept');
    document.body.append(el);

    await el.whenReady();

    expect(el.getAttribute('view')).toBe('raw');
    expect(views).toEqual([{ view: 'raw', reason: 'fallback' }]);
    const notice = el.shadowRoot?.querySelector('.spl-notice');
    expect(notice?.textContent).toContain('could not load');
    expect(notice?.getAttribute('role')).toBe('status');
    const raw = el.shadowRoot?.querySelector<HTMLTextAreaElement>('textarea[data-spl-raw]');
    expect(raw?.value).toBe('# Kept');

    raw!.value = '# Kept, edited';
    raw!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(changes).toEqual([{ content: '# Kept, edited' }]);
    expect(el.getContent()).toBe('# Kept, edited');
  });

  it('retries the engine when switched back, and stays raw if it fails again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const el = document.createElement('md-editor') as ProseMirrorEditor;
    el.setContent('# Kept');
    document.body.append(el);
    await el.whenReady();
    const views: unknown[] = [];
    el.addEventListener('view-change', (event) => views.push((event as CustomEvent).detail));

    el.shadowRoot?.querySelector<HTMLButtonElement>('.markdown-toggle')?.click();
    await el.whenReady();

    expect(el.getAttribute('view')).toBe('raw');
    expect(views).toEqual([]);
    const notice = el.shadowRoot?.querySelector('.spl-notice');
    expect(notice?.textContent).toContain('still could not load');
    expect(notice?.getAttribute('role')).toBe('alert');
    expect(el.getContent()).toBe('# Kept');
  });
});
