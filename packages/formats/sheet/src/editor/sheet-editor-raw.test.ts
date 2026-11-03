// The sheet's raw view: the CSV, or a .sheet document's whole source, as text.
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_CSV_LIMITS } from '../csv';

import { SheetEditor } from './sheet-editor';

import type { SheetContentOptions } from '../presentation/presentation';

afterEach(() => document.body.replaceChildren());

const DOCUMENT =
  '---\nsheet: stillpoint/v1\npresentation:\n  formats:\n    - range: A1\n      bold: true\n---\na,b\n1,2';

function mount(load: (el: SheetEditor) => void): SheetEditor {
  const element = new SheetEditor();
  load(element);
  document.body.append(element);
  return element;
}

const rawSwitch = (el: SheetEditor) =>
  el.shadowRoot!.querySelector<HTMLButtonElement>('.spl-switch[aria-label="Raw Text"]')!;
const rawArea = (el: SheetEditor) =>
  el.shadowRoot!.querySelector<HTMLTextAreaElement>('textarea[data-spl-raw]')!;
const cell = (el: SheetEditor, row: number, column: number) =>
  el.shadowRoot!.querySelector<HTMLTableCellElement>(
    `td[data-row="${row}"][data-column="${column}"]`
  )!;
const typeRaw = (el: SheetEditor, text: string) => {
  rawArea(el).value = text;
  rawArea(el).dispatchEvent(new Event('input', { bubbles: true }));
};
const key = (name: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
const changes = (el: SheetEditor) => {
  const seen: string[] = [];
  el.addEventListener('content-change', (event) =>
    seen.push((event as CustomEvent<{ content: string }>).detail.content)
  );
  return seen;
};

describe('sheet-editor raw view', () => {
  it('shows a document source whole, frontmatter included, and keeps it byte-identical', () => {
    const el = mount((e) => e.setDocumentSource(DOCUMENT));
    rawSwitch(el).click();
    expect(rawArea(el).value).toBe(DOCUMENT);
    rawSwitch(el).click();
    expect(el.getAttribute('view')).toBe('rich');
    expect(el.getContent()).toBe(DOCUMENT);
    expect(cell(el, 0, 0).classList.contains('sheet-table__cell--bold')).toBe(true);
  });

  it('reloads a raw edit with the presentation the host passed', () => {
    const options: SheetContentOptions = {
      presentation: {
        alignments: [
          { range: { startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 }, horizontal: 'center' },
        ],
      },
    };
    const el = mount((e) => e.setContent('a,b', options));
    expect(cell(el, 0, 0).classList.contains('sheet-table__cell--align-center')).toBe(true);

    rawSwitch(el).click();
    typeRaw(el, 'x,y');
    rawSwitch(el).click();

    expect(cell(el, 0, 0).textContent).toBe('x');
    expect(cell(el, 0, 0).classList.contains('sheet-table__cell--align-center')).toBe(true);
    expect(el.getContent()).toBe('x,y');
  });

  it('opens a sheet over the row limit in raw, and shows it read-only when switched', () => {
    const source = Array.from({ length: DEFAULT_CSV_LIMITS.maxMaterializedRows + 1 }, (_, index) =>
      String(index)
    ).join('\n');
    const views: unknown[] = [];
    const el = new SheetEditor();
    el.addEventListener('view-change', (event) => views.push((event as CustomEvent).detail));
    document.body.append(el);
    el.setContent(source);

    expect(views).toEqual([{ view: 'raw', reason: 'fallback' }]);
    expect(el.shadowRoot!.querySelector('.spl-notice')?.textContent).toContain('more rows');
    expect(rawArea(el).value).toBe(source);

    rawSwitch(el).click();
    expect(el.getAttribute('view')).toBe('rich');
    expect(el.shadowRoot!.querySelector('[role="grid"]')).toBeNull();
    expect(el.shadowRoot!.querySelector('.sheet-surface__notice')?.textContent).toContain(
      'Editing is unavailable'
    );
    expect(el.getContent()).toBe(source);

    // The read-only grid keeps the way back to the text.
    rawSwitch(el).click();
    expect(el.getAttribute('view')).toBe('raw');
  });

  it('commits an open cell draft before showing the raw text', () => {
    const el = mount((e) => e.setContent('a,b'));
    const seen = changes(el);
    cell(el, 0, 0).dispatchEvent(key('Enter'));
    const draft = el.shadowRoot!.querySelector<HTMLTextAreaElement>('.sheet-editor__input')!;
    draft.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true }));
    draft.value = 'drafted';
    draft.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));

    rawSwitch(el).click();

    expect(rawArea(el).value).toBe('drafted,b');
    expect(seen).toEqual(['drafted,b']);
  });

  it('starts the undo history afresh after a raw edit', () => {
    const el = mount((e) => e.setContent('a,b'));
    rawSwitch(el).click();
    typeRaw(el, 'x,y');
    rawSwitch(el).click();

    cell(el, 0, 0).dispatchEvent(key('z', { ctrlKey: true }));
    expect(el.getContent()).toBe('x,y');
  });

  it("keeps the grid from the raw view's typing and clipboard", () => {
    const el = mount((e) => e.setContent('a,b'));
    rawSwitch(el).click();
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    rawArea(el).dispatchEvent(paste);
    rawArea(el).dispatchEvent(key('Enter'));
    expect(paste.defaultPrevented).toBe(false);
    expect(el.shadowRoot!.querySelector('.sheet-editor__input')).toBeNull();
    expect(el.getContent()).toBe('a,b');
  });
});
