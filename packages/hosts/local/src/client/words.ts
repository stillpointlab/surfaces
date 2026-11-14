// Everything the page says, in one place so the words are easy to change. The
// banner and the confirmations are the local host brief's drafts (outcome 1),
// word for word; the pane's messages for a file it cannot open are the host-page
// spec's table. A confirmation is a question and, where the draft has one, the
// sentence after it: together they are the draft's words.

export interface Confirmation {
  question: string;
  detail?: string;
  confirm: string;
  cancel: string;
}

export const words = {
  explorer: 'Files',
  explorerTruncated: (shown: number) =>
    `Showing the first ${shown.toLocaleString('en')} files and folders.`,
  explorerFailed: (message: string) => `The folder could not be listed: ${message}`,

  nothingOpen: 'Select a file in the explorer.',
  loading: 'Opening…',
  preview: 'Preview',
  edit: 'Edit',
  save: 'Save',
  unsaved: 'Unsaved edits',

  /** What the pane says when it cannot open a file, by the server's code. */
  cannotOpen: {
    notText: 'No format opens this file, and it is not text.',
    HOST_FILE_TOO_LARGE: 'This file is too large to open here.',
    HOST_FILE_NOT_FOUND: 'There is no file at this path.',
    HOST_PATH_OUTSIDE_ROOT: 'This path leads outside the served folder.',
  },
  /** A file a text format opens that turned out not to be text. */
  formatNotText: 'This file is not text, so it cannot open here.',
  /** Any other refusal: the server's own message says why. */
  cannotOpenOther: (message: string) => `This file could not be opened. ${message}`,
  loadFailed: 'The format for this file could not be loaded.',

  /** The open file went from disk while it had no unsaved edits. */
  deletedOnDisk: 'This file was deleted on disk.',

  banner: {
    changed: 'This file changed on disk after you opened it. Your edits are not saved.',
    deleted: 'This file was deleted on disk. Your edits are not saved.',
    reload: 'Reload',
  },
  saveFailed: (message: string) => `Your edits could not be saved. ${message}`,

  discard: (name: string): Confirmation => ({
    question: `Discard your unsaved edits to ${name}?`,
    confirm: 'Discard',
    cancel: 'Cancel',
  }),
  reload: {
    question: 'Reload from disk?',
    detail: 'Your unsaved edits will be lost.',
    confirm: 'Reload',
    cancel: 'Cancel',
  } satisfies Confirmation,
  saveOver: {
    question: 'Save over the newer file?',
    detail:
      'The file on disk changed after you opened it, and saving replaces those changes with yours.',
    confirm: 'Save anyway',
    cancel: 'Cancel',
  } satisfies Confirmation,
  /** Not in the brief: the spec asks Save to ask before it creates a deleted file again. */
  saveDeleted: {
    question: 'Create the file again?',
    detail: 'It was deleted on disk after you opened it, and saving creates it with your edits.',
    confirm: 'Create it',
    cancel: 'Cancel',
  } satisfies Confirmation,
} as const;

/** The pane's message for a refusal it met opening a file, by code. */
export function cannotOpen(code: string, message: string): string {
  const known = words.cannotOpen as Record<string, string>;
  return Object.hasOwn(known, code) && code !== 'notText'
    ? known[code]
    : words.cannotOpenOther(message);
}
