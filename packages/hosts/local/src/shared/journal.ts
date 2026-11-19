// What the local host's server and its page say to each other about undo and
// redo: the labels the buttons show, what an undo or a redo did, and why a write
// could not be kept. Types only, so both halves import them.

/**
 * Why a write could not be kept in the journal: its text is over the limit, a
 * file in it is not text, or it deletes a symbolic link (an undo could only
 * bring back a copy of what the link led to).
 */
export type UnkeptReason = 'too-large' | 'not-text' | 'link';

/** `GET /api/journal`: the label of the step undo and redo would take next, or `null`. */
export interface JournalLabels {
  undo: string | null;
  redo: string | null;
}

/** `POST /api/undo` and `POST /api/redo`: what was undone or done again, for the page to follow. */
export interface JournalMove {
  /** The step's label. */
  label: string;
  /** The files it moved, each from one path to another. */
  moved: { from: string; path: string }[];
  /** The files it deleted. */
  deleted: string[];
}

/** Beside an app's reply: its change was written, and cannot be undone. */
export interface CannotUndoNotice {
  kind: 'cannot-undo';
  reason: UnkeptReason;
}
