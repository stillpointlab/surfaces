// What the page keeps in `localStorage`, keyed by the served root's `id` (two runs
// on one port can serve different folders). Storage can be missing, full or
// refused, so every read and write is inside `try`, and a failure only forgets.

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
