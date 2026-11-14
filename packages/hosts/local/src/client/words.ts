// Everything the page says, in one place so the words are easy to change. The
// banner and the confirmations are the local host brief's drafts (outcome 1),
// word for word; the pane's messages for a file it cannot open are the host-page
// spec's table. A confirmation is a question and, where the draft has one, the
// sentence after it: together they are the draft's words. The explorer's menu and
// dialogs are the file-operations spec's, where it has words for them. The git
// notice is the git-in-the-host spec's; the Changes view's messages are drafts.

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
  /** The git-in-the-host spec's notice, for a folder that looks like a repository with no git. */
  gitNotFound: 'git was not found, so changes and commit are off.',

  nothingOpen: 'Select a file in the explorer.',
  loading: 'Opening…',
  preview: 'Preview',
  edit: 'Edit',
  changes: 'Changes',
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

  /** The Changes view, when the last commit's side cannot be shown. */
  diff: {
    notInHead: 'This file is not in the last commit, so there is nothing to compare it with.',
    HOST_NOT_TEXT: 'The last commit’s version of this file is not text, so it cannot be compared.',
    HOST_FILE_TOO_LARGE: 'The last commit’s version of this file is too large to compare here.',
    failed: (message: string) => `The last commit’s version could not be read. ${message}`,
  },

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

  /** The explorer's menu on a row (the file-operations spec's table). */
  menu: {
    label: (path: string) =>
      path === '' ? 'Options for the served folder' : `Options for ${path}`,
    newFile: 'New file…',
    rename: 'Rename…',
    delete: 'Delete…',
    /** Why a folder's writes are off: not in the spec, which leaves these to the page. */
    separate: 'A separate repository (a submodule or a nested one): change it there.',
    holdsSeparate: 'This folder holds a separate repository, which cannot be moved from here.',
    truncated: 'The folder is too large to list in full, so its files are not all known here.',
  },

  /**
   * The explorer's dialogs. The delete questions are the spec's words; the titles,
   * the buttons and the checks' messages are the page's own.
   */
  fileOps: {
    pathLabel: 'Path',
    cancel: 'Cancel',
    newFile: { title: 'New file', confirm: 'Create' },
    rename: { title: 'Rename', confirm: 'Rename' },
    deleteConfirm: 'Delete',
    deleteFile: (name: string) => `Delete ${name}?`,
    deleteFolder: (name: string, count: number) =>
      `Delete ${name} and the ${count} ${count === 1 ? 'file' : 'files'} in it?`,
    deleteUnsaved: (name: string) => `${name} has unsaved edits. Delete it anyway?`,
    /** A folder's delete when the open file, with unsaved edits, is inside it. */
    deleteUnsavedInside: (name: string) => `${name} has unsaved edits, which will be lost.`,
    check: {
      empty: 'Enter a path.',
      noName: 'Enter a name after the last slash.',
      leadingSlash: 'Start the path inside the served folder, without a leading slash.',
      dotDot: 'A path cannot have a “..” segment.',
      insideItself: 'A folder cannot move inside itself.',
      fileExists: (path: string) => `There is already a file at ${path}.`,
      folderExists: (path: string) => `There is already a folder at ${path}.`,
      fileInTheWay: (path: string) => `${path} is a file, so it cannot hold another.`,
    },
  },
} as const;

/** The pane's message for a refusal it met opening a file, by code. */
export function cannotOpen(code: string, message: string): string {
  const known = words.cannotOpen as Record<string, string>;
  return Object.hasOwn(known, code) && code !== 'notText'
    ? known[code]
    : words.cannotOpenOther(message);
}
