// Everything the page says, in one place so the words are easy to change. The
// banner and the confirmations are the local host brief's drafts (outcome 1),
// word for word; the pane's messages for a file it cannot open are the host-page
// spec's table. A confirmation is a question and, where the draft has one, the
// sentence after it: together they are the draft's words. The explorer's menu and
// dialogs are the file-operations spec's, where it has words for them. The git
// notice is the git-in-the-host spec's; the Changes view's messages are drafts.
// The commit's words in the check-in review, and the notice after a commit, are
// drafts; the review's choice ("On <branch>", "On a new branch") is its own. The apps' words
// (`apps`) are the apps-in-the-local-host spec's where it gives them (the "Show
// files…" question, the folder's reason, the menu's entries), and drafts beside
// them. Undo and redo (`journal`): the buttons' titles and the delete dialog's two
// questions are the undo-journal spec's; the rest are drafts.

export interface Confirmation {
  question: string;
  detail?: string;
  confirm: string;
  cancel: string;
}

/** A line ending's name in a sentence. */
const endingWord = (ending: string): string => (ending === 'mixed' ? 'mixed endings' : ending);

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
    HOST_PATH_INVALID: 'This is not a path the host opens.',
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
    /** The whitespace control, and its three modes. */
    whitespace: 'Whitespace',
    whitespaceModes: { compare: 'Compared', ignore: 'Ignored', show: 'Shown' },
    /** Above the view, when the sides differ in ways it does not mark. */
    whitespaceOnly: 'This file differs from the last commit in whitespace alone.',
    endingsOnly: (file: string, head: string) =>
      `This file differs from the last commit in line endings alone: ${endingWord(file)} in the file, ${endingWord(head)} in the last commit. No line is marked for that, and git may still count every line as changed.`,
    endingsToo: (file: string, head: string) =>
      `Line endings differ: ${endingWord(file)} in the file, ${endingWord(head)} in the last commit. No line is marked for that alone.`,
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
    /** The spec's draft: a folder above an app's locked files. */
    holdsLocked: 'This folder holds an app’s locked files. Show the files first.',
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
    /**
     * The undo-journal spec's: asked when the host cannot keep a delete to undo,
     * by its reason (the second is the spec's draft, the third a draft in its
     * shape). Delete sends it again, written with no step.
     */
    cannotUndo: {
      'too-large': 'This is too large to undo. Delete anyway?',
      'not-text':
        'An image or a large file is among these, and deleting it cannot be undone. Delete anyway?',
      link: 'A link is among these, and deleting it cannot be undone. Delete anyway?',
    },
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

  /** An app's row, its menu, its pane, and the lock. */
  apps: {
    /** The menu on an app's row (the spec's entries). */
    open: 'Open',
    showFiles: 'Show files…',
    lockFiles: 'Lock files',
    menuLabel: (label: string) => `Options for ${label}`,
    /** The spec's draft, word for word: asked before an app's files are shown. */
    showFilesConfirm: {
      question: 'Show this app’s files?',
      detail:
        'Changes made to them skip the app’s rules, and the app may report problems until they are fixed.',
      confirm: 'Show files',
      cancel: 'Cancel',
    } satisfies Confirmation,
    /** The row above the tree for an app at the served folder's root. */
    rootRows: 'Apps in the served folder',
    unlocked: 'unlocked',
    unlockedTitle: 'Unlocked: this app’s files are listed, and changes to them skip its rules',
    holdsChanges: 'Holds changes',
    /** The notice after "Lock files": the problems the lifecycle reports follow it. */
    locked: (label: string) => `The files of ${label} are locked again.`,
    lockedProblems: (label: string) =>
      `The files of ${label} are locked again. The app reports problems with them:`,
    lockFailed: (message: string) => `The files could not be locked. ${message}`,
    unlockFailed: (message: string) => `The files could not be shown. ${message}`,
    /** The pane's line over a locked file, which opens in its preview. */
    lockedLine: (label: string) =>
      `This file belongs to ${label}, whose files are locked, so it opens in its preview. Show the app’s files to edit it here.`,
    /** The app pane, when it has nothing to mount. */
    loading: 'Opening the app…',
    noApp: 'There is no app at this address.',
    notFound: 'The app has no page at this address.',
    unknownApp: (app: string) => `This page cannot show the ${app} app.`,
    loadFailed: 'The app could not be loaded.',
    readFailed: (message: string) => `The app could not be read. ${message}`,
    /** An app's commit summary when its review gives none, named for the instance. */
    checkinTitle: (label: string) => `${label} check-in`,
    /** An instance discovery found but cannot open: its manifest, or an overlap. */
    invalidTitle: (label: string) => `${label} cannot open`,
    invalidIntro: 'These are the problems with its files:',
    invalidHelp: 'Show its files to fix them, then lock them again.',
    /** Creating an instance from a folder's menu: the app's own `meta.create` copy beside these. */
    create: {
      /** The menu's entry. `noun` carries its article: "an inventory". */
      entry: (noun: string) => `Create ${noun} here…`,
      title: (noun: string) => `Create ${noun}`,
      folder: 'Folder',
      folderExample: (example: string) => `For example ${example}.`,
      rootHelp: 'Leave it empty to create at the root of the served folder.',
      confirm: 'Create',
      cancel: 'Cancel',
      loadFailed: 'The form could not be loaded.',
      check: {
        leadingSlash: 'Start the folder inside the served folder, without a leading slash.',
        dotDot: 'A folder cannot have a “..” segment.',
        empty: 'A folder’s name cannot be empty between two slashes.',
        consent: 'Tick the box above to create at the root of the served folder.',
      },
    },
  },

  /** Undo and Redo: the explorer header's buttons, the keys, and what they say after. */
  journal: {
    /**
     * The buttons' titles and names: the spec's "Undo: Delete notes.md". Their
     * faces are `<spl-icon>`'s `undo` and `redo`, so the folder's name keeps its room.
     */
    undoTitle: (label: string) => `Undo: ${label}`,
    redoTitle: (label: string) => `Redo: ${label}`,
    nothingToUndo: 'Nothing to undo',
    nothingToRedo: 'Nothing to redo',
    /** The notice after one lands. */
    done: (which: 'undo' | 'redo', label: string) =>
      `${which === 'undo' ? 'Undone' : 'Redone'}: ${label}`,
    /** The notice after a refusal: a file changed since says which, in the host's words. */
    failed: (which: 'undo' | 'redo', code: string, message: string) =>
      code === 'HOST_UNDO_CONFLICT'
        ? message
        : `Could not ${which === 'undo' ? 'undo' : 'redo'}. ${message}`,
    /** An app's op the host wrote with no step. */
    opCannotUndo: (reason: 'too-large' | 'not-text' | 'link') =>
      reason === 'too-large'
        ? 'This change was too large to keep, so it cannot be undone.'
        : reason === 'link'
          ? 'This change removed a link, so it cannot be undone.'
          : 'This change touched a file that is not text, so it cannot be undone.',
  },

  /**
   * The Commit button, the commit's words in the check-in review (the explorer's
   * and every app's), and the notice after a commit. The review's own words
   * ("Files", "All", "On <branch>", "New branch name", …) are the component's.
   */
  commit: {
    button: 'Commit',
    /** The button's name for a screen reader, with the count it shows. */
    buttonLabel: (count: number) =>
      count === 0
        ? 'Commit: nothing has changed'
        : `Commit: ${count} changed ${count === 1 ? 'file' : 'files'}`,
    title: 'Commit',
    readFailed: (message: string) => `The changes could not be read. ${message}`,
    nothing: 'Nothing has changed since the last commit.',
    status: { changed: 'changed', new: 'new', moved: 'moved', deleted: 'deleted' },
    summary: 'Summary',
    details: 'Details (optional)',
    detached: 'HEAD is detached (not on a branch), so the commit goes on a new branch.',
    unsaved: (name: string) =>
      `Your unsaved edits to ${name} are not in this commit. Save them first to include them.`,
    check: {
      noFiles: 'Choose at least one file to commit.',
      noSummary: 'Write a summary for the commit.',
    },
    confirm: 'Commit',
    committing: 'Committing…',
    cancel: 'Cancel',
    notice: (short: string, branch: string) => `Committed ${short} on ${branch}.`,
    dismiss: 'Dismiss',
  },
} as const;

/** The pane's message for a refusal it met opening a file, by code. */
export function cannotOpen(code: string, message: string): string {
  const known = words.cannotOpen as Record<string, string>;
  return Object.hasOwn(known, code) && code !== 'notText'
    ? known[code]
    : words.cannotOpenOther(message);
}
