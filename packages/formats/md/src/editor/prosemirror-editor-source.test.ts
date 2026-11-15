// A rich edit rewrites the block it changed and no other: md-editor writes the
// rest of the text back as it was set (see markdown-source.ts).
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

const REST = [
  'A paragraph\nwrapped by hand\nover three lines.',
  '* star bullets\n* in a list\n\n* that is loose',
  'Setext\n------',
  'The last paragraph.',
].join('\n\n');

const TEXT = `---\ncolumn: todo\n---\n\n# Title\n\nFirst paragraph.\n\n${REST}\n`;

async function mount(content: string): Promise<ProseMirrorEditor> {
  const el = document.createElement('md-editor') as ProseMirrorEditor;
  el.setContent(content);
  document.body.append(el);
  await el.whenReady();
  return el;
}

const viewOf = (el: ProseMirrorEditor): EditorView => (el as unknown as { view: EditorView }).view;

/** Type `text` at the end of the first block whose text is `block`, as a keystroke would. */
function typeAfter(el: ProseMirrorEditor, block: string, text: string): void {
  const view = viewOf(el);
  let end = -1;
  view.state.doc.forEach((node, offset) => {
    if (node.textContent === block) end = offset + node.nodeSize - 1;
  });
  if (end < 0) throw new Error(`no block reads ${JSON.stringify(block)}`);
  view.dispatch(view.state.tr.insertText(text, end));
}

describe('md-editor rewrites only what a rich edit changed', () => {
  it('keeps every other block as it was set', async () => {
    const el = await mount(TEXT);

    typeAfter(el, 'First paragraph.', ' And more.');

    expect(el.getContent()).toBe(TEXT.replace('First paragraph.', 'First paragraph. And more.'));
  });

  it('sends the same text with content-change', async () => {
    const el = await mount(TEXT);
    const sent: string[] = [];
    el.addEventListener('content-change', (event) =>
      sent.push((event as CustomEvent<{ content: string }>).detail.content)
    );

    typeAfter(el, 'The last paragraph.', ' Edited.');

    expect(sent).toEqual([TEXT.replace('The last paragraph.', 'The last paragraph. Edited.')]);
    expect(el.getContent()).toBe(sent[0]);
  });

  it('keeps on keeping through later edits', async () => {
    const el = await mount(TEXT);

    typeAfter(el, 'First paragraph.', ' One.');
    typeAfter(el, 'Title', ' Two');

    expect(el.getContent()).toBe(
      TEXT.replace('First paragraph.', 'First paragraph. One.').replace('# Title', '# Title Two')
    );
  });

  it('gives back the text as set once an edit is undone by hand', async () => {
    const el = await mount(TEXT);
    typeAfter(el, 'First paragraph.', '!');
    const view = viewOf(el);
    let end = -1;
    view.state.doc.forEach((node, offset) => {
      if (node.textContent === 'First paragraph.!') end = offset + node.nodeSize - 1;
    });
    view.dispatch(view.state.tr.delete(end - 1, end));

    expect(el.getContent()).toBe(TEXT);
  });

  it('keeps the text set after the first: a second setContent is a new source', async () => {
    const el = await mount('Old text.\n');
    el.setContent(TEXT);
    await el.whenReady();

    typeAfter(el, 'First paragraph.', ' And more.');

    expect(el.getContent()).toBe(TEXT.replace('First paragraph.', 'First paragraph. And more.'));
  });

  it('keeps the text after a raw edit and a switch back to rich', async () => {
    const el = await mount('Old text.\n');
    // The toolbar is rendered again with each view, so the switch is looked up each time.
    const rawSwitch = () => el.shadowRoot!.querySelector<HTMLButtonElement>('.markdown-toggle')!;
    rawSwitch().click();
    await el.whenReady();
    const raw = el.shadowRoot!.querySelector<HTMLTextAreaElement>('textarea[data-spl-raw]')!;
    raw.value = TEXT;
    raw.dispatchEvent(new Event('input', { bubbles: true }));
    rawSwitch().click();
    await el.whenReady();

    typeAfter(el, 'First paragraph.', ' And more.');

    expect(el.getContent()).toBe(TEXT.replace('First paragraph.', 'First paragraph. And more.'));
  });
});
