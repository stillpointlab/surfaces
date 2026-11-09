// An in-memory host for the harness: answers the board's ops against the state
// the board holds, so drags, moves, reorders and the dialogs' changes settle
// without a server. It does nothing a real host's server does (no drafts, no
// files written): it lets the optimistic render settle or roll back, and, for a
// dialog's change, sets the board a state with the change in it, as a host's
// refresh would. The tasks-rules spec answers these with the core instead.
import { answerOps, fail, ok } from '@stillpointlab/common-format/app';

import { slugifyTaskId } from '../src/paths.js';
import { orderPoolCards } from '../src/pool.js';
import { taskKindById } from '../src/types.js';

import type { TaskBoard, TaskBoardOps } from '../src/element/index.js';
import type {
  SharedTaskBoardState,
  SharedTaskCard,
  SharedTaskManifestEditOp,
  SharedTasksManifest,
  SharedTaskStageState,
} from '../src/types.js';
import type { AppOp, Result } from '@stillpointlab/common-format/app';

export interface HarnessHost {
  /** Answer ops (true) or leave them unclaimed (false). */
  setAnswering(on: boolean): void;
  /** Refuse the next op, once. */
  failNext(): void;
}

export function attachHost(
  board: TaskBoard,
  files: Readonly<Record<string, string>>,
  stage: () => SharedTaskStageState | null
): HarnessHost {
  let stop: (() => void) | null = null;
  let failOnce = false;

  const cards = (): SharedTaskCard[] => {
    const state = board.boardState;
    const stageState = stage();
    return [
      ...(state?.cards ?? []),
      ...(state?.pool.cards ?? []),
      ...(stageState?.phases.flatMap((phase) => phase.cards) ?? []),
      ...(stageState?.pool.cards ?? []),
    ];
  };
  const find = (path: string): SharedTaskCard | undefined =>
    cards().find((card) => card.path === path);
  // Answering links a tracked card, as a real host does on its first edit.
  const linked = (card: SharedTaskCard, changes: Partial<SharedTaskCard>): SharedTaskCard => {
    const next: SharedTaskCard = { ...card, goodId: card.goodId ?? 1, ...changes };
    delete next.tracked;
    return next;
  };

  /** The board's state after a dialog's change, as a host's refresh hands it back. */
  const settle = (change: (state: SharedTaskBoardState) => void): void => {
    const state = board.boardState;
    if (!state) return;
    const next = structuredClone(state);
    change(next);
    board.setState(next);
  };

  /** The manifest the board's state carries. */
  const manifestOf = (state: SharedTaskBoardState): SharedTasksManifest => ({
    version: 1,
    frontmatterKey: 'column',
    columns: state.columns,
    kinds: state.kinds,
    defaultColumn: state.defaultColumn,
    doneColumn: state.doneColumn,
    tags: state.tags,
  });

  /** One settings change against the board's manifest, refused as a host refuses it. */
  const editManifest = (edit: SharedTaskManifestEditOp): Result<object> => {
    const state = board.boardState;
    if (!state) return fail('NOT_FOUND', 'No board');
    const next = structuredClone(state);
    const column = next.columns.find((candidate) => candidate.id === edit.id);
    const kind = next.kinds.find((candidate) => candidate.id === edit.id);
    switch (edit.op) {
      case 'add-column':
        if (column)
          return fail('TASKS_COLUMN_ID_EXISTS', `A column with id “${edit.id}” already exists`);
        next.columns.push({ id: edit.id, label: edit.label });
        break;
      case 'update-column':
        if (!column) return fail('NOT_FOUND', `Task column with id ${edit.id} not found`);
        if (edit.label !== undefined) column.label = edit.label;
        if (edit.description === '') delete column.description;
        else if (edit.description !== undefined) column.description = edit.description;
        break;
      case 'remove-column': {
        if (!column) return fail('NOT_FOUND', `Task column with id ${edit.id} not found`);
        if (next.columns.length === 1)
          return fail('TASKS_LAST_COLUMN', 'The last column cannot be removed');
        const carrying = next.cards.filter((card) => card.column === edit.id).length;
        if (carrying > 0) {
          return fail(
            'TASKS_COLUMN_NOT_EMPTY',
            `${carrying} card(s) still carr${carrying === 1 ? 'ies' : 'y'} “${edit.id}” — move them, then remove the column`
          );
        }
        next.columns = next.columns.filter((candidate) => candidate.id !== edit.id);
        break;
      }
      case 'set-default-column':
        next.defaultColumn = edit.id;
        break;
      case 'set-done-column':
        next.doneColumn = edit.id;
        break;
      case 'add-kind':
        if (kind) return fail('TASKS_KIND_ID_EXISTS', `A kind with id “${edit.id}” already exists`);
        next.kinds.push({
          id: edit.id,
          label: edit.label ?? edit.id,
          badge: edit.badge ?? edit.id.slice(0, 1),
          dir: `${edit.id}s`,
          creatable: true,
        });
        break;
      case 'update-kind':
        if (!kind) return fail('NOT_FOUND', `Task kind with id ${edit.id} not found`);
        if (edit.label !== undefined) kind.label = edit.label;
        if (edit.badge !== undefined) kind.badge = edit.badge;
        if (edit.creatable !== undefined) kind.creatable = edit.creatable;
        break;
      case 'remove-kind':
        if (!kind) return fail('NOT_FOUND', `Task kind with id ${edit.id} not found`);
        if (next.kinds.length === 1)
          return fail('TASKS_LAST_KIND', 'The last kind cannot be removed');
        next.kinds = next.kinds.filter((candidate) => candidate.id !== edit.id);
        break;
    }
    board.setState(next);
    return ok({ manifest: manifestOf(next), warnings: [] });
  };

  const answer = (op: AppOp<TaskBoardOps>): Result<object> => {
    if (failOnce) {
      failOnce = false;
      return fail('HARNESS_REFUSED', 'The harness refused this op');
    }
    switch (op.type) {
      case 'move': {
        const card = find(op.path);
        if (!card) return fail('NOT_FOUND', `No card at ${op.path}`);
        return ok({ card: linked(card, { column: op.column, dirty: true, changed: true }) });
      }
      case 'move-file': {
        const card = find(op.path);
        const pool = board.boardState?.pool ?? stage()?.pool;
        const kinds = board.boardState?.kinds ?? stage()?.kinds ?? [];
        if (!card || !pool) return fail('NOT_FOUND', `No card at ${op.path}`);
        const dir = taskKindById(kinds, card.kind)?.dir ?? `${card.kind}s`;
        const name = card.path.slice(card.path.lastIndexOf('/') + 1);
        const root = 'pool' in op.target ? pool.path : op.target.boardPath;
        return ok({
          card: linked(card, {
            path: `${root}/${dir}/${name}`,
            column: 'pool' in op.target ? null : op.target.column,
            movedFrom: card.path,
            changed: true,
          }),
        });
      }
      case 'reorder-pool': {
        const pool = board.boardState?.pool ?? stage()?.pool;
        if (!pool) return fail('NOT_FOUND', 'No pool');
        return ok({
          pool: {
            ...pool,
            cards: orderPoolCards(pool.cards, op.paths),
            order: { goodId: 1, changed: true },
          },
        });
      }
      case 'resolve': {
        const card = find(op.path);
        if (!card) return fail('NOT_FOUND', `No card at ${op.path}`);
        const next = { ...card };
        delete next.diverged;
        return ok({ card: next });
      }
      case 'scan-references':
        return ok({ references: [] });
      case 'fix-references':
        return ok({ fixed: 0 });
      case 'read-file':
        return ok({ content: files[op.path] ?? `# ${op.path}\n\n(no fixture text for this file)` });
      case 'refresh-stage': {
        const current = stage();
        return current ? ok({ stage: current }) : fail('NOT_FOUND', 'No stage');
      }
      case 'edit-manifest':
        return editManifest(op.edit);
      case 'create-card': {
        const state = board.boardState;
        if (!state) return fail('NOT_FOUND', 'No board');
        const slug = slugifyTaskId(op.title).replace(/-/g, '_');
        if (slug === '') {
          return fail('TASKS_BRIEF_NAME_INVALID', 'The title must contain letters or numbers');
        }
        const dir = taskKindById(state.kinds, op.kind)?.dir ?? `${op.kind}s`;
        const path = `${op.boardPath}/${dir}/${slug}.md`;
        if (find(path)) return fail('TASKS_BRIEF_EXISTS', `“${slug}.md” already exists here`);
        const card: SharedTaskCard = {
          goodId: 1,
          goodPublicId: null,
          title: `${slug}.md`,
          frontmatterTitle: op.title,
          path,
          kind: op.kind,
          column: state.defaultColumn,
          dirty: false,
          changed: true,
        };
        settle((next) => next.cards.push(card));
        return ok({ card });
      }
      case 'set-title':
        if (!find(op.path)) return fail('NOT_FOUND', `No card at ${op.path}`);
        settle((next) => {
          for (const card of [...next.cards, ...next.pool.cards]) {
            if (card.path !== op.path) continue;
            if (op.title === null) delete card.frontmatterTitle;
            else card.frontmatterTitle = op.title;
            card.changed = true;
          }
        });
        return ok();
      case 'set-tags':
        if (!find(op.path)) return fail('NOT_FOUND', `No card at ${op.path}`);
        settle((next) => {
          for (const card of [...next.cards, ...next.pool.cards]) {
            if (card.path !== op.path) continue;
            card.tags = op.tags;
            card.changed = true;
          }
        });
        return ok();
      case 'add-tag': {
        const registry = board.boardState?.tags ?? [];
        if (registry.some((tag) => tag.toLowerCase() === op.tag.toLowerCase())) {
          return ok({ tags: registry });
        }
        const tags = [...registry, op.tag];
        settle((next) => (next.tags = tags));
        return ok({ tags });
      }
    }
  };

  const setAnswering = (on: boolean): void => {
    stop?.();
    stop = on ? answerOps<TaskBoardOps>(board, answer) : null;
  };
  setAnswering(true);
  return { setAnswering, failNext: () => (failOnce = true) };
}
