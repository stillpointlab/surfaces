/**
 * The tasks app's facts from file changes alone (the app contract's
 * `fromChanges`), for a host that knows only which files differ from the last
 * check-in, as a host that knows more (drafts, versions, pull requests) works
 * them out:
 *
 * - a card that is changed, new or moved is `changed`; a new one is in the
 *   snapshot's `created`; a moved one has `movedFrom`, and its move is in the
 *   snapshot's `moves` (the path it had, as the move's anchor). When the path
 *   it had is itself among the changes (a card made there since), the move is no
 *   move: there are two cards and two changes, and nothing pending hides the one
 *   at the old path;
 * - a changed or moved card on a board whose change carries its text at the
 *   last check-in (`base`) is `dirty` when its column differs from that text's,
 *   with that column as `versionColumn`. A card in the pool is never `dirty`:
 *   the pool has no columns, so a column in its frontmatter says nothing there;
 * - the pool's order file, when there is one, is `changed` the same way;
 * - the housekeeping files that join a check-in are the manifest, changed, new
 *   or moved, and every new `.gitkeep` (a folder made in the host);
 * - a deleted file has nothing left to mark.
 *
 * What the changes cannot say is left out: whether a card's column moved when
 * no `base` is given, a divergence, a title, and anything about pull requests.
 * The board already takes a card and a pool without them.
 */
import { kindPathsOf } from './boardDetection.js';
import { columnOfContent, resolveTasks } from './projection.js';

import type { TasksCardFacts, TasksHostFacts, TasksSnapshot } from './projection.js';
import type { SharedTaskHousekeepingFile } from './types.js';
import type { AppFileChange, AppKnown } from '@stillpointlab/common-format/app';

/** Whether a file's status means it differs from the last check-in and is still there. */
const differs = (status: AppFileChange['status'] | undefined): boolean =>
  status === 'changed' || status === 'new' || status === 'moved';

export function tasksFromChanges(
  changes: readonly AppFileChange[],
  snapshot: TasksSnapshot
): AppKnown<TasksHostFacts, TasksSnapshot> {
  const status = new Map(changes.map((change) => [change.path, change]));
  const resolved = resolveTasks(snapshot);
  const tasks = resolved?.ok ? resolved.tasks : null;

  // The cards are the boards' and the pool's; a broken manifest has none.
  const cardPaths = new Set(
    tasks
      ? [...tasks.boards, tasks.pool].flatMap((holder) => kindPathsOf(holder, tasks.manifest.kinds))
      : []
  );
  // The pool's cards: a column means nothing there.
  const poolPaths = new Set(tasks ? kindPathsOf(tasks.pool, tasks.manifest.kinds) : []);
  const cards: Record<string, TasksCardFacts> = {};
  const moves: Record<string, string[]> = {};
  const created: string[] = [];
  for (const change of status.values()) {
    if (!differs(change.status) || !cardPaths.has(change.path)) continue;
    const facts: TasksCardFacts = { changed: true };
    if (change.status === 'new') created.push(change.path);
    if (
      change.status === 'moved' &&
      change.from !== undefined &&
      change.from !== change.path &&
      // The path it had is taken again: two files, so two changes.
      !differs(status.get(change.from)?.status)
    ) {
      facts.movedFrom = change.from;
      moves[change.path] = [change.from];
    }
    const now = snapshot.files[change.path];
    if (
      tasks &&
      change.base !== undefined &&
      typeof now === 'string' &&
      !poolPaths.has(change.path)
    ) {
      const was = columnOfContent(change.base, tasks.manifest);
      if (columnOfContent(now, tasks.manifest) !== was) {
        facts.dirty = true;
        facts.versionColumn = was;
      }
    }
    cards[change.path] = facts;
  }

  const orderPath = tasks?.pool.orderPath;
  const order =
    orderPath !== undefined && snapshot.paths.includes(orderPath)
      ? { changed: differs(status.get(orderPath)?.status) }
      : undefined;

  const housekeeping: SharedTaskHousekeepingFile[] = [];
  if (differs(status.get(snapshot.manifestPath)?.status)) {
    housekeeping.push({ path: snapshot.manifestPath, kind: 'manifest' });
  }
  for (const change of status.values()) {
    if (change.status === 'new' && change.path.endsWith('/.gitkeep')) {
      housekeeping.push({ path: change.path, kind: 'scaffold' });
    }
  }
  housekeeping.sort((a, b) => a.path.localeCompare(b.path));

  return {
    facts: { cards, ...(order !== undefined ? { order } : {}), housekeeping },
    snapshot: { moves, created },
  };
}
