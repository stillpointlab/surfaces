/**
 * Creating a tasks instance (phase 7, tasks-rules): the manifest to seed, in
 * two steps so a host can check what only it knows between them (whether the
 * repository is synced, an existing instance, overlapping scopes).
 */
import { fail, ok, placeNewFiles } from '@stillpointlab/common-format/app';

import { parseTasksManifest, TASKS_MANIFEST_FILENAME } from './manifest.js';
import { tasksManifestSeedContent } from './manifestSeed.js';

import type { TasksManifestSeed } from './manifestSeed.js';
import type { Result } from '@stillpointlab/common-format/app';

/** What a create asks for: where, and the manifest's columns and kinds. */
export interface CreateTasksInput extends TasksManifestSeed {
  /** The folder the manifest goes in; `''` is the repository root. */
  folder: string;
  /** Consent to create at the root, which leaves the repository room for no other app view. */
  confirmRoot?: boolean;
}

/** The manifest a create seeds, as a contract `create` change. */
export interface TasksCreatePlan {
  manifestPath: string;
  files: { kind: 'create'; path: string; content: string }[];
}

/**
 * The manifest to seed, or a refusal: the repository root without consent
 * (ADR-0028 decision 3), or a seed the app itself would not accept.
 */
export function planTasksCreate(input: CreateTasksInput): Result<TasksCreatePlan> {
  if (input.folder === '' && input.confirmRoot !== true) {
    return fail(
      'ROOT_CONFIRM_REQUIRED',
      'Creating at the repository root means this repo can only ever hold this one app view — pass confirmRoot to proceed'
    );
  }
  const manifestPath =
    input.folder === '' ? TASKS_MANIFEST_FILENAME : `${input.folder}/${TASKS_MANIFEST_FILENAME}`;
  const content = tasksManifestSeedContent({ columns: input.columns, kinds: input.kinds });
  const parsed = parseTasksManifest(content);
  if (!parsed.ok) {
    return fail('TASKS_MANIFEST_INVALID', `Invalid tasks.yaml: ${parsed.errors.join('; ')}`);
  }
  return ok({ manifestPath, files: [{ kind: 'create', path: manifestPath, content }] });
}

/**
 * Whether the plan fits among the host's paths: a seed path, or a folder above
 * one, that is already a file is refused. `reusable` names files an earlier,
 * unfinished attempt at the same create left behind; they are skipped.
 */
export function placeTasksCreate(
  plan: TasksCreatePlan,
  paths: { taken: readonly string[]; reusable?: readonly string[] }
): Result<{ files: TasksCreatePlan['files'] }> {
  const placed = placeNewFiles(plan.files, paths);
  return placed.ok
    ? ok({ files: placed.files })
    : fail('TASKS_PATH_EXISTS', `“${placed.path}” already exists`);
}
