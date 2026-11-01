import type { EditorSelection } from '@codemirror/state';
import type { Command, KeyBinding } from '@codemirror/view';

const moveSelectionVertically = (
  EditorSelectionType: typeof EditorSelection,
  forward: boolean
): Command => {
  return (view) => {
    const { selection } = view.state;
    if (selection.ranges.every((range) => range.empty)) return false;

    const ranges = selection.ranges.map((range) => view.moveVertically(range, forward));
    view.dispatch({
      selection: EditorSelectionType.create(ranges, selection.mainIndex),
      scrollIntoView: true,
      userEvent: 'select',
    });
    return true;
  };
};

export function normalModeKeymap(
  EditorSelectionType: typeof EditorSelection,
  indentWithTab: KeyBinding
): readonly KeyBinding[] {
  return [
    { key: 'ArrowUp', run: moveSelectionVertically(EditorSelectionType, false) },
    { key: 'ArrowDown', run: moveSelectionVertically(EditorSelectionType, true) },
    indentWithTab,
  ];
}
