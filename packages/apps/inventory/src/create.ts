/**
 * Creating an inventory from nothing (spec inventory_create), as rules: the
 * files a create seeds, and whether the host's paths leave room for them. The
 * host checks what only it knows between the two (that its tree is synced,
 * that no other space's scope overlaps, whether an earlier attempt is being
 * resumed) and seeds the files.
 */
import { fail, ok, placeNewFiles } from '@stillpointlab/common-format/app';

import { INVENTORY_MANIFEST_FILENAME, INVENTORY_ROOMS_DIR } from './detection.js';
import { parseInventoryManifest } from './manifest.js';
import { manifestSeedContent } from './manifestSeed.js';
import { INVENTORY_DEFAULT_FOLDER } from './paths.js';
import { slugifyZoneTitle, zoneSeedContent } from './zoneSeed.js';

import type { InventoryManifestSeed } from './manifestSeed.js';
import type { FileChange, Result } from '@stillpointlab/common-format/app';

/**
 * What the create dialog collects. Everything but the label has a default,
 * so the smallest create is a name.
 */
export interface CreateInventoryInput {
  label: string;
  /** Target folder; the repository root (`''`) is refused. Defaults to `inventory`. */
  folder?: string;
  fields?: InventoryManifestSeed['fields'];
  total?: InventoryManifestSeed['total'];
  /** Zone titles, each seeded under the `rooms/` folder (the storage name). */
  zones?: string[];
}

/** A create's files: the manifest first, then the zones in the order given. */
export interface InventoryCreatePlan {
  manifestPath: string;
  spacePath: string;
  files: (FileChange & { kind: 'create' })[];
}

/**
 * The files a create seeds, or why it cannot: an invalid manifest, the
 * repository root, or zone titles that name no file or the same file.
 * Filenames are settled before anything is written, so a bad title never
 * seeds half an inventory.
 */
export function planInventoryCreate(input: CreateInventoryInput): Result<InventoryCreatePlan> {
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
  const slugs = new Set<string>();
  for (const title of input.zones ?? []) {
    const slug = slugifyZoneTitle(title);
    if (slug === '') {
      return fail('INVENTORY_ROOM_NAME_INVALID', 'A zone title must contain letters or numbers');
    }
    if (slugs.has(slug)) {
      return fail('INVENTORY_ROOM_NAME_DUPLICATE', `Two zones would both be named “${slug}.yaml”`);
    }
    slugs.add(slug);
    files.push({
      kind: 'create',
      path: `${roomsDir}/${slug}.yaml`,
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
