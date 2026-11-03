// Switching views never changes the text: md-editor returns the Markdown as set
// until the user edits in the rich view, however its serialiser would write it.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import './prosemirror-editor';

import type { ProseMirrorEditor } from './prosemirror-editor';

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

// Each of these was rewritten on load before (measured 2026-11-02).
const SAMPLES = {
  'underscore strong': '*a* and __b__\n',
  'star bullets': '* item\n* item2\n',
  'blank lines': '# T\n\n\n\nx',
  'two-space hard break': 'Line  \nnext',
  'parenthesis list': '1) one\n2) two\n',
  frontmatter: '---\ntitle: x\n---\n# H\n',
};

async function mount(content: string): Promise<ProseMirrorEditor> {
  const el = document.createElement('md-editor') as ProseMirrorEditor;
  el.setContent(content);
  document.body.append(el);
  await el.whenReady();
  return el;
}

const rawSwitch = (el: ProseMirrorEditor) =>
  el.shadowRoot!.querySelector<HTMLButtonElement>('.markdown-toggle')!;

describe('md-editor keeps the text as set', () => {
  for (const [name, text] of Object.entries(SAMPLES)) {
    it(`round-trips ${name} through load, raw and back`, async () => {
      const el = await mount(text);
      expect(el.getContent()).toBe(text);

      rawSwitch(el).click();
      await el.whenReady();
      expect(
        el.shadowRoot!.querySelector<HTMLTextAreaElement>('textarea[data-spl-raw]')?.value
      ).toBe(text);
      expect(el.getContent()).toBe(text);

      rawSwitch(el).click();
      await el.whenReady();
      expect(el.getContent()).toBe(text);
    });
  }

  it('returns the serialiser output after the first rich edit', async () => {
    const el = await mount(SAMPLES['blank lines']);
    el.shadowRoot!.querySelector<HTMLButtonElement>(
      '.toolbar-button[data-command="toggleBlockquote"]'
    )!.click();

    // The serialiser collapses the blank lines along with the edit.
    expect(el.getContent()).toBe('> # T\n\nx');

    // Raw then shows exactly that, and switching back keeps it.
    rawSwitch(el).click();
    await el.whenReady();
    const shown = el.getContent();
    expect(el.shadowRoot!.querySelector<HTMLTextAreaElement>('textarea[data-spl-raw]')?.value).toBe(
      shown
    );
    rawSwitch(el).click();
    await el.whenReady();
    expect(el.getContent()).toBe(shown);
  });

  it('applies a raw edit to the rich view on the way back, keeping its text', async () => {
    const el = await mount('# Title\n');
    rawSwitch(el).click();
    await el.whenReady();
    const area = el.shadowRoot!.querySelector<HTMLTextAreaElement>('textarea[data-spl-raw]')!;
    area.value = '* one\n* two\n';
    area.dispatchEvent(new Event('input', { bubbles: true }));

    rawSwitch(el).click();
    await el.whenReady();
    expect(el.shadowRoot!.querySelector('.ProseMirror ul')).not.toBeNull();
    expect(el.getContent()).toBe('* one\n* two\n');
  });
});
