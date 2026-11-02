// The host-contract conformance suites for the elements this format ships.
import {
  describeEditorContract,
  describePreviewContract,
} from '@stillpointlab/common-format/testing';
import { expect } from 'vitest';

import './editor';
import './grid';
import './preview';

import type { SheetEditor } from './editor/sheet-editor';
import type { SheetGrid } from './grid/sheet-grid';
import type { SheetPreview } from './preview/sheet-preview';

const content = 'Name,Value\nCoffee,12';
const cells = (el: HTMLElement) =>
  Array.from(el.shadowRoot?.querySelectorAll('td[data-row]') ?? [], (cell) => cell.textContent);

describeEditorContract<SheetEditor>('sheet-editor', {
  content,
  altContent: 'Name,Value\nTea,3',
  rendered: (el) => expect(cells(el)).toContain('Coffee'),
  // One user edit: Enter on the active cell, type, commit with Enter.
  edit: (el) => {
    const cell = el.shadowRoot?.querySelector<HTMLTableCellElement>('td[tabindex="0"]');
    if (!cell) throw new Error('active cell missing');
    cell.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })
    );
    const textarea = el.shadowRoot?.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) return; // readonly: no edit control opens
    textarea.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true }));
    textarea.value = 'Changed';
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })
    );
  },
});

describePreviewContract<SheetPreview>('sheet-preview', {
  content,
  rendered: (el) => expect(cells(el)).toContain('Coffee'),
});

describePreviewContract<SheetGrid>('sheet-grid', {
  content,
  rendered: (el) => expect(cells(el)).toContain('Coffee'),
});
