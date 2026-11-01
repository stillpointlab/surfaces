import type { Schema } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';

/**
 * Extended keymap for ProseMirror editor with additional keyboard shortcuts
 */

// Helper function to check if cursor is in a list
function isInList(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'bullet_list' || node.type.name === 'ordered_list') {
      return true;
    }
  }
  return false;
}

// Helper function to get current heading level
function getCurrentHeadingLevel(state: EditorState): number | null {
  const { $from } = state.selection;
  const parent = $from.parent;
  if (parent.type.name === 'heading') {
    return parent.attrs.level;
  }
  return null;
}

// Create a command to cycle heading levels
export function cycleHeading(direction: 'up' | 'down', schema: Schema, setBlockType: any): Command {
  return (state, dispatch) => {
    const currentLevel = getCurrentHeadingLevel(state);

    // If not in a heading and going up, convert to H6
    if (currentLevel === null && direction === 'up') {
      return setBlockType(schema.nodes.heading, { level: 6 })(state, dispatch);
    }

    // If not in a heading and going down, do nothing
    if (currentLevel === null && direction === 'down') {
      return false;
    }

    // Calculate new level
    const newLevel =
      direction === 'up' ? Math.max(1, currentLevel! - 1) : Math.min(6, currentLevel! + 1);

    // If at boundary and would go beyond, convert to paragraph
    if (
      (direction === 'up' && currentLevel === 1) ||
      (direction === 'down' && currentLevel === 6)
    ) {
      return setBlockType(schema.nodes.paragraph)(state, dispatch);
    }

    // Otherwise, change heading level
    if (newLevel !== currentLevel) {
      return setBlockType(schema.nodes.heading, { level: newLevel })(state, dispatch);
    }

    return false;
  };
}

// Create extended keymap
export function createExtendedKeymap(
  schema: Schema,
  toggleMark: any,
  setBlockType: any,
  sinkListItem: any,
  liftListItem: any
) {
  const keymap: { [key: string]: Command } = {
    // List indentation with Tab/Shift-Tab
    Tab: (state, dispatch) => {
      if (isInList(state)) {
        return sinkListItem(schema.nodes.list_item)(state, dispatch);
      }
      // Allow default tab behavior if not in list
      return false;
    },

    'Shift-Tab': (state, dispatch) => {
      if (isInList(state)) {
        return liftListItem(schema.nodes.list_item)(state, dispatch);
      }
      return false;
    },

    // Text formatting shortcuts
    'Mod-b': toggleMark(schema.marks.strong),
    'Mod-i': toggleMark(schema.marks.em),
    'Mod-`': toggleMark(schema.marks.code),

    // Header level control
    'Ctrl-ArrowUp': cycleHeading('up', schema, setBlockType),
    'Ctrl-ArrowDown': cycleHeading('down', schema, setBlockType),

    // Alternative header shortcuts for better cross-platform support
    'Ctrl-Shift-ArrowUp': cycleHeading('up', schema, setBlockType),
    'Ctrl-Shift-ArrowDown': cycleHeading('down', schema, setBlockType),
  };

  return keymap;
}
