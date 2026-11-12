/**
 * Creating an inventory from nothing (spec inventory_create), as rules: the
 * files a create seeds, and whether the host's paths leave room for them. The
 * host checks what only it knows between the two (that its tree is synced,
 * that no other space's scope overlaps, whether an earlier attempt is being
 * resumed) and seeds the files.
 */
import { fail, ok, placeNewFiles } from '@stillpointlab/common-format/app';

import { checkInventoryCreate } from './createRules.js';
import { INVENTORY_MANIFEST_FILENAME, INVENTORY_ROOMS_DIR } from './detection.js';
import { parseInventoryManifest } from './manifest.js';
import { manifestSeedContent } from './manifestSeed.js';
import { INVENTORY_DEFAULT_FOLDER } from './paths.js';
import { slugifyZoneTitle, zoneSeedContent } from './zoneSeed.js';

import type { InventoryCreateFields } from './createRules.js';
import type { InventoryManifestSeed } from './manifestSeed.js';
import type { FileChange, Result } from '@stillpointlab/common-format/app';

/**
 * What a create asks for: the form's fields (`./create`) and the folder.
 * Everything but the label has a default, so the smallest create is a name.
 */
export interface CreateInventoryInput extends InventoryCreateFields {
  /** Target folder; the repository root (`''`) is refused. Defaults to `inventory`. */
  folder?: string;
}

/** A create's files: the manifest first, then the zones in the order given. */
export interface InventoryCreatePlan {
  manifestPath: string;
  spacePath: string;
  files: (FileChange & { kind: 'create' })[];
}

/**
 * The files a create seeds, or why it cannot: fields the form would refuse
 * (`checkInventoryCreate`, the same checks), an invalid manifest, or the
 * repository root. Filenames are settled before anything is written, so a bad
 * title never seeds half an inventory.
 */
export function planInventoryCreate(input: CreateInventoryInput): Result<InventoryCreatePlan> {
  const checked = checkInventoryCreate(input);
  if (!checked.ok) return checked;
  const seed: InventoryManifestSeed = {
    label: input.label,
    ...(input.fields !== undefined ? { fields: input.fields } : {}),
    ...(input.total !== undefined ? { total: input.total } : {}),
  };
  const manifestContent = manifestSeedContent(seed);
  const validation = parseInventoryManifest(manifestContent);
  if (!validation.ok || validation.manifest.version !== 2) {
    const errors = validation.ok ? ['the generated manifest is not version 2'] : validation.details;
    return fail('INVENTORY_MANIFEST_INVALID', errors.join('; '));
  }

  const folder = input.folder ?? INVENTORY_DEFAULT_FOLDER;
  // A root space's scope is the whole repository (ADR-0025 decision 3), so it
  // would forbid every other inventory. Enabling an existing root manifest
  // stays a host's choice; creating one is refused.
  if (folder === '') {
    return fail(
      'INVENTORY_FOLDER_REQUIRED',
      'Choose a folder — a root-level inventory would prevent any other inventory in this repository'
    );
  }
  const manifestPath = `${folder}/${INVENTORY_MANIFEST_FILENAME}`;
  const roomsDir = `${folder}/${INVENTORY_ROOMS_DIR}`;

  const files: InventoryCreatePlan['files'] = [
    { kind: 'create', path: manifestPath, content: manifestContent },
  ];
  // Every title names a distinct file: `checkInventoryCreate` refused the rest.
  for (const title of input.zones ?? []) {
    files.push({
      kind: 'create',
      path: `${roomsDir}/${slugifyZoneTitle(title)}.yaml`,
      content: zoneSeedContent(title),
    });
  }
  return ok({ manifestPath, spacePath: folder, files });
}

/**
 * Whether a plan's files fit among the host's paths (the contract's
 * `placeNewFiles`): none of them, and no folder above them, may already be a
 * file, or the first that is answers `INVENTORY_PATH_EXISTS`. `reusable` names
 * files a host created in an earlier, unfinished attempt at this same create:
 * they are skipped rather than refused, so a retry finishes the job. Answers
 * the files still to seed, in the plan's order.
 */
export function placeInventoryCreate(
  plan: InventoryCreatePlan,
  paths: { taken: readonly string[]; reusable?: readonly string[] }
): Result<{ files: InventoryCreatePlan['files'] }> {
  // A file in the way would otherwise surface only when the first check-in's
  // commit is built.
  const placed = placeNewFiles(plan.files, paths);
  return placed.ok
    ? ok({ files: placed.files })
    : fail('INVENTORY_PATH_EXISTS', `“${placed.path}” already exists`);
}
