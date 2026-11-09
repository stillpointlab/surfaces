/**
 * The card ops (phase 7, tasks-rules step 2): each takes the snapshot and the
 * op as the board asks for it, by path, and answers the file changes it makes
 * or a refusal, with the codes and messages Context Manager's endpoints have
 * always sent. Every refusal is decided before any change. How a change is
 * written (a draft, a new file, a move's bookkeeping) is the host's.
 */
import { fail, ok } from '@stillpointlab/common-format/app';

import { kindEntriesOf, synthesizeBoardForPath } from './boardDetection.js';
import { readColumn, rewriteFrontmatter } from './frontmatter.js';
import { referencesPath, rewriteRelativeLinks } from './linkRewrite.js';
import { formatOrderFile, parseOrderFileDetailed } from './pool.js';
import { resolveTasks } from './projection.js';
import { taskKindById } from './types.js';

import type { ResolvedTasks, TasksSnapshot } from './projection.js';
import type { SharedTaskCardKind } from './types.js';
import type { FileChange, Result } from '@stillpointlab/common-format/app';

/** Where a move sends a card: the pool, or a board's column. */
export type CardMoveTarget = { pool: true } | { boardPath: string; column: string };

type Changes = { changes: FileChange[] };

/** A card found by path: its entry and where it sits. */
interface FoundCard {
  entry: { path: string; kind: SharedTaskCardKind };
  location: 'board' | 'pool';
}

const dirOf = (path: string): string => path.slice(0, Math.max(path.lastIndexOf('/'), 0));
const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const isMarkdown = (path: string): boolean => /\.(md|markdown)$/i.test(path);

/** The instance, or the refusal a host answers for a missing or broken manifest. */
function resolved(snapshot: TasksSnapshot): Result<{ tasks: ResolvedTasks }> {
  return (
    resolveTasks(snapshot) ?? fail('TASKS_MANIFEST_NOT_FOUND', 'This repository has no tasks.yaml')
  );
}

/** The card at a path, where it sits; a moved-away path is no card. */
function findCard(tasks: ResolvedTasks, path: string): FoundCard | null {
  if (tasks.movedAway.has(path)) return null;
  const { kinds } = tasks.manifest;
  const pooled = kindEntriesOf(tasks.pool, kinds).find((entry) => entry.path === path);
  if (pooled) return { entry: pooled, location: 'pool' };
  for (const board of tasks.boards) {
    const entry = kindEntriesOf(board, kinds).find((candidate) => candidate.path === path);
    if (entry) return { entry, location: 'board' };
  }
  return null;
}

const cardNotFound = (path: string) => fail('TASKS_CARD_NOT_FOUND', `No task card at ${path}`);

/** A card and its content, or why not. */
function cardWithContent(
  snapshot: TasksSnapshot,
  tasks: ResolvedTasks,
  path: string
): Result<FoundCard & { content: string }> {
  const found = findCard(tasks, path);
  if (!found) return cardNotFound(path);
  const content = snapshot.files[path];
  if (content === undefined || content === null) {
    return fail('TASKS_CARD_CONTENT_UNAVAILABLE', 'Card content is unavailable');
  }
  return ok({ ...found, content });
}

/** Every path a new or moved file may not take: the host's paths (moved-away ones freed) and `taken`. */
function occupied(snapshot: TasksSnapshot, tasks: ResolvedTasks): Set<string> {
  return new Set([
    ...snapshot.paths.filter((path) => !tasks.movedAway.has(path)),
    ...(snapshot.taken ?? []),
  ]);
}

/** Every path a link may point at: the host's paths and `taken`. */
function known(snapshot: TasksSnapshot): (path: string) => boolean {
  const paths = new Set([...snapshot.paths, ...(snapshot.taken ?? [])]);
  return (path) => paths.has(path);
}

/** The column key rewritten, refused when the rewrite would break a valid file. */
function withColumn(
  content: string,
  column: string | null,
  tasks: ResolvedTasks
): Result<{ content: string }> {
  const { manifest } = tasks;
  const rewritten = rewriteFrontmatter(content, { [manifest.frontmatterKey]: column });
  // An already-broken block keeps its repair-attempt semantics (written; the
  // card renders with its parse error). But a rewrite must never turn a valid
  // file into an unparseable one.
  if (
    readColumn(content, manifest).parseError === undefined &&
    readColumn(rewritten, manifest).parseError !== undefined
  ) {
    return fail(
      'TASKS_CARD_NEEDS_ATTENTION',
      'The card frontmatter cannot be patched — fix it in the editor first'
    );
  }
  return ok({ content: rewritten });
}

const unknownColumn = (column: string) =>
  fail('TASKS_UNKNOWN_COLUMN', `'${column}' is not a column declared in tasks.yaml`);

/** A card to a column of its board, or `null` to drop the key (the default column). */
export function moveTaskCard(
  snapshot: TasksSnapshot,
  op: { path: string; column: string | null }
): Result<Changes> {
  const instance = resolved(snapshot);
  if (!instance.ok) return instance;
  const { tasks } = instance;
  if (op.column !== null && !tasks.manifest.columns.some((column) => column.id === op.column)) {
    return unknownColumn(op.column);
  }
  const card = cardWithContent(snapshot, tasks, op.path);
  if (!card.ok) return card;
  if (card.location === 'pool') {
    return fail(
      'TASKS_CARD_IN_POOL',
      'Backlog-pool cards have no column — move the card to a phase instead'
    );
  }
  const rewritten = withColumn(card.content, op.column, tasks);
  if (!rewritten.ok) return rewritten;
  return ok({ changes: [{ kind: 'write', path: op.path, content: rewritten.content }] });
}

/**
 * A card's file to the pool or to a board's column: one `move` change (the
 * column key rewritten, its relative links re-rooted), and, when it leaves the
 * pool, the order file without it. `coMoving` names files moving in the same
 * batch (old path → new), whose links between them stay as they are.
 */
export function moveTaskCardFile(
  snapshot: TasksSnapshot,
  op: { path: string; target: CardMoveTarget; coMoving?: Readonly<Record<string, string>> }
): Result<Changes & { path: string; location: 'board' | 'pool' }> {
  const instance = resolved(snapshot);
  if (!instance.ok) return instance;
  const { tasks } = instance;
  const { manifest } = tasks;
  const found = findCard(tasks, op.path);
  if (!found) return cardNotFound(op.path);
  const { entry, location } = found;

  const inFlight = new Set(snapshot.inFlight ?? []);
  const anchor = snapshot.moves?.[op.path]?.[0];
  // A created file whose first check-in is in flight has no upstream yet: a
  // move now would strand the open pull request's commit of the old path.
  if (inFlight.has(op.path) && anchor === undefined && (snapshot.created ?? []).includes(op.path)) {
    return fail(
      'TASKS_CHECKIN_IN_FLIGHT',
      'This card has a check-in PR in flight — merge or close it, then Refresh, before moving it'
    );
  }

  let destRoot: string;
  let column: string | null;
  let destLocation: 'board' | 'pool';
  if ('pool' in op.target) {
    if (location === 'pool') {
      return fail('TASKS_MOVE_NOOP', 'The card is already in the backlog pool');
    }
    destRoot = tasks.pool.path;
    column = null; // pool cards carry no column key (ADR-0020)
    destLocation = 'pool';
  } else {
    const { boardPath, column: targetColumn } = op.target;
    // A phase with no folders yet is still a board (a close's target, say).
    const board =
      tasks.boards.find((candidate) => candidate.path === boardPath) ??
      synthesizeBoardForPath(boardPath, tasks.docsRoot);
    if (!board) return fail('TASKS_BOARD_NOT_FOUND', `No task board at ${boardPath}`);
    if (!manifest.columns.some((candidate) => candidate.id === targetColumn)) {
      return unknownColumn(targetColumn);
    }
    destRoot = board.path;
    column = targetColumn;
    destLocation = 'board';
  }

  const kindDir = taskKindById(manifest.kinds, entry.kind)!.dir;
  const name = baseName(entry.path);
  const newPath = destRoot === '' ? `${kindDir}/${name}` : `${destRoot}/${kindDir}/${name}`;
  if (newPath === entry.path) {
    return fail('TASKS_MOVE_NOOP', 'The card is already at that location');
  }
  if (occupied(snapshot, tasks).has(newPath)) {
    return fail('TASKS_MOVE_TARGET_EXISTS', `“${name}” already exists at the destination`);
  }
  // Undoing a move while its check-in is in flight would clear the delete a
  // live commit depends on.
  if (newPath === anchor && inFlight.has(op.path)) {
    return fail(
      'TASKS_CHECKIN_IN_FLIGHT',
      'This card has a check-in PR in flight — merge or close it, then Refresh, before undoing the move'
    );
  }

  const content = snapshot.files[op.path];
  if (content === undefined || content === null) {
    return fail('TASKS_CARD_CONTENT_UNAVAILABLE', 'Card content is unavailable');
  }
  const rewritten = withColumn(content, column, tasks);
  if (!rewritten.ok) return rewritten;
  // Re-root the file's outbound links for its new folder; links between
  // co-moving files stay byte-identical, and links already broken stay as
  // they are.
  const links = rewriteRelativeLinks(
    rewritten.content,
    dirOf(entry.path),
    dirOf(newPath),
    known(snapshot),
    op.coMoving ? new Map(Object.entries(op.coMoving)) : undefined
  );

  const changes: FileChange[] = [
    { kind: 'move', from: op.path, path: newPath, content: links.content },
  ];
  // Leaving the pool for a board prunes the card from the order file, so stale
  // entries do not pile up until someone reorders.
  if (location === 'pool' && destLocation === 'board') {
    const orderContent = snapshot.files[tasks.pool.orderPath];
    if (orderContent !== undefined && orderContent !== null) {
      const order = parseOrderFileDetailed(orderContent).paths;
      if (order.includes(op.path)) {
        changes.push({
          kind: 'write',
          path: tasks.pool.orderPath,
          content: formatOrderFile(order.filter((path) => path !== op.path)),
        });
      }
    }
  }
  return ok({ changes, path: newPath, location: destLocation });
}

/** The pool's priority order, as the full list of its cards' paths. */
export function reorderTaskPool(
  snapshot: TasksSnapshot,
  op: { paths: readonly string[] }
): Result<Changes> {
  const instance = resolved(snapshot);
  if (!instance.ok) return instance;
  const { tasks } = instance;
  const valid = new Set(
    kindEntriesOf(tasks.pool, tasks.manifest.kinds)
      .map((entry) => entry.path)
      .filter((path) => !tasks.movedAway.has(path))
  );
  const seen = new Set<string>();
  for (const path of op.paths) {
    if (!valid.has(path)) {
      return fail('TASKS_POOL_UNKNOWN_PATH', `'${path}' is not a card in the backlog pool`);
    }
    if (seen.has(path)) {
      return fail('TASKS_POOL_DUPLICATE_PATH', `'${path}' appears more than once in the order`);
    }
    seen.add(path);
  }
  const { orderPath } = tasks.pool;
  const content = formatOrderFile([...op.paths]);
  const exists = snapshot.paths.includes(orderPath);
  return ok({ changes: [{ kind: exists ? 'write' : 'create', path: orderPath, content }] });
}

/** A card's frontmatter title, or `null` to remove it. */
export function setTaskCardTitle(
  snapshot: TasksSnapshot,
  op: { path: string; title: string | null }
): Result<Changes> {
  const instance = resolved(snapshot);
  if (!instance.ok) return instance;
  const card = cardWithContent(snapshot, instance.tasks, op.path);
  if (!card.ok) return card;
  const content = rewriteFrontmatter(card.content, { title: op.title });
  return ok({ changes: [{ kind: 'write', path: op.path, content }] });
}

/** A card's tags, each from the registry (any casing, written as declared; duplicates dropped). */
export function setTaskCardTags(
  snapshot: TasksSnapshot,
  op: { path: string; tags: readonly string[] }
): Result<Changes> {
  const instance = resolved(snapshot);
  if (!instance.ok) return instance;
  const { tasks } = instance;
  const registry = new Map(tasks.manifest.tags.map((tag) => [tag.toLowerCase(), tag]));
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of op.tags) {
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    const canonical = registry.get(trimmed.toLowerCase());
    if (canonical === undefined) {
      return fail('TASKS_UNKNOWN_TAG', `'${trimmed}' is not a tag declared in tasks.yaml`);
    }
    if (seen.has(canonical.toLowerCase())) continue;
    seen.add(canonical.toLowerCase());
    tags.push(canonical);
  }
  const card = cardWithContent(snapshot, tasks, op.path);
  if (!card.ok) return card;
  const content = rewriteFrontmatter(card.content, { tags });
  return ok({ changes: [{ kind: 'write', path: op.path, content }] });
}

/** The file name a card's title gives it, in the repository's snake_case convention. */
export function cardSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * A new card of a creatable kind on a board or in the pool, named from its
 * title: its kind's template (a snapshot file) or a frontmatter stub, with
 * the title and `now` (the creation time; the core reads no clock) seeded in.
 */
export function createTaskCard(
  snapshot: TasksSnapshot,
  op: { boardPath: string; title: string; kind: string; now: string }
): Result<Changes & { path: string }> {
  const instance = resolved(snapshot);
  if (!instance.ok) return instance;
  const { tasks } = instance;
  const { manifest } = tasks;
  // An unknown kind and a declared non-creatable one get the same answer.
  const descriptor = taskKindById(manifest.kinds, op.kind);
  if (descriptor === undefined || !descriptor.creatable) {
    return fail('TASKS_KIND_NOT_CREATABLE', `'${op.kind}' cards are not created from the board`);
  }
  const isPool = op.boardPath === tasks.pool.path;
  if (
    !isPool &&
    !tasks.boards.some((board) => board.path === op.boardPath) &&
    !synthesizeBoardForPath(op.boardPath, tasks.docsRoot)
  ) {
    return fail('TASKS_BOARD_NOT_FOUND', `No task board at ${op.boardPath}`);
  }
  const slug = cardSlug(op.title);
  if (slug === '') {
    return fail('TASKS_BRIEF_NAME_INVALID', 'The title must contain letters or numbers');
  }
  const dir = op.boardPath === '' ? descriptor.dir : `${op.boardPath}/${descriptor.dir}`;
  const path = `${dir}/${slug}.md`;
  if (occupied(snapshot, tasks).has(path)) {
    return fail('TASKS_BRIEF_EXISTS', `“${slug}.md” already exists here`);
  }

  let template = '';
  if (descriptor.template !== undefined) {
    const content = snapshot.files[descriptor.template];
    if (content === undefined || content === null) {
      return fail(
        'TASKS_TEMPLATE_UNAVAILABLE',
        `The ${descriptor.label} template could not be read`
      );
    }
    template = content;
  }
  // The title and creation time are seeded into the frontmatter (a template
  // without a block gains one). A pool card loses the template's column key;
  // a stub-created board card gains the default column explicitly.
  const content = rewriteFrontmatter(template, {
    title: op.title,
    created: op.now,
    ...(isPool
      ? { [manifest.frontmatterKey]: null }
      : descriptor.template === undefined
        ? { [manifest.frontmatterKey]: manifest.defaultColumn }
        : {}),
  });
  return ok({ changes: [{ kind: 'create', path, content }], path });
}

/** The old paths of a card's pending move: its anchor and the hops it passed through. */
function departedPaths(snapshot: TasksSnapshot, path: string): string[] {
  return (snapshot.moves?.[path] ?? []).filter((old) => old !== path);
}

/**
 * The markdown files among the snapshot's contents whose relative links point
 * at any path a moved card departed from — the files a host offers to fix. The
 * host decides which files to read; only those are scanned.
 */
export function referencesTo(snapshot: TasksSnapshot, path: string): string[] {
  const departed = departedPaths(snapshot, path);
  if (departed.length === 0) return [];
  return Object.entries(snapshot.files)
    .filter(
      ([candidate, content]) =>
        candidate !== path &&
        isMarkdown(candidate) &&
        content !== null &&
        departed.some((old) => referencesPath(content, dirOf(candidate), old))
    )
    .map(([candidate]) => candidate)
    .sort((a, b) => a.localeCompare(b));
}

/** Point the given files' links at a moved card's new path, from every path it departed from. */
export function fixTaskReferences(
  snapshot: TasksSnapshot,
  op: { path: string; referencingPaths: readonly string[] }
): Result<Changes & { fixed: number }> {
  const departed = departedPaths(snapshot, op.path);
  if (departed.length === 0) {
    return fail('TASKS_NO_PENDING_MOVE', 'The card has no pending move');
  }
  const redirect = new Map(departed.map((old) => [old, op.path]));
  const exists = known(snapshot);
  const changes: FileChange[] = [];
  for (const path of op.referencingPaths) {
    const content = snapshot.files[path];
    if (content === undefined || content === null) continue;
    const result = rewriteRelativeLinks(content, dirOf(path), dirOf(path), exists, redirect);
    if (result.rewritten > 0) changes.push({ kind: 'write', path, content: result.content });
  }
  return ok({ changes, fixed: changes.length });
}
