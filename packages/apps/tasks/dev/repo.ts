// This repository's own docs/tasks/ as a board: the files alone, projected with
// the core's functions. Every card is tracked, with no host overlay: what a host
// shows for a repository nobody has edited in it yet.
import {
  detectBoards,
  detectPool,
  effectiveColumn,
  kindEntriesOf,
  orderPoolCards,
  parseCardProjection,
  parseOrderFileDetailed,
  parseTasksManifest,
  resolveProjectionColumn,
} from '../src/index.js';

import type { SharedTaskBoardState, SharedTaskCard, TreeNode } from '../src/index.js';

const raw = import.meta.glob<string>('../../../../docs/tasks/**/*.{md,yaml}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The repository's task files by repo path (`docs/tasks/…`). */
export const repoFiles: Record<string, string> = Object.fromEntries(
  Object.entries(raw).map(([key, text]) => [key.replace(/^(\.\.\/)+/, ''), text])
);

const MANIFEST = 'docs/tasks/tasks.yaml';

/** The board `current:` points at, or the last board, as a tracked-only state. */
export function repoBoard(): SharedTaskBoardState | null {
  const parsed = parseTasksManifest(repoFiles[MANIFEST] ?? '');
  if (!parsed.ok) return null;
  const { manifest } = parsed;
  const nodes: TreeNode[] = Object.keys(repoFiles).map((path) => ({ path, type: 'blob' }));
  const boards = detectBoards(nodes, MANIFEST, manifest.kinds);
  const board =
    boards.find(
      (candidate) =>
        candidate.stage === manifest.current?.stage && candidate.phase === manifest.current?.phase
    ) ?? boards[boards.length - 1];
  if (!board) return null;

  const project = (path: string, kind: string, location: 'board' | 'pool'): SharedTaskCard => {
    const projection = parseCardProjection(repoFiles[path] ?? '', manifest.frontmatterKey);
    const read = resolveProjectionColumn(projection, manifest);
    return {
      goodId: null,
      goodPublicId: null,
      tracked: true,
      title: path.slice(path.lastIndexOf('/') + 1),
      ...(projection.title !== undefined ? { frontmatterTitle: projection.title } : {}),
      path,
      kind,
      column: effectiveColumn(read, manifest, location),
      dirty: false,
      changed: false,
      ...(projection.tags ? { tags: projection.tags } : {}),
      ...projection.meta,
    };
  };

  const pool = detectPool(nodes, MANIFEST, manifest.kinds);
  const poolCards = kindEntriesOf(pool, manifest.kinds).map(({ path, kind }) =>
    project(path, kind, 'pool')
  );
  return {
    board,
    columns: manifest.columns,
    cards: kindEntriesOf(board, manifest.kinds).map(({ path, kind }) =>
      project(path, kind, 'board')
    ),
    pool: {
      path: pool.path,
      orderPath: pool.orderPath,
      cards: orderPoolCards(
        poolCards,
        parseOrderFileDetailed(repoFiles[pool.orderPath] ?? '').paths
      ),
    },
    tags: manifest.tags,
    doneColumn: manifest.doneColumn,
    defaultColumn: manifest.defaultColumn,
    kinds: manifest.kinds,
    housekeeping: [],
  };
}
