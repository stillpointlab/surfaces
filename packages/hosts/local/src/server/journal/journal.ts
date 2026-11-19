// The journal: undo and redo of what the host writes, in the server's memory for
// the run. A wrapper around a `StoragePort` and one optional capability, git's
// index (`JournalIndex`), and nothing else, so its tests run over the memory port.
//
// A writer asks `journal.port(label)` for a port whose `put` is one step. Before
// that `put` the journal reads what the step's inverse needs: the old text of a
// `write`, of a `delete` and of a `move` with content, and the index entries of
// the paths it deletes. A change the writer gave no `base` is sent with the
// version the journal read, so a file that changed between the read and the
// write refuses the step rather than leaving a wrong inverse. The step keeps its
// inverse, its forward changes, each touched path's version after it (from the
// `put`'s answer) and its size. A new step empties the redo side.
//
// The inverses: a `write` is a `write` of the old text; a `create` is a
// `delete`; a `move` is a `move` back, with the old text when it carried new
// text; a `delete` is a `create` of the old text.
//
// A step that cannot be kept: one whose kept text is over `maxBytes`, or one
// with a file the port cannot read as text (a `delete` of an image, or of a file
// over 2 MiB; a rename of one carries no text and is kept). A port made with
// `unkept: 'refuse'` refuses it with `HOST_CANNOT_UNDO` and its `reason`, and
// writes nothing; one made with `unkept: 'write'` writes it with no step and says
// why in `unkept`. A write with no step empties the journal, since an older step
// could no longer be undone in order (`write` is the same, for a write the
// person agreed cannot be undone).
//
// Undo writes the newest step's inverse in one `put`, each change at the version
// the step left (a `create` needs none: a path that exists refuses it), then puts
// back the index entries the step's deletes removed. A refusal that means the
// file moved on (`HOST_FILE_CHANGED`, `HOST_PATH_EXISTS`, `HOST_FILE_NOT_FOUND`)
// is `HOST_UNDO_CONFLICT` with the file named; the step stays and nothing is
// written. Redo is the same with the forward changes, at the versions the undo
// left. Undo's and redo's writes go to the port itself and add no step.
//
// Every step, undo and redo runs one at a time, so a step's read and its write
// are never split by another of the journal's own.

import { fail, ok } from '@stillpointlab/common-format/app';

import { JOURNAL_MAX_BYTES, JOURNAL_MAX_STEPS } from '../limits';

import type { JournalLabels, JournalMove, UnkeptReason } from '../../shared/journal';
import type { IndexEntry } from '../git/stage';
import type { Failure, FolderNode, Result } from '@stillpointlab/common-format/app';
import type { PortChange, StoragePort } from '@stillpointlab/common-format/host';

export type { IndexEntry } from '../git/stage';
export type { JournalLabels, JournalMove, UnkeptReason } from '../../shared/journal';

/** One write the journal can take back. */
export interface JournalStep {
  /** What the page shows: "Delete notes.md", "Inventory: add-item". */
  label: string;
  /** What undo writes. */
  inverse: PortChange[];
  /** What redo writes. */
  forward: PortChange[];
  /** Each touched path's version after the step (`null`: no file there). */
  after: Record<string, string | null>;
  /** The index entries the step's deletes removed, for undo to put back. */
  index?: IndexEntry[];
  /** The size, as UTF-8, of the text the step keeps (its inverse's and its forward's). */
  bytes: number;
}

/** What the journal needs of git's index. The node port's git supplies it. */
export interface JournalIndex {
  /** The entries a staged delete of `paths` would remove. */
  entries(paths: readonly string[]): Promise<IndexEntry[]>;
  /** Put entries back as `entries` read them. */
  restore(entries: readonly IndexEntry[]): Promise<void>;
}

/** `HOST_CANNOT_UNDO`, with its reason. */
export type CannotUndo = Failure & { reason: UnkeptReason };

/** `HOST_UNDO_CONFLICT`, with the file that moved on, when it can be told. */
export type UndoConflict = Failure & { path?: string };

export interface JournalPortOptions {
  /**
   * A step that cannot be kept: `refuse` answers `HOST_CANNOT_UNDO` and writes
   * nothing (the explorer, which asks); `write` writes it with no step (an app's
   * op, which says so after). `write` by default.
   */
  unkept?: 'refuse' | 'write';
}

/** A port whose `put` is one step. */
export interface JournalPort extends StoragePort {
  /** Why the last `put` was written with no step, or `null` when it was kept (or refused). */
  readonly unkept: UnkeptReason | null;
}

export interface Journal {
  /** A port whose `put` is one step, labelled `label`. */
  port(label: string, options?: JournalPortOptions): JournalPort;
  /** Write with no step, and empty the journal once it lands: a write the person agreed cannot be undone. */
  write(changes: readonly PortChange[]): Promise<Result<{ versions: Record<string, string> }>>;
  undo(): Promise<Result<JournalMove>>;
  redo(): Promise<Result<JournalMove>>;
  labels(): JournalLabels;
  /** The steps, oldest first, and the redo side, the next to redo last: for tests. */
  steps(): { undo: readonly JournalStep[]; redo: readonly JournalStep[] };
  /** Drop every step. */
  clear(): void;
}

export interface JournalOptions {
  port: StoragePort;
  /** git's index, in a repository. */
  index?: JournalIndex;
  /** The steps kept; past it the oldest go (`JOURNAL_MAX_STEPS`). */
  maxSteps?: number;
  /** The text kept, as UTF-8; past it the oldest go, and one step over it is not kept (`JOURNAL_MAX_BYTES`). */
  maxBytes?: number;
  /** The steps changed: the labels may have. */
  onChange?(): void;
}

/** The codes that mean a file moved on since the step. */
const CONFLICTS = new Set(['HOST_FILE_CHANGED', 'HOST_PATH_EXISTS', 'HOST_FILE_NOT_FOUND']);

/** The codes that mean a file cannot be read into the journal. */
const NOT_TEXT = new Set(['HOST_NOT_TEXT', 'HOST_FILE_TOO_LARGE']);

const KINDS = new Set(['write', 'create', 'move', 'delete']);

/** Whether each change has the shape the port takes; the port refuses one that does not. */
function wellFormed(changes: unknown): changes is readonly PortChange[] {
  if (!Array.isArray(changes)) return false;
  return changes.every((change: unknown) => {
    if (typeof change !== 'object' || change === null) return false;
    const c = change as Record<string, unknown>;
    if (typeof c.path !== 'string' || !KINDS.has(c.kind as string)) return false;
    if (c.base !== undefined && typeof c.base !== 'string') return false;
    if (c.kind === 'write' || c.kind === 'create') return typeof c.content === 'string';
    if (c.kind === 'move') {
      return (
        typeof c.from === 'string' && (c.content === undefined || typeof c.content === 'string')
      );
    }
    return true;
  });
}

/** The bytes a text takes as UTF-8. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (
      unit >= 0xd800 &&
      unit <= 0xdbff &&
      i + 1 < text.length &&
      (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00
    ) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

const contentBytes = (changes: readonly PortChange[]): number =>
  changes.reduce(
    (sum, change) =>
      sum + (change.kind !== 'delete' && change.content ? utf8Length(change.content) : 0),
    0
  );

/** The path a change reads its file from: a move's source, or its path. */
const sourceOf = (change: PortChange): string =>
  change.kind === 'move' ? change.from : change.path;

/** A change without its `base`: what a step keeps, the base given when it is written. */
function bare(change: PortChange): PortChange {
  const { base: _base, ...rest } = change;
  return rest as PortChange;
}

/** The changes, each at the version `versions` holds for the file it acts on (a create at none). */
function atVersions(
  changes: readonly PortChange[],
  versions: Readonly<Record<string, string | null>>
): PortChange[] {
  return changes.map((change) => {
    if (change.kind === 'create') return change;
    const version = versions[sourceOf(change)];
    return typeof version === 'string' ? { ...change, base: version } : change;
  });
}

/** Each touched path's version after a write: a source moved or deleted has none. */
function versionsAfter(
  changes: readonly PortChange[],
  versions: Readonly<Record<string, string>>
): Record<string, string | null> {
  const after: Record<string, string | null> = {};
  for (const change of changes) {
    if (change.kind === 'delete') after[change.path] = null;
    else {
      if (change.kind === 'move') after[change.from] = null;
      // A moved link that leads nowhere has no version: the undo goes without a base.
      if (Object.hasOwn(versions, change.path)) after[change.path] = versions[change.path];
    }
  }
  return after;
}

/** What an undo or a redo moved and deleted, from the changes it wrote. */
function movesOf(label: string, changes: readonly PortChange[]): JournalMove {
  return {
    label,
    moved: changes.flatMap((change) =>
      change.kind === 'move' ? [{ from: change.from, path: change.path }] : []
    ),
    deleted: changes.flatMap((change) => (change.kind === 'delete' ? [change.path] : [])),
  };
}

const deletedPaths = (changes: readonly PortChange[]): string[] =>
  changes.flatMap((change) => (change.kind === 'delete' ? [change.path] : []));

/** The folders above a path, nearest the root first. */
function foldersOf(path: string): string[] {
  const segments = path.split('/');
  return segments.slice(1).map((_, i) => segments.slice(0, i + 1).join('/'));
}

/** The first JSON string in a message: the path a port's refusal names first. */
function quotedPath(message: string): string | undefined {
  const match = /"(?:[^"\\]|\\.)*"/.exec(message);
  if (!match) return undefined;
  try {
    return JSON.parse(match[0]) as string;
  } catch {
    return undefined;
  }
}

/** A step on the redo side: the versions and the index entries its undo left. */
interface Undone {
  step: JournalStep;
  /** Each touched path's version after the undo. */
  before: Record<string, string | null>;
  /** The index entries the undo's deletes removed (an undone create's), for redo to put back. */
  removed: IndexEntry[];
}

export function createJournal(options: JournalOptions): Journal {
  const { port, index } = options;
  const maxSteps = options.maxSteps ?? JOURNAL_MAX_STEPS;
  const maxBytes = options.maxBytes ?? JOURNAL_MAX_BYTES;
  const done: JournalStep[] = [];
  const undone: Undone[] = [];
  let queue: Promise<unknown> = Promise.resolve();

  /** Run `task` after every step, undo and redo before it. */
  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  }

  const changed = () => options.onChange?.();

  function clear(): void {
    if (done.length === 0 && undone.length === 0) return;
    done.length = 0;
    undone.length = 0;
    changed();
  }

  /** Drop the oldest steps past either limit. */
  function trim(): void {
    let bytes = done.reduce((sum, step) => sum + step.bytes, 0);
    while (done.length > 0 && (done.length > maxSteps || bytes > maxBytes)) {
      bytes -= done.shift()!.bytes;
    }
  }

  /**
   * The index entries a write's deletes will remove; none without an index. A
   * read that fails keeps none: the write still lands, and undo leaves those
   * files untracked.
   */
  async function entriesFor(changes: readonly PortChange[]): Promise<IndexEntry[]> {
    const paths = deletedPaths(changes);
    if (!index || paths.length === 0) return [];
    try {
      return await index.entries(paths);
    } catch {
      return [];
    }
  }

  /** Put entries back; the index says why when it cannot (the write stands either way). */
  async function restore(entries: readonly IndexEntry[]): Promise<void> {
    if (!index || entries.length === 0) return;
    try {
      await index.restore(entries);
    } catch {
      // the index's own warning says so
    }
  }

  /** A write with no step: the journal empties once it lands. */
  async function unjournaled(
    changes: readonly PortChange[]
  ): Promise<Result<{ versions: Record<string, string> }>> {
    const written = await port.put(changes);
    if (written.ok) clear();
    return written;
  }

  /** What a step's inverse needs, read; or why the step cannot be kept, or `null` to let the port refuse. */
  async function plan(
    changes: readonly PortChange[]
  ): Promise<
    | { kind: 'step'; forward: PortChange[]; sent: PortChange[]; inverse: PortChange[] }
    | { kind: 'unkept'; reason: UnkeptReason; path?: string }
    | { kind: 'port' }
  > {
    const sent: PortChange[] = [];
    const inverse: PortChange[] = [];
    for (const change of changes) {
      if (change.kind === 'create') {
        sent.push(change);
        inverse.unshift({ kind: 'delete', path: change.path });
        continue;
      }
      if (change.kind === 'move' && change.content === undefined) {
        sent.push(change);
        inverse.unshift({ kind: 'move', from: change.path, path: change.from });
        continue;
      }
      // A write, a delete, or a move with new text: the old text is read first.
      let read: Awaited<ReturnType<StoragePort['get']>>;
      try {
        read = await port.get(sourceOf(change));
      } catch {
        // A file the port cannot open (no permission to read it) cannot be kept
        // either. Whether it can be written is the port's to say.
        return { kind: 'unkept', reason: 'not-text', path: sourceOf(change) };
      }
      if (!read.ok) {
        if (NOT_TEXT.has(read.code)) {
          return { kind: 'unkept', reason: 'not-text', path: sourceOf(change) };
        }
        // Missing, or not a usable path: the port refuses the call as it would anyway.
        return { kind: 'port' };
      }
      sent.push({ ...change, base: change.base ?? read.version } as PortChange);
      if (change.kind === 'write') {
        inverse.unshift({ kind: 'write', path: change.path, content: read.text });
      } else if (change.kind === 'delete') {
        inverse.unshift({ kind: 'create', path: change.path, content: read.text });
      } else {
        inverse.unshift({ kind: 'move', from: change.path, path: change.from, content: read.text });
      }
    }
    return { kind: 'step', forward: changes.map(bare), sent, inverse };
  }

  async function step(
    label: string,
    changes: readonly PortChange[],
    mode: 'refuse' | 'write',
    told: (reason: UnkeptReason | null) => void
  ): Promise<Result<{ versions: Record<string, string> }>> {
    told(null);
    // A malformed call, or an empty one, is the port's to answer.
    if (!wellFormed(changes) || changes.length === 0) return port.put(changes);

    const planned = await plan(changes);
    if (planned.kind === 'port') {
      const written = await port.put(changes);
      // Only a race lands here (the file came back between the read and the write).
      if (written.ok) {
        clear();
        told('not-text');
      }
      return written;
    }
    let unkept: { reason: UnkeptReason; path?: string } | null =
      planned.kind === 'unkept' ? planned : null;
    let bytes = 0;
    if (planned.kind === 'step') {
      bytes = contentBytes(planned.inverse) + contentBytes(planned.forward);
      if (bytes > maxBytes) unkept = { reason: 'too-large' };
    }
    if (unkept) {
      if (mode === 'refuse') {
        const failure: CannotUndo = {
          ...fail(
            'HOST_CANNOT_UNDO',
            unkept.reason === 'too-large'
              ? `This is too large to undo: the journal keeps at most ${Math.round(maxBytes / 1024 / 1024)} MiB. Send it again with "unjournaled": true to write it anyway.`
              : `${JSON.stringify(unkept.path)} is not text, is over 2 MiB or cannot be read, so deleting it cannot be undone. Send it again with "unjournaled": true to write it anyway.`
          ),
          reason: unkept.reason,
        };
        return failure;
      }
      const written = await unjournaled(changes);
      if (written.ok) told(unkept.reason);
      return written;
    }
    const kept = planned as Extract<typeof planned, { kind: 'step' }>;

    const entries = await entriesFor(kept.sent);
    const written = await port.put(kept.sent);
    if (!written.ok) return written;
    done.push({
      label,
      inverse: kept.inverse,
      forward: kept.forward,
      after: versionsAfter(kept.sent, written.versions),
      ...(entries.length > 0 ? { index: entries } : {}),
      bytes,
    });
    undone.length = 0;
    trim();
    changed();
    return written;
  }

  /** The file that refuses `changes` now, when the listing and the reads can tell. */
  async function culprit(changes: readonly PortChange[]): Promise<string | undefined> {
    let nodes: FolderNode[];
    try {
      nodes = await port.list();
    } catch {
      return undefined;
    }
    const files = new Set(nodes.filter((node) => node.type === 'blob').map((node) => node.path));
    const folders = new Set(nodes.filter((node) => node.type === 'tree').map((node) => node.path));
    const taken = (path: string): boolean =>
      files.has(path) || folders.has(path) || foldersOf(path).some((folder) => files.has(folder));
    for (const change of changes) {
      if (change.kind === 'create') {
        if (taken(change.path)) return change.path;
        continue;
      }
      const source = sourceOf(change);
      if (!files.has(source)) return source;
      if (change.kind === 'move' && taken(change.path)) return change.path;
      if (change.base !== undefined) {
        const read = await port.get(source);
        if (read.ok && read.version !== change.base) return source;
      }
    }
    return undefined;
  }

  /** Write one side's changes at the versions it holds; a conflict names the file. */
  async function take(
    label: string,
    changes: readonly PortChange[],
    versions: Readonly<Record<string, string | null>>,
    what: 'undo' | 'redo'
  ): Promise<Result<{ versions: Record<string, string>; removed: IndexEntry[] }>> {
    const sent = atVersions(changes, versions);
    const removed = await entriesFor(sent);
    const written = await port.put(sent);
    if (written.ok) return ok({ versions: written.versions, removed });
    if (!CONFLICTS.has(written.code)) return written;
    const path = (await culprit(sent)) ?? quotedPath(written.message);
    const verb = what === 'undo' ? 'undone' : 'done again';
    const why =
      written.code === 'HOST_PATH_EXISTS'
        ? `there is a file at ${JSON.stringify(path)} now`
        : written.code === 'HOST_FILE_NOT_FOUND'
          ? `${JSON.stringify(path)} is gone`
          : `${JSON.stringify(path)} changed since`;
    const conflict: UndoConflict = {
      ...fail(
        'HOST_UNDO_CONFLICT',
        path === undefined
          ? `“${label}” cannot be ${verb}: a file it touches changed since. Nothing was written.`
          : `“${label}” cannot be ${verb}: ${why}. Nothing was written.`
      ),
      ...(path === undefined ? {} : { path }),
    };
    return conflict;
  }

  function undo(): Promise<Result<JournalMove>> {
    return exclusive(async () => {
      const last = done.at(-1);
      if (!last) return fail('HOST_NOTHING_TO_UNDO', 'There is nothing to undo.');
      const taken = await take(last.label, last.inverse, last.after, 'undo');
      if (!taken.ok) return taken;
      done.pop();
      undone.push({
        step: last,
        before: versionsAfter(atVersions(last.inverse, last.after), taken.versions),
        removed: taken.removed,
      });
      changed();
      // A move needs nothing: the port moved its entry with it.
      await restore(last.index ?? []);
      return ok(movesOf(last.label, last.inverse));
    });
  }

  function redo(): Promise<Result<JournalMove>> {
    return exclusive(async () => {
      const next = undone.at(-1);
      if (!next) return fail('HOST_NOTHING_TO_REDO', 'There is nothing to redo.');
      const { step: last, before, removed } = next;
      const taken = await take(last.label, last.forward, before, 'redo');
      if (!taken.ok) return taken;
      undone.pop();
      const { index: _index, ...rest } = last;
      done.push({
        ...rest,
        after: versionsAfter(atVersions(last.forward, before), taken.versions),
        ...(taken.removed.length > 0 ? { index: taken.removed } : {}),
      });
      changed();
      await restore(removed);
      return ok(movesOf(last.label, last.forward));
    });
  }

  return {
    port(label, portOptions = {}) {
      const mode = portOptions.unkept ?? 'write';
      let unkept: UnkeptReason | null = null;
      return {
        list: () => port.list(),
        get: (path) => port.get(path),
        status: () => port.status(),
        put: (changes) =>
          exclusive(() =>
            step(label, changes, mode, (reason) => {
              unkept = reason;
            })
          ),
        get unkept() {
          return unkept;
        },
      };
    },
    write: (changes) => exclusive(() => unjournaled(changes)),
    undo,
    redo,
    labels: () => ({
      undo: done.at(-1)?.label ?? null,
      redo: undone.at(-1)?.step.label ?? null,
    }),
    steps: () => ({ undo: [...done], redo: undone.map((entry) => entry.step) }),
    clear,
  };
}
