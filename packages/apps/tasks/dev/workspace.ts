// A harness workspace: a tasks folder's files in a memory port, as the tasks
// core reads them, and the few host facts no file shows. The files the fixture
// set are the last commit; an op's changes are local edits over them, so a
// card the board changes shows changed (and dirty, when its column moved), and
// a moved one where it moved from, as the module's `fromChanges` reads the
// port's changes. There are no drafts, check-in or repository.
import { createMemoryPort } from '@stillpointlab/common-format/host';

import { tasksCore, tasksModule } from '../src/index.js';

import type {
  SharedTaskBoardState,
  SharedTaskStageState,
  TasksCardFacts,
  TasksHostFacts,
  TasksNavProjection,
  TasksSnapshot,
} from '../src/index.js';
import type { AppKnown } from '@stillpointlab/common-format/app';
import type { MemoryPort } from '@stillpointlab/common-format/host';

export interface Workspace {
  /** The files: the fixture's as the last commit, with the local edits over them. */
  port: MemoryPort;
  manifestPath: string;
  /**
   * Facts the files do not show (a card left tracked, a check-in PR, a
   * divergence), by the path the fixture gave the card.
   */
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
  return {
    port: createMemoryPort({ ...files, ...options.edited }, { committed: files }),
    manifestPath,
    fixed: structuredClone(options.fixed ?? {}),
  };
}

/** The path the fixture gave the card now at `path`: where a moved card was. */
export function fixedPath(ws: Workspace, path: string): string {
  return ws.port.changes().find((change) => change.path === path)?.from ?? path;
}

/**
 * What the host knows: the module's `fromChanges` over the port's changes,
 * laid over the fixture's pinned facts. A card that changed is no longer left
 * tracked: changing it links it, as a host's first edit does.
 */
export function knowOf(
  ws: Workspace,
  snapshot: TasksSnapshot
): AppKnown<TasksHostFacts, TasksSnapshot> {
  const changes = ws.port.changes();
  const known = tasksModule.fromChanges(changes, snapshot);
  const movedFrom = new Map(changes.map((change) => [change.path, change.from]));
  const cards: Record<string, TasksCardFacts> = {};
  for (const path of snapshot.paths) {
    const pinned = ws.fixed[movedFrom.get(path) ?? path];
    const facts: TasksCardFacts = { ...pinned, ...known.facts.cards?.[path] };
    if (facts.changed) delete facts.tracked;
    if (Object.keys(facts).length > 0) cards[path] = facts;
  }
  return { ...known, facts: { ...known.facts, cards } };
}

/** The workspace as the core reads it: its files with the host's parts laid on, and the facts. */
export function read(ws: Workspace): { snapshot: TasksSnapshot; facts: TasksHostFacts } {
  const files = ws.port.files();
  const loaded: TasksSnapshot = { manifestPath: ws.manifestPath, paths: Object.keys(files), files };
  const known = knowOf(ws, loaded);
  return { snapshot: { ...loaded, ...known.snapshot }, facts: known.facts };
}

/** One board, as a host projects it for `<spl-task-board>`. */
export function boardOf(ws: Workspace, path: string): SharedTaskBoardState | null {
  const { snapshot, facts } = read(ws);
  return tasksCore.project(snapshot, { type: 'board', path }, facts);
}

/** One stage's phases, for the board's stage view. */
export function stageOf(ws: Workspace, stage: number): SharedTaskStageState | null {
  const { snapshot, facts } = read(ws);
  return tasksCore.project(snapshot, { type: 'stage', stage }, facts);
}

/** The nav, for `<spl-tasks-nav>` (the page adds its selection). */
export function navOf(ws: Workspace): TasksNavProjection | null {
  const { snapshot, facts } = read(ws);
  return tasksCore.project(snapshot, { type: 'nav' }, facts);
}
