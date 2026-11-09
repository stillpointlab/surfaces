// This repository's own docs/tasks/ as a board: the files alone, projected by
// the core (phase 7, tasks-rules). Every card is tracked, with no other host
// fact: what a host shows for a repository nobody has edited in it yet.
import { projectTasksBoard, projectTasksNav } from '../src/index.js';

import type { SharedTaskBoardState, TasksHostFacts, TasksSnapshot } from '../src/index.js';

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

/** The repository's task files as the snapshot a host hands the core. */
export function repoSnapshot(): TasksSnapshot {
  return { manifestPath: MANIFEST, paths: Object.keys(repoFiles), files: repoFiles };
}

/** Every file tracked: no host has a local copy of any of them. */
export const repoFacts: TasksHostFacts = {
  cards: Object.fromEntries(Object.keys(repoFiles).map((path) => [path, { tracked: true }])),
};

/** The board `current:` points at, or the last phase board, as a tracked-only state. */
export function repoBoard(): SharedTaskBoardState | null {
  const snapshot = repoSnapshot();
  const nav = projectTasksNav(snapshot);
  if (!nav) return null;
  const last = nav.nav.stages.at(-1)?.phases.at(-1)?.path ?? null;
  const path = nav.currentPointerPath ?? last;
  return path === null ? null : projectTasksBoard(snapshot, path, repoFacts);
}
