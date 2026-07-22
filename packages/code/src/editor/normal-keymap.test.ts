import { EditorSelection } from '@codemirror/state';
import { describe, expect, it, vi } from 'vitest';

import { normalModeKeymap } from './normal-keymap';

import type { EditorView, KeyBinding } from '@codemirror/view';

const indentWithTab: KeyBinding = { key: 'Tab', run: () => true };

const bindings = normalModeKeymap(EditorSelection, indentWithTab);
const arrowUp = bindings.find((binding) => binding.key === 'ArrowUp')!;
const arrowDown = bindings.find((binding) => binding.key === 'ArrowDown')!;

function mockView(selection: EditorSelection, movedTo: number) {
  const moved = EditorSelection.cursor(movedTo);
  const view = {
    state: { selection },
    moveVertically: vi.fn(() => moved),
    dispatch: vi.fn(),
  } as unknown as EditorView;
  return { moved, view };
}

describe('normalModeKeymap vertical selection movement', () => {
  it('moves up from the active selection head on the first key press', () => {
    const range = EditorSelection.range(2, 7);
    const selection = EditorSelection.create([range]);
    const { moved, view } = mockView(selection, 0);

    expect(arrowUp.run!(view)).toBe(true);
    expect(view.moveVertically).toHaveBeenCalledWith(range, false);
    expect(view.dispatch).toHaveBeenCalledWith({
      selection: EditorSelection.create([moved]),
      scrollIntoView: true,
      userEvent: 'select',
    });
  });

  it('moves down from the active selection head on the first key press', () => {
    const range = EditorSelection.range(7, 2);
    const selection = EditorSelection.create([range]);
    const { moved, view } = mockView(selection, 10);

    expect(arrowDown.run!(view)).toBe(true);
    expect(view.moveVertically).toHaveBeenCalledWith(range, true);
    expect(view.dispatch).toHaveBeenCalledWith({
      selection: EditorSelection.create([moved]),
      scrollIntoView: true,
      userEvent: 'select',
    });
  });

  it('defers ordinary cursor movement to CodeMirror', () => {
    const selection = EditorSelection.single(4);
    const { view } = mockView(selection, 0);

    expect(arrowUp.run!(view)).toBe(false);
    expect(arrowDown.run!(view)).toBe(false);
    expect(view.moveVertically).not.toHaveBeenCalled();
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it('retains the normal-mode indentation binding', () => {
    expect(bindings).toContain(indentWithTab);
  });
});
