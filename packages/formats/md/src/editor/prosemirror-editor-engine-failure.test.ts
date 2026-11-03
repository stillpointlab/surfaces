// When ProseMirror cannot load, the editor says so and still settles.
import { afterEach, describe, expect, it, vi } from 'vitest';

import './prosemirror-editor';

import type { ProseMirrorEditor } from './prosemirror-editor';

vi.mock('prosemirror-history', () => {
  throw new Error('engine unavailable');
});

afterEach(() => document.body.replaceChildren());

describe('md-editor when the engine fails to load', () => {
  it('shows the error status and settles, keeping the buffered content', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const el = document.createElement('md-editor') as ProseMirrorEditor;
    el.setContent('# Kept');
    document.body.append(el);

    await el.whenReady();

    const status = el.shadowRoot?.querySelector('.spl-status--error');
    expect(status?.textContent).toBe("Couldn't load the editor.");
    expect(status?.getAttribute('role')).toBe('alert');
    expect(el.getContent()).toBe('# Kept');
  });
});
