/**
 * The manifest ops (phase 7, tasks-rules step 3): board settings, the tag
 * registry, the `current:` pointer and closing a phase or stage. Each takes the
 * snapshot and the op as the board and the strip ask for it, and answers the
 * file changes it makes or a refusal, with the codes and messages Context
 * Manager's endpoints have always sent. Every refusal is decided before any
 * change.
 */
import { fail, ok } from '@stillpointlab/common-format/app';
import { parse as parseYaml } from 'yaml';

import { kindEntriesOf, stagePhasePath } from './boardDetection.js';
import { findTaskCard, moveTaskCardFile, resolvedTasks } from './cardOps.js';
import { parseCardProjection } from './cardProjection.js';
import { readColumn } from './frontmatter.js';
import { parseTasksManifest } from './manifest.js';
import {
  appendManifestListEntry,
  appendManifestTag,
  patchManifestEntryKey,
  patchManifestTopLevelScalar,
  removeManifestListEntry,
  rewriteManifestCurrent,
} from './manifestRewrite.js';
import { buildTasksNav } from './nav.js';
import { resolveTasks } from './projection.js';
import { taskKindById } from './types.js';

import type { ResolvedTasks, TasksSnapshot } from './projection.js';
import type { SharedTaskManifestEditOp, SharedTasksManifest } from './types.js';
import type { FileChange, Result } from '@stillpointlab/common-format/app';

type Changes = { changes: FileChange[] };
type Rewrite = Result<{ content: string }>;

const isMarkdown = (path: string): boolean => /\.(md|markdown)$/i.test(path);
const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);

/** The manifest's content, or the refusal for one the host could not read. */
function manifestContent(snapshot: TasksSnapshot): Result<{ content: string }> {
  const content = snapshot.files[snapshot.manifestPath];
  return content === undefined || content === null
    ? fail('TASKS_MANIFEST_INVALID', 'Invalid tasks.yaml: its content is unavailable')
    : ok({ content });
}

/** The manifest written back, as the one change an op makes to it. */
const manifestWrite = (snapshot: TasksSnapshot, content: string): FileChange => ({
  kind: 'write',
  path: snapshot.manifestPath,
  content,
});

/**
 * A tag added to the registry, in any casing once: a tag already there (in
 * any casing) changes nothing. The result is the registry after it.
 */
export function addTasksTag(
  snapshot: TasksSnapshot,
  op: { tag: string }
): Result<Changes & { tags: string[] }> {
  const instance = resolvedTasks(snapshot);
  if (!instance.ok) return instance;
  const { manifest } = instance.tasks;
  const tag = op.tag.trim();
  if (tag === '') return fail('TASKS_TAG_INVALID', 'The tag must not be empty');
  if (manifest.tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
    return ok({ changes: [], tags: manifest.tags });
  }
  const current = manifestContent(snapshot);
  if (!current.ok) return current;
  const appended = appendManifestTag(current.content, tag);
  if (!appended.ok) return appended;
  const parsed = parseTasksManifest(appended.content);
  return ok({
    changes: [manifestWrite(snapshot, appended.content)],
    tags: parsed.ok ? parsed.manifest.tags : [...manifest.tags, tag],
  });
}

/**
 * Cards on any board whose frontmatter carries a column id as authored (the
 * pool's carry none). A card the host neither read nor holds parsed counts as
 * carrying it: a removal must not go ahead over cards it could not check.
 */
export function cardsCarryingColumn(
  snapshot: TasksSnapshot,
  tasks: ResolvedTasks,
  columnId: string
): { count: number; boards: string[] } {
  const { manifest } = tasks;
  let count = 0;
  const boards: string[] = [];
  for (const board of tasks.boards) {
    let onBoard = 0;
    for (const { path } of kindEntriesOf(board, manifest.kinds)) {
      if (tasks.movedAway.has(path)) continue;
      const content = snapshot.files[path];
      const authored =
        content !== undefined && content !== null
          ? parseCardProjection(content, manifest.frontmatterKey).column
          : snapshot.projections?.[path] !== undefined
            ? snapshot.projections[path].column
            : columnId;
      if (authored === columnId) onBoard += 1;
    }
    if (onBoard > 0) {
      count += onBoard;
      boards.push(board.path);
    }
  }
  return { count, boards };
}

/**
 * Markdown files under one kind's folder on any board or in the pool. Other
 * files there (a `.gitkeep`, the order file) never block a kind's removal.
 */
function kindFileHolders(
  snapshot: TasksSnapshot,
  tasks: ResolvedTasks,
  kindDir: string
): { count: number; folders: string[] } {
  const paths = snapshot.paths.filter((path) => isMarkdown(path) && !tasks.movedAway.has(path));
  let count = 0;
  const folders = new Set<string>();
  for (const base of [...tasks.boards.map((board) => board.path), tasks.pool.path]) {
    const folder = base === '' ? kindDir : `${base}/${kindDir}`;
    for (const path of paths) {
      if (path.startsWith(`${folder}/`)) {
        count += 1;
        folders.add(`${folder}/`);
      }
    }
  }
  return { count, folders: [...folders].sort() };
}

/** The guards that need the registry and the files: existence, uniqueness, emptiness. */
function editGuard(
  snapshot: TasksSnapshot,
  tasks: ResolvedTasks,
  content: string,
  edit: SharedTaskManifestEditOp
): Result {
  const { manifest } = tasks;
  const column = manifest.columns.find((candidate) => candidate.id === edit.id);
  const kind = manifest.kinds.find((candidate) => candidate.id === edit.id);
  switch (edit.op) {
    case 'add-column':
      return column
        ? fail('TASKS_COLUMN_ID_EXISTS', `A column with id “${edit.id}” already exists`)
        : ok();
    case 'update-column':
    case 'set-default-column':
    case 'set-done-column':
      return column ? ok() : fail('TASKS_COLUMN_NOT_FOUND', `No column “${edit.id}”`);
    case 'remove-column': {
      if (!column) return fail('TASKS_COLUMN_NOT_FOUND', `No column “${edit.id}”`);
      if (manifest.columns.length === 1) {
        return fail('TASKS_LAST_COLUMN', 'The last column cannot be removed');
      }
      // Only an EXPLICIT default or done column blocks: the implicit first and
      // last shift with a removal, which is the manifest's documented meaning.
      const raw = parseYaml(content) as Record<string, unknown> | null;
      for (const key of ['defaultColumn', 'doneColumn'] as const) {
        if (raw?.[key] === edit.id) {
          return fail(
            'TASKS_COLUMN_REFERENCED',
            `“${edit.id}” is the manifest's explicit ${key} — repoint it before removing the column`
          );
        }
      }
      const carrying = cardsCarryingColumn(snapshot, tasks, edit.id);
      if (carrying.count > 0) {
        return fail(
          'TASKS_COLUMN_NOT_EMPTY',
          `${carrying.count} ${plural(carrying.count, 'card', 'cards')} still ${plural(
            carrying.count,
            'carries',
            'carry'
          )} “${edit.id}” (${carrying.boards.join(', ')}) — move them, then remove the column`
        );
      }
      return ok();
    }
    case 'add-kind': {
      if (kind) return fail('TASKS_KIND_ID_EXISTS', `A kind with id “${edit.id}” already exists`);
      const dir = `${edit.id}s`;
      return manifest.kinds.some((candidate) => candidate.dir === dir)
        ? fail(
            'TASKS_KIND_DIR_EXISTS',
            `The kind's folder “${dir}/” is already used by another kind`
          )
        : ok();
    }
    case 'update-kind':
      return kind ? ok() : fail('TASKS_KIND_NOT_FOUND', `No kind “${edit.id}”`);
    case 'remove-kind': {
      if (!kind) return fail('TASKS_KIND_NOT_FOUND', `No kind “${edit.id}”`);
      if (manifest.kinds.length === 1) {
        return fail('TASKS_LAST_KIND', 'The last kind cannot be removed');
      }
      const holders = kindFileHolders(snapshot, tasks, kind.dir);
      return holders.count > 0
        ? fail(
            'TASKS_KIND_NOT_EMPTY',
            `${holders.count} ${plural(holders.count, 'file', 'files')} still under ${holders.folders.join(
              ', '
            )} — move them out, then remove the kind`
          )
        : ok();
    }
  }
}

/** Patches in a row, stopping at the first refusal. */
function patches(content: string, steps: ((text: string) => Rewrite)[]): Rewrite {
  let next: Rewrite = ok({ content });
  for (const step of steps) {
    if (!next.ok) return next;
    next = step(next.content);
  }
  return next;
}

/** One edit as a textual rewrite of the manifest; the guards have passed. */
function rewriteFor(content: string, edit: SharedTaskManifestEditOp): Rewrite {
  switch (edit.op) {
    case 'add-column':
      return appendManifestListEntry(content, 'columns', {
        id: edit.id,
        fields: [
          ['label', edit.label],
          ...(edit.description !== undefined && edit.description !== ''
            ? ([['description', edit.description]] as [string, string][])
            : []),
        ],
      });
    case 'update-column':
      return patches(content, [
        ...(edit.label !== undefined
          ? [
              (text: string) =>
                patchManifestEntryKey(text, 'columns', edit.id, 'label', edit.label!),
            ]
          : []),
        // '' clears the key: the minimal diff for "no description".
        ...(edit.description !== undefined
          ? [
              (text: string) =>
                patchManifestEntryKey(
                  text,
                  'columns',
                  edit.id,
                  'description',
                  edit.description === '' ? null : edit.description!
                ),
            ]
          : []),
      ]);
    case 'remove-column':
      return removeManifestListEntry(content, 'columns', edit.id);
    case 'set-default-column':
      return patchManifestTopLevelScalar(content, 'defaultColumn', edit.id);
    case 'set-done-column':
      return patchManifestTopLevelScalar(content, 'doneColumn', edit.id);
    case 'add-kind':
      return appendManifestListEntry(content, 'kinds', {
        id: edit.id,
        fields: [
          ...(edit.label !== undefined ? ([['label', edit.label]] as [string, string][]) : []),
          ...(edit.badge !== undefined ? ([['badge', edit.badge]] as [string, string][]) : []),
        ],
      });
    case 'update-kind':
      return patches(content, [
        ...(edit.label !== undefined
          ? [(text: string) => patchManifestEntryKey(text, 'kinds', edit.id, 'label', edit.label!)]
          : []),
        ...(edit.badge !== undefined
          ? [(text: string) => patchManifestEntryKey(text, 'kinds', edit.id, 'badge', edit.badge!)]
          : []),
        // true is the documented default: removing the key is the minimal diff.
        ...(edit.creatable !== undefined
          ? [
              (text: string) =>
                patchManifestEntryKey(
                  text,
                  'kinds',
                  edit.id,
                  'creatable',
                  edit.creatable ? null : false
                ),
            ]
          : []),
      ]);
    case 'remove-kind':
      return removeManifestListEntry(content, 'kinds', edit.id);
  }
}

/**
 * One board-settings change (Context Manager's spec tasks_edit): add columns
 * and kinds freely, edit display fields, repoint the default and done
 * columns, remove only what nothing uses. Every change is a byte-preserving
 * rewrite, refused rather than guessed (`TASKS_MANIFEST_UNPATCHABLE`, or
 * the rewriter's own code) when the authored shape cannot be patched safely
 * or the result would not parse. The result is the manifest after it, with
 * its warnings.
 */
export function editTasksManifest(
  snapshot: TasksSnapshot,
  op: { edit: SharedTaskManifestEditOp }
): Result<Changes & { manifest: SharedTasksManifest; warnings: string[] }> {
  const instance = resolvedTasks(snapshot);
  if (!instance.ok) return instance;
  const current = manifestContent(snapshot);
  if (!current.ok) return current;
  const guard = editGuard(snapshot, instance.tasks, current.content, op.edit);
  if (!guard.ok) return guard;
  const rewritten = rewriteFor(current.content, op.edit);
  if (!rewritten.ok) return rewritten;
  // Never write a manifest that would leave the whole app refusing to load.
  const reparsed = parseTasksManifest(rewritten.content);
  if (!reparsed.ok) {
    return fail(
      'TASKS_MANIFEST_UNPATCHABLE',
      `this change would leave tasks.yaml invalid (${reparsed.errors.join(
        '; '
      )}) — make it by editing the file instead`
    );
  }
  // The warnings as the instance after it reads: the manifest's own, and
  // markdown no kind now projects.
  const after = resolveTasks({
    ...snapshot,
    files: { ...snapshot.files, [snapshot.manifestPath]: rewritten.content },
  });
  return ok({
    changes: [manifestWrite(snapshot, rewritten.content)],
    manifest: reparsed.manifest,
    warnings: after?.ok ? after.tasks.manifestWarnings : reparsed.warnings,
  });
}

/** `current:` pointed at a phase, written into the manifest. */
function pointerWrite(
  snapshot: TasksSnapshot,
  target: { stage: number; phase: number }
): Result<{ change: FileChange }> {
  const current = manifestContent(snapshot);
  if (!current.ok) return current;
  return ok({ change: manifestWrite(snapshot, rewriteManifestCurrent(current.content, target)) });
}

/**
 * The next phase of a stage, or the next stage at phase 1, made by pointing
 * `current:` at it: a phase with no folders is a board already, so nothing
 * else is written. New ones follow the last in the nav.
 */
export function createTasksStagePhase(
  snapshot: TasksSnapshot,
  op: { kind: 'phase' | 'stage'; stage?: number }
): Result<Changes & { stage: number; phase: number; path: string }> {
  const instance = resolvedTasks(snapshot);
  if (!instance.ok) return instance;
  const { tasks } = instance;
  const nav = buildTasksNav(tasks.boards);
  let stage: number;
  let phase: number;
  if (op.kind === 'stage') {
    stage = (nav.stages[nav.stages.length - 1]?.stage ?? 0) + 1;
    phase = 1;
  } else {
    const entry = nav.stages.find((candidate) => candidate.stage === op.stage);
    if (!entry) {
      return fail('TASKS_STAGE_NOT_FOUND', `No stage ${op.stage ?? '(none given)'}`);
    }
    stage = entry.stage;
    phase = entry.phases[entry.phases.length - 1].phase + 1;
  }
  const write = pointerWrite(snapshot, { stage, phase });
  if (!write.ok) return write;
  return ok({
    changes: [write.change],
    stage,
    phase,
    path: stagePhasePath(tasks.docsRoot, stage, phase),
  });
}

/** `current:` pointed at a phase the nav shows (folders, or synthesized). */
export function setTasksCurrent(
  snapshot: TasksSnapshot,
  op: { stage: number; phase: number }
): Result<Changes> {
  const instance = resolvedTasks(snapshot);
  if (!instance.ok) return instance;
  const nav = buildTasksNav(instance.tasks.boards);
  const exists = nav.stages.some(
    (entry) => entry.stage === op.stage && entry.phases.some((p) => p.phase === op.phase)
  );
  if (!exists) {
    return fail('TASKS_BOARD_NOT_FOUND', `No task board at stage${op.stage}/phase${op.phase}`);
  }
  const write = pointerWrite(snapshot, op);
  if (!write.ok) return write;
  return ok({ changes: [write.change] });
}

/**
 * Close the pointer's phase (or stage): `current:` moves on to the next phase
 * after it (or the next stage's phase 1), and the named cards move there,
 * each keeping its column. The whole selection is checked before anything
 * moves; a card already under the target (a close that stopped part way) is
 * skipped, so a close can be run again with the same selection. Links between
 * the cards moving together stay as they are. The changes are the moves, then
 * the manifest's write.
 */
export function closeTasksStagePhase(
  snapshot: TasksSnapshot,
  op: { kind: 'phase' | 'stage'; paths: readonly string[] }
): Result<
  Changes & {
    target: { stage: number; phase: number; path: string };
    moved: number;
    created: boolean;
  }
> {
  const instance = resolvedTasks(snapshot);
  if (!instance.ok) return instance;
  const { tasks } = instance;
  const { manifest } = tasks;
  const current = manifest.current;
  if (!current) {
    return fail(
      'TASKS_NO_CURRENT_POINTER',
      'tasks.yaml has no current: pointer — set a current phase first'
    );
  }
  const nav = buildTasksNav(tasks.boards);
  const stageNav = nav.stages.find((entry) => entry.stage === current.stage);
  const stage = op.kind === 'phase' ? current.stage : current.stage + 1;
  let phase = 1;
  if (op.kind === 'phase') {
    const after = (stageNav?.phases ?? [])
      .map((entry) => entry.phase)
      .filter((candidate) => candidate > current.phase);
    phase = after.length > 0 ? Math.min(...after) : current.phase + 1;
  }
  const existing = nav.stages
    .find((entry) => entry.stage === stage)
    ?.phases.find((entry) => entry.phase === phase);
  const targetPath = existing?.path ?? stagePhasePath(tasks.docsRoot, stage, phase);
  const closing = stageNav?.phases.find((entry) => entry.phase === current.phase);

  const planned: { path: string; column: string; to: string }[] = [];
  for (const path of op.paths) {
    const found = findTaskCard(tasks, path);
    if (!found) return fail('TASKS_CARD_NOT_FOUND', `No task card at ${path}`);
    if (path.startsWith(`${targetPath}/`)) continue;
    if (found.location !== 'board' || (closing && !path.startsWith(`${closing.path}/`))) {
      return fail('TASKS_CLOSE_INVALID_SELECTION', `'${path}' is not a card on the closing phase`);
    }
    const content = snapshot.files[path];
    if (content === undefined || content === null) {
      return fail('TASKS_CARD_CONTENT_UNAVAILABLE', 'Card content is unavailable');
    }
    const read = readColumn(content, manifest);
    // A card that needs attention is shown to the user, never re-columned quietly.
    if (read.parseError !== undefined || read.undeclaredId !== undefined) {
      return fail(
        'TASKS_CLOSE_NEEDS_ATTENTION',
        `'${path}' needs attention (invalid frontmatter) — fix or deselect it`
      );
    }
    const column = read.column ?? manifest.defaultColumn;
    if (column === manifest.doneColumn) {
      return fail(
        'TASKS_CLOSE_INVALID_SELECTION',
        `'${path}' is already ${manifest.doneColumn} — deselect it`
      );
    }
    const kindDir = taskKindById(manifest.kinds, found.entry.kind)!.dir;
    const name = path.slice(path.lastIndexOf('/') + 1);
    planned.push({ path, column, to: `${targetPath}/${kindDir}/${name}` });
  }

  const coMoving = Object.fromEntries(planned.map((plan) => [plan.path, plan.to]));
  const changes: FileChange[] = [];
  for (const plan of planned) {
    const moved = moveTaskCardFile(snapshot, {
      path: plan.path,
      target: { boardPath: targetPath, column: plan.column },
      coMoving,
    });
    if (!moved.ok) return moved;
    changes.push(...moved.changes);
  }
  const write = pointerWrite(snapshot, { stage, phase });
  if (!write.ok) return write;
  return ok({
    changes: [...changes, write.change],
    target: { stage, phase, path: targetPath },
    moved: planned.length,
    created: existing === undefined,
  });
}
