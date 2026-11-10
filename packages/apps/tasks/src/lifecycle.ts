// The tasks app's lifecycle (Context Manager ADR-0023/0024/0025): a tasks.yaml
// marks an instance; its scope is the manifest, its declared templates, every
// board's card files and the backlog pool (with the order file, which may not
// exist yet: a scope entry with no blob is simply never adopted). Boards and pool
// anchor at the given manifest's directory. Moved from Context Manager's
// `services/tasks/lifecycle.ts`, without the host's own fields.

import { detectBoards, detectPool, kindPathsOf } from './boardDetection.js';
import { parseTasksManifest, validateManifestAgainstTree } from './manifest.js';
import { BUILTIN_TASK_KINDS } from './types.js';

import type { SharedTaskBoardDescriptor } from './types.js';
import type { AppLifecycle } from '@stillpointlab/common-format/app';

/** What one tasks instance shows in a host's tree: its label and its boards. */
export interface TasksInstanceDetail {
  label: string;
  boards: SharedTaskBoardDescriptor[];
}

export const tasksLifecycle: AppLifecycle<TasksInstanceDetail> = {
  manifestName: 'tasks.yaml',
  validateAndScope: (content, nodes, manifestPath) => {
    const parsed = parseTasksManifest(content);
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    const treeErrors = validateManifestAgainstTree(parsed.manifest, nodes);
    if (treeErrors.length > 0) return { ok: false, errors: treeErrors };

    const kinds = parsed.manifest.kinds;
    const scope = new Set<string>([
      manifestPath,
      ...kinds.map((kind) => kind.template).filter((path): path is string => path !== undefined),
    ]);
    for (const board of detectBoards(nodes, manifestPath, kinds)) {
      for (const path of kindPathsOf(board, kinds)) {
        scope.add(path);
      }
    }
    const pool = detectPool(nodes, manifestPath, kinds);
    for (const path of kindPathsOf(pool, kinds)) {
      scope.add(path);
    }
    scope.add(pool.orderPath);
    // Files no kind projects (a README beside the kind folders, an agent's
    // helper output) are left alone and not warned about: ADR-0028 decision 4,
    // as Context Manager relaxed it.
    return { ok: true, scope, warnings: parsed.warnings };
  },
  // A tasks.yaml carries no title of its own, so every instance is "Tasks" and
  // the host tells twins apart. Boards must survive a manifest that does not
  // parse, so the kind registry falls back to the built-in kinds.
  describeInstance: (content, nodes, manifestPath, appOnlyPaths) => {
    const parsed = content === null ? null : parseTasksManifest(content);
    const kinds = parsed?.ok ? parsed.manifest.kinds : BUILTIN_TASK_KINDS;
    return {
      label: 'Tasks',
      boards: detectBoards(nodes, manifestPath, kinds, appOnlyPaths),
    };
  },
};
