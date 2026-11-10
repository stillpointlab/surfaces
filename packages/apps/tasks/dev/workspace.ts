// A harness workspace: a tasks folder's files in memory, as the tasks core reads
// them, and the host facts a real host would know. The files the fixture set
// are the "latest version"; an op's changes are local edits over them, so a
// card the board changes shows changed (and dirty, when its column moved), as a
// host shows it until check-in. There are no drafts, check-in or repository.
import { columnOfContent, resolveTasks, tasksCore } from '../src/index.js';

import type {
  SharedTaskBoardState,
  SharedTaskStageState,
  TasksCardFacts,
  TasksHostFacts,
  TasksNavProjection,
  TasksSnapshot,
} from '../src/index.js';
import type { FileChange } from '@stillpointlab/common-format/app';

export interface Workspace {
  /** The files as the fixture set them: what a host's latest versions hold. */
  readonly base: Readonly<Record<string, string>>;
  /** What the core reads: the files with the local edits, and the pending moves. */
  snapshot: TasksSnapshot & {
    paths: string[];
    files: Record<string, string | null>;
    moves: Record<string, string[]>;
  };
  /** Facts the files do not show (a card left tracked, a check-in PR, a divergence), by path. */
  fixed: Record<string, TasksCardFacts>;
}

/**
 * A workspace over a fixture's files. `edited` are local changes the fixture
 * starts with, over `files`; `fixed` are the facts no file shows.
 */
export function workspace(
  manifestPath: string,
  files: Readonly<Record<string, string>>,
  options: {
    edited?: Readonly<Record<string, string>>;
    fixed?: Record<string, TasksCardFacts>;
  } = {}
): Workspace {
  const current = { ...files, ...options.edited };
  return {
    base: { ...files },
    snapshot: { manifestPath, paths: Object.keys(current), files: current, moves: {} },
    fixed: structuredClone(options.fixed ?? {}),
  };
}

/**
 * The facts a host lays on: a card whose content (or path) differs from its
 * latest version is changed, and linked; one whose column differs is dirty;
 * a moved card names where it came from. The order file and the manifest
 * count the same way.
 */
export function factsOf(ws: Workspace): TasksHostFacts {
  const { snapshot, base, fixed } = ws;
  const resolved = resolveTasks(snapshot);
  const tasks = resolved?.ok ? resolved.tasks : null;
  const changedFile = (path: string): boolean => snapshot.files[path] !== base[path];
  const cards: Record<string, TasksCardFacts> = {};
  for (const path of snapshot.paths) {
    const anchor = snapshot.moves[path]?.[0];
    const before = base[anchor ?? path];
    const now = snapshot.files[path];
    const facts: TasksCardFacts = { ...fixed[path] };
    if (anchor !== undefined || now !== before) {
      facts.changed = true;
      delete facts.tracked;
    }
    if (anchor !== undefined) facts.movedFrom = anchor;
    if (tasks && facts.changed && before !== undefined && typeof now === 'string') {
      const was = columnOfContent(before, tasks.manifest);
      if (columnOfContent(now, tasks.manifest) !== was) {
        facts.dirty = true;
        facts.versionColumn = was;
      }
    }
    cards[path] = facts;
  }
  const orderPath = tasks?.pool.orderPath;
  return {
    cards,
    ...(orderPath !== undefined && snapshot.paths.includes(orderPath)
      ? { order: { changed: changedFile(orderPath) } }
      : {}),
    housekeeping: changedFile(snapshot.manifestPath)
      ? [{ path: snapshot.manifestPath, kind: 'manifest' }]
      : [],
  };
}

/**
 * An op's changes written into memory. A move keeps the card's pending move as
 * a host does: the first move away from a file is the anchor, later ones are
 * hops, and a move back to the anchor is the undo. A file that was never in
 * the fixture (a new card) has no anchor: moving it only renames it.
 */
export function write(ws: Workspace, changes: readonly FileChange[]): void {
  const { snapshot, fixed } = ws;
  for (const change of changes) {
    if (change.kind === 'move') {
      const prior = snapshot.moves[change.from] ?? [];
      delete snapshot.moves[change.from];
      delete snapshot.files[change.from];
      snapshot.paths = snapshot.paths.filter((path) => path !== change.from);
      if (fixed[change.from]) {
        fixed[change.path] = fixed[change.from];
        delete fixed[change.from];
      }
      const anchor = prior[0] ?? (change.from in ws.base ? change.from : undefined);
      if (anchor !== undefined && anchor !== change.path) {
        const hops = prior.length === 0 ? [] : [...prior.slice(1), change.from];
        snapshot.moves[change.path] = [
          anchor,
          ...new Set(hops.filter((hop) => hop !== change.path && hop !== anchor)),
        ];
      }
    }
    snapshot.files[change.path] = change.content;
    if (!snapshot.paths.includes(change.path)) snapshot.paths.push(change.path);
  }
}

/** One board, as a host projects it for `<spl-task-board>`. */
export function boardOf(ws: Workspace, path: string): SharedTaskBoardState | null {
  return tasksCore.project(ws.snapshot, { type: 'board', path }, factsOf(ws));
}

/** One stage's phases, for the board's stage view. */
export function stageOf(ws: Workspace, stage: number): SharedTaskStageState | null {
  return tasksCore.project(ws.snapshot, { type: 'stage', stage }, factsOf(ws));
}

/** The nav, for `<spl-tasks-nav>` (the page adds its selection). */
export function navOf(ws: Workspace): TasksNavProjection | null {
  return tasksCore.project(ws.snapshot, { type: 'nav' }, factsOf(ws));
}
