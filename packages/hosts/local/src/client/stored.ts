// What the page keeps in `localStorage`: the open folders, keyed by the served
// root's `id` (two runs on one port can serve different folders), and how the
// Changes view treats whitespace, which is the person's and not a folder's.
// Storage can be missing, full or refused, so every read and write is inside
// `try`, and a failure only forgets.

import { DIFF_WHITESPACE, type DiffWhitespace } from './diff-whitespace';

const OPEN_FOLDERS = 'surfaces.open-folders.';

/** The folders that were open in the explorer for this root, or none. */
export function readOpenFolders(rootId: string): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(OPEN_FOLDERS + rootId) ?? '[]');
    return Array.isArray(stored) ? stored.filter((path) => typeof path === 'string') : [];
  } catch {
    return [];
  }
}

export function writeOpenFolders(rootId: string, paths: readonly string[]): void {
  try {
    localStorage.setItem(OPEN_FOLDERS + rootId, JSON.stringify(paths));
  } catch {
    // storage is off or full: the folders start closed next time
  }
}

const DIFF_WHITESPACE_KEY = 'surfaces.diff-whitespace';

/** How the Changes view treats whitespace, as last chosen: compared, by default. */
export function readDiffWhitespace(): DiffWhitespace {
  try {
    const stored = localStorage.getItem(DIFF_WHITESPACE_KEY);
    return DIFF_WHITESPACE.find((mode) => mode === stored) ?? 'compare';
  } catch {
    return 'compare';
  }
}

export function writeDiffWhitespace(mode: DiffWhitespace): void {
  try {
    localStorage.setItem(DIFF_WHITESPACE_KEY, mode);
  } catch {
    // storage is off or full: whitespace is compared next time
  }
}
