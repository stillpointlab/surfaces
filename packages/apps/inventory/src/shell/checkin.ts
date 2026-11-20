// What the inventory's shell shows in its check-in review: a row for each dirty
// file, labelled "manifest", "new" or "changed", and its own words for a host
// that gives none, which say "check in" and never "commit" or "pull request".

import type { SharedInventoryDirtyFile } from '../types.js';
import type { CheckinFile } from '@stillpointlab/checkin-review-component';
import type { CheckinWords } from '@stillpointlab/common-format/app';

/** The shell's words for its review, when its host gives none. */
export const INVENTORY_CHECKIN_WORDS: CheckinWords = {
  heading: 'Check in inventory changes',
  help: 'Choose the files to include in this check-in.',
  title: 'Title',
  body: 'Description (optional)',
  confirm: 'Check in',
  cancel: 'Cancel',
  busy: 'Checking in…',
  noFiles: 'Choose at least one file to check in.',
  nothing: 'Nothing has changed since the last check-in.',
};

/** The title field's placeholder; there is no default title. */
export const INVENTORY_CHECKIN_PLACEHOLDER = 'Inventory check-in';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** The dirty files a state carries (the overview's and a zone's alike), or none. */
export function dirtyOf(state: unknown): SharedInventoryDirtyFile[] | null {
  if (!isObject(state) || !Array.isArray(state.dirty)) return null;
  return state.dirty.filter(
    (file): file is SharedInventoryDirtyFile => isObject(file) && typeof file.path === 'string'
  );
}

/** One row per dirty file, in the state's order: the manifest is "manifest", a new zone "new". */
export function inventoryCheckinFiles(dirty: readonly SharedInventoryDirtyFile[]): CheckinFile[] {
  return dirty.map((file) => ({
    path: file.path,
    label: file.kind === 'manifest' ? 'manifest' : file.newFile ? 'new' : 'changed',
  }));
}
