// This repository's own docs/tasks/ as a harness workspace: the files alone,
// every card tracked — what a host shows for a repository nobody has edited in
// it yet. An op links the card it changes, as a host's first edit does.
import { workspace } from './workspace.js';

import type { Workspace } from './workspace.js';

const raw = import.meta.glob<string>('../../../../docs/tasks/**/*.{md,yaml}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The repository's task files by repo path (`docs/tasks/…`). */
export const repoFiles: Record<string, string> = Object.fromEntries(
  Object.entries(raw).map(([key, text]) => [key.replace(/^(\.\.\/)+/, ''), text])
);

export const REPO_MANIFEST = 'docs/tasks/tasks.yaml';

/** The repository's tasks, every file tracked. */
export function repoWorkspace(): Workspace {
  return workspace(REPO_MANIFEST, repoFiles, {
    fixed: Object.fromEntries(Object.keys(repoFiles).map((path) => [path, { tracked: true }])),
  });
}
