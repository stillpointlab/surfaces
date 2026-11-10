/**
 * Tasks from a host's files (phase 7, tasks-rules): the snapshot a host hands
 * the core, the instance resolved from it, and the three states the elements
 * render — a board, a stage, the nav. Pure: the host reads the files (drafts
 * already laid over) and supplies the facts only it knows; nothing here sees
 * goods, users, caches or a repository.
 */
import { fail, ok } from '@stillpointlab/common-format/app';

import {
  collectUnprojectedFileWarnings,
  detectBoards,
  detectPool,
  kindEntriesOf,
  synthesizeBoardForPath,
  withSynthesizedBoards,
} from './boardDetection.js';
import {
  columnWarning,
  effectiveColumn,
  parseCardProjection,
  resolveProjectionColumn,
} from './cardProjection.js';
import { parseTasksManifest } from './manifest.js';
import { buildTasksNav, resolveCurrentPointerPath } from './nav.js';
import { orderPoolCards, parseOrderFileDetailed } from './pool.js';

import type { TaskPoolDescriptor } from './boardDetection.js';
import type { CardProjection } from './cardProjection.js';
import type {
  SharedTaskBoardDescriptor,
  SharedTaskBoardState,
  SharedTaskCard,
  SharedTaskCardKind,
  SharedTaskHousekeepingFile,
  SharedTaskPoolState,
  SharedTaskStageState,
  SharedTasksManifest,
  SharedTasksNav,
  TreeNode,
} from './types.js';
import type { AppSnapshot, Result } from '@stillpointlab/common-format/app';

/**
 * What a host hands the tasks core: the contract's snapshot, plus the cards it
 * holds parsed and the moves still pending.
 *
 * `files` carries the manifest, the pool's order file, templates and whichever
 * cards the host read. A card in neither `files` nor `projections` is one the
 * host could not read: it renders in needs-attention as `content unavailable`.
 */
export interface TasksSnapshot extends AppSnapshot {
  /**
   * Cards the host holds parsed and did not read (a cache keyed by the blob),
   * by path, under the manifest's frontmatter key. A path in `files` wins.
   */
  projections?: Readonly<Record<string, CardProjection>>;
  /**
   * Pending moves: each moved card's current path and the old paths it moved
   * from, the original path (the move's anchor) first, then any paths it
   * passed through. The anchor is hidden everywhere (the render, pool order,
   * column counts, card lookup) — a card is where it moved to; the hops are
   * for finding links to fix.
   */
  moves?: Readonly<Record<string, readonly string[]>>;
  /**
   * Cards created in the host that have no upstream file yet (never checked
   * in). Moving one only renames it: there is no old file to delete.
   */
  created?: readonly string[];
  /**
   * Cards whose check-in pull request is in flight. A move that would strand
   * that commit is refused: a created card's, or undoing a pending move.
   */
  inFlight?: readonly string[];
}

/** What only the host knows about one card, laid onto it. Ids are never facts. */
export interface TasksCardFacts {
  /** The host's title for the card; the file name when absent. */
  title?: string;
  /** No local copy: rendered straight from the repository, read-only (ADR-0023). */
  tracked?: boolean;
  /** The local content differs from the latest version (the check-in set). */
  changed?: boolean;
  /** The local column differs from the latest version's. */
  dirty?: boolean;
  /** The latest version's column, when the local one differs. */
  versionColumn?: string | null;
  /** The local copy is based on a version that is no longer the latest. */
  diverged?: 'metadata' | 'content';
  /** The card's old path while its move is pending. */
  movedFrom?: string;
  /** The open check-in pull request that carries the card. */
  checkinPrUrl?: string;
  /** The live state of the card's `pr:`. */
  prState?: 'open' | 'merged' | 'closed';
}

/** The facts a host lays onto the board and stage states. */
export interface TasksHostFacts {
  /** By card path (the current one, for a moved card). */
  cards?: Readonly<Record<string, TasksCardFacts>>;
  /** The pool's order file, when the host has a local copy of it. */
  order?: { changed: boolean };
  /** Changed files beyond the cards that join a check-in. */
  housekeeping?: readonly SharedTaskHousekeepingFile[];
}

/** The instance a snapshot holds: what every projection (and op) reads. */
export interface ResolvedTasks {
  manifestPath: string;
  manifest: SharedTasksManifest;
  /** Parse warnings, then markdown no declared kind projects (ADR-0028 decision 4). */
  manifestWarnings: string[];
  /** Detected boards plus the synthesized ones, by path. */
  boards: SharedTaskBoardDescriptor[];
  pool: TaskPoolDescriptor;
  /** The folder the manifest sits in. */
  docsRoot: string;
  /** The old paths of pending moves. */
  movedAway: ReadonlySet<string>;
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

/** The snapshot's paths as the tree nodes detection reads. */
function nodesOf(snapshot: TasksSnapshot): TreeNode[] {
  return snapshot.paths.map((path) => ({ path, type: 'blob', sha: '' }));
}

/**
 * The paths cards moved away from: each pending move's anchor, except a path
 * some card now holds. A hop is not hidden: it was never upstream, so only a
 * file created there since can hold it, and that file is a card.
 */
function movedAwayOf(snapshot: TasksSnapshot): Set<string> {
  const moves = snapshot.moves ?? {};
  const hidden = new Set(
    Object.values(moves)
      .map((old) => old[0])
      .filter((anchor): anchor is string => anchor !== undefined)
  );
  for (const current of Object.keys(moves)) hidden.delete(current);
  return hidden;
}

/**
 * The instance a snapshot holds: `null` when its manifest is not among the
 * host's paths (a dangling instance), `TASKS_MANIFEST_INVALID` when the
 * manifest does not parse.
 */
export function resolveTasks(snapshot: TasksSnapshot): Result<{ tasks: ResolvedTasks }> | null {
  const { manifestPath } = snapshot;
  if (!snapshot.paths.includes(manifestPath)) return null;
  const content = snapshot.files[manifestPath] ?? null;
  if (content === null) {
    return fail('TASKS_MANIFEST_INVALID', 'Invalid tasks.yaml: its content is unavailable');
  }
  const parsed = parseTasksManifest(content);
  if (!parsed.ok) {
    return fail('TASKS_MANIFEST_INVALID', `Invalid tasks.yaml: ${parsed.errors.join('; ')}`);
  }
  const { manifest } = parsed;
  const nodes = nodesOf(snapshot);
  return ok({
    tasks: {
      manifestPath,
      manifest,
      manifestWarnings: [
        ...parsed.warnings,
        ...collectUnprojectedFileWarnings(nodes, manifestPath, manifest.kinds),
      ],
      boards: withSynthesizedBoards(
        detectBoards(nodes, manifestPath, manifest.kinds),
        manifest,
        manifestPath
      ),
      pool: detectPool(nodes, manifestPath, manifest.kinds),
      docsRoot: dirname(manifestPath),
      movedAway: movedAwayOf(snapshot),
    },
  });
}

/** The resolved instance, or `null` for a missing or broken manifest. */
function resolvedOrNull(snapshot: TasksSnapshot): ResolvedTasks | null {
  const resolved = resolveTasks(snapshot);
  return resolved?.ok ? resolved.tasks : null;
}

/** Where a card's content comes from: the snapshot's files and held projections. */
export type CardSources = Pick<TasksSnapshot, 'files' | 'projections'>;

/** A card's parsed content: the file when the host read it, else its held projection. */
function projectionOf(
  snapshot: CardSources,
  path: string,
  manifest: SharedTasksManifest
): CardProjection | null {
  const content = snapshot.files[path];
  if (content !== undefined && content !== null) {
    return parseCardProjection(content, manifest.frontmatterKey);
  }
  return snapshot.projections?.[path] ?? null;
}

/**
 * The column a card's content renders in (`null`: needs attention) — for a
 * host working out a fact such as the latest version's column.
 */
export function columnOfContent(
  content: string,
  manifest: SharedTasksManifest,
  location: 'board' | 'pool' = 'board'
): string | null {
  const projection = parseCardProjection(content, manifest.frontmatterKey);
  return effectiveColumn(resolveProjectionColumn(projection, manifest), manifest, location);
}

/** The basename a card is titled by when the host gives no title. */
function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * One card from its entry: its content projected, its column resolved where it
 * sits, the host's facts laid on — for a host that already knows the card's
 * kind and location (a card it just moved, say).
 */
export function projectCardEntry(
  snapshot: CardSources,
  entry: { path: string; kind: SharedTaskCardKind },
  manifest: SharedTasksManifest,
  location: 'board' | 'pool',
  facts: TasksCardFacts = {}
): SharedTaskCard {
  const projection = projectionOf(snapshot, entry.path, manifest);
  const read = projection === null ? null : resolveProjectionColumn(projection, manifest);
  const parseError = read === null ? 'content unavailable' : read.parseError;
  const warning = read === null ? undefined : columnWarning(read, manifest, location);
  const tags = projection?.tags ?? null;
  const card: SharedTaskCard = {
    ...(facts.tracked === true ? { tracked: true as const } : {}),
    title: facts.title ?? fileName(entry.path),
    ...(projection?.title !== undefined ? { frontmatterTitle: projection.title } : {}),
    path: entry.path,
    kind: entry.kind,
    column: read === null ? null : effectiveColumn(read, manifest, location),
    dirty: facts.dirty ?? false,
    changed: facts.changed ?? false,
    ...(facts.versionColumn !== undefined ? { versionColumn: facts.versionColumn } : {}),
    ...(facts.checkinPrUrl !== undefined ? { checkinPrUrl: facts.checkinPrUrl } : {}),
    ...(warning !== undefined ? { warning } : {}),
    ...(facts.movedFrom !== undefined ? { movedFrom: facts.movedFrom } : {}),
    ...(tags !== null && tags.length > 0 ? { tags } : {}),
    ...(projection?.meta ?? {}),
    ...(facts.diverged !== undefined ? { diverged: facts.diverged } : {}),
  };
  if (facts.prState !== undefined && card.pr !== undefined) card.prState = facts.prState;
  return parseError === undefined ? card : { ...card, parseError };
}

/** The cards of a board (or the pool) descriptor, moved-away paths hidden. */
function projectCards(
  snapshot: TasksSnapshot,
  tasks: ResolvedTasks,
  holder: Pick<SharedTaskBoardDescriptor, 'paths'>,
  location: 'board' | 'pool',
  facts: TasksHostFacts
): SharedTaskCard[] {
  return kindEntriesOf(holder, tasks.manifest.kinds)
    .filter((entry) => !tasks.movedAway.has(entry.path))
    .map((entry) =>
      projectCardEntry(snapshot, entry, tasks.manifest, location, facts.cards?.[entry.path] ?? {})
    );
}

/** The backlog pool: its cards in the order file's order, unlisted ones last by path. */
export function projectTasksPool(
  snapshot: TasksSnapshot,
  tasks: ResolvedTasks,
  facts: TasksHostFacts = {}
): SharedTaskPoolState {
  const { pool } = tasks;
  const cards = projectCards(snapshot, tasks, pool, 'pool', facts);
  const order = parseOrderFileDetailed(snapshot.files[pool.orderPath] ?? '');
  return {
    path: pool.path,
    orderPath: pool.orderPath,
    cards: orderPoolCards(cards, order.paths),
    ...(facts.order !== undefined ? { order: { changed: facts.order.changed } } : {}),
    ...(order.invalid
      ? { orderWarning: 'order.yaml could not be parsed — cards are shown in path order' }
      : {}),
  };
}

/**
 * One card by path from a resolved instance, projected where it sits (a board
 * or the pool) — for a host answering with a single fresh card. `null` when no
 * card is there, or the path is a pending move's old one.
 */
export function projectResolvedCard(
  snapshot: TasksSnapshot,
  tasks: ResolvedTasks,
  path: string,
  facts: TasksHostFacts = {}
): SharedTaskCard | null {
  if (tasks.movedAway.has(path)) return null;
  const { manifest } = tasks;
  const find = (holder: Pick<SharedTaskBoardDescriptor, 'paths'>) =>
    kindEntriesOf(holder, manifest.kinds).find((entry) => entry.path === path);
  const pooled = find(tasks.pool);
  if (pooled)
    return projectCardEntry(snapshot, pooled, manifest, 'pool', facts.cards?.[path] ?? {});
  for (const board of tasks.boards) {
    const entry = find(board);
    if (entry)
      return projectCardEntry(snapshot, entry, manifest, 'board', facts.cards?.[path] ?? {});
  }
  return null;
}

const byPath = (a: { path: string }, b: { path: string }): number => a.path.localeCompare(b.path);

/** One phase board from a resolved instance; `null` for a path that is no board. */
export function projectResolvedBoard(
  snapshot: TasksSnapshot,
  tasks: ResolvedTasks,
  path: string,
  facts: TasksHostFacts = {}
): SharedTaskBoardState | null {
  // A shape-valid path that no folder backs is an empty board — missing
  // intermediate phases stay reachable by URL.
  const board =
    tasks.boards.find((candidate) => candidate.path === path) ??
    synthesizeBoardForPath(path, tasks.docsRoot);
  if (!board) return null;
  const { manifest, manifestWarnings } = tasks;
  return {
    board,
    columns: manifest.columns,
    cards: projectCards(snapshot, tasks, board, 'board', facts).sort(byPath),
    pool: projectTasksPool(snapshot, tasks, facts),
    housekeeping: [...(facts.housekeeping ?? [])],
    kinds: manifest.kinds,
    tags: manifest.tags,
    doneColumn: manifest.doneColumn,
    defaultColumn: manifest.defaultColumn,
    ...(manifestWarnings.length > 0 ? { manifestWarnings } : {}),
  };
}

/** One stage's phases as rows, from a resolved instance; `null` for a stage with no phases. */
export function projectResolvedStage(
  snapshot: TasksSnapshot,
  tasks: ResolvedTasks,
  stage: number,
  facts: TasksHostFacts = {}
): SharedTaskStageState | null {
  const boards = tasks.boards
    .filter((board) => board.stage === stage && board.phase !== undefined)
    .sort((a, b) => a.phase! - b.phase!);
  if (boards.length === 0) return null;
  const { manifest, manifestWarnings } = tasks;
  return {
    stage,
    columns: manifest.columns,
    kinds: manifest.kinds,
    phases: boards.map((board) => ({
      phase: board.phase!,
      path: board.path,
      label: board.label,
      cards: projectCards(snapshot, tasks, board, 'board', facts).sort(byPath),
    })),
    pool: projectTasksPool(snapshot, tasks, facts),
    housekeeping: [...(facts.housekeeping ?? [])],
    tags: manifest.tags,
    ...(manifestWarnings.length > 0 ? { manifestWarnings } : {}),
  };
}

/** The tab strip's state without a page's selection: what a nav refresh hands it. */
export interface TasksNavProjection {
  nav: SharedTasksNav;
  currentPointer: { stage: number; phase: number } | null;
  /** The pointer's board, or `null` when its phase is not in the nav. */
  currentPointerPath: string | null;
  doneColumn: string;
}

/** The nav from a resolved instance. */
export function projectResolvedNav(tasks: ResolvedTasks): TasksNavProjection {
  const nav = buildTasksNav(tasks.boards);
  return {
    nav,
    currentPointer: tasks.manifest.current ?? null,
    currentPointerPath: resolveCurrentPointerPath(nav, tasks.manifest),
    doneColumn: tasks.manifest.doneColumn,
  };
}

/** One phase board; `null` for a missing or broken manifest, or a path that is no board. */
export function projectTasksBoard(
  snapshot: TasksSnapshot,
  path: string,
  facts: TasksHostFacts = {}
): SharedTaskBoardState | null {
  const tasks = resolvedOrNull(snapshot);
  return tasks && projectResolvedBoard(snapshot, tasks, path, facts);
}

/** One stage; `null` for a missing or broken manifest, or a stage with no phases. */
export function projectTasksStage(
  snapshot: TasksSnapshot,
  stage: number,
  facts: TasksHostFacts = {}
): SharedTaskStageState | null {
  const tasks = resolvedOrNull(snapshot);
  return tasks && projectResolvedStage(snapshot, tasks, stage, facts);
}

/** The nav; `null` for a missing or broken manifest. */
export function projectTasksNav(snapshot: TasksSnapshot): TasksNavProjection | null {
  const tasks = resolvedOrNull(snapshot);
  return tasks && projectResolvedNav(tasks);
}
