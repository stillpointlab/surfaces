import { InputRule } from 'prosemirror-inputrules';

import { reportError } from './log';

import type { Schema } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';

/**
 * Input rules for automatic formatting in ProseMirror editor
 */

// Helper to create a bullet list at the start of a line
function createBulletList(
  schema: Schema,
  state: EditorState,
  match: RegExpMatchArray,
  start: number,
  end: number
): Transaction | null {
  const tr = state.tr;

  // Delete the typed pattern first
  tr.delete(start, end);

  // Now resolve the position after deletion
  const $pos = tr.doc.resolve(start);
  const range = $pos.blockRange();

  if (!range) return null;

  // Wrap the current block in a list
  try {
    tr.wrap(range, [{ type: schema.nodes.bullet_list }, { type: schema.nodes.list_item }]);
    return tr;
  } catch (e) {
    reportError('Failed to create bullet list', e);
    return null;
  }
}

// Helper to create an ordered list at the start of a line
function createOrderedList(
  schema: Schema,
  state: EditorState,
  match: RegExpMatchArray,
  start: number,
  end: number
): Transaction | null {
  const tr = state.tr;
  const orderStart = match[2] ? parseInt(match[2], 10) : 1;

  // Delete the typed pattern first
  tr.delete(start, end);

  // Now resolve the position after deletion
  const $pos = tr.doc.resolve(start);
  const range = $pos.blockRange();

  if (!range) return null;

  // Wrap the current block in a list with the starting number
  try {
    tr.wrap(range, [
      { type: schema.nodes.ordered_list, attrs: { start: orderStart } },
      { type: schema.nodes.list_item },
    ]);
    return tr;
  } catch (e) {
    reportError('Failed to create ordered list', e);
    return null;
  }
}

// Create input rules for auto-list creation
export function createInputRules(schema: Schema) {
  const rules: InputRule[] = [];

  // Rule for bullet lists triggered by "* " or "- " at start of line
  const bulletListRule = new InputRule(/^(\s*)([-*])\s$/, (state, match, start, end) => {
    const { list_item, paragraph } = schema.nodes;

    // Check if we're already in a list
    const $start = state.doc.resolve(start);
    if ($start.parent.type === list_item) {
      return null;
    }

    // Check if we're in a paragraph (the expected case)
    if ($start.parent.type !== paragraph) {
      return null;
    }

    // Simply use the helper function
    return createBulletList(schema, state, match, start, end);
  });

  // Rule for ordered lists triggered by "1. " (or any number) at start of line
  const orderedListRule = new InputRule(/^(\s*)(\d+)\.\s$/, (state, match, start, end) => {
    const { list_item, paragraph } = schema.nodes;

    // Check if we're already in a list
    const $start = state.doc.resolve(start);
    if ($start.parent.type === list_item) {
      return null;
    }

    // Check if we're in a paragraph (the expected case)
    if ($start.parent.type !== paragraph) {
      return null;
    }

    // Simply use the helper function
    return createOrderedList(schema, state, match, start, end);
  });

  rules.push(bulletListRule);
  rules.push(orderedListRule);

  return rules;
}
