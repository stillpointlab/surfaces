/**
 * Seeding a new room file into the connected repo (spec inventory_add_room).
 * The seed is a real digital good at a not-yet-existing repo path whose
 * `gitOrigin` carries NO `importedBlobSha` — the app-only marker that makes
 * detection see it, the check-in offer it as a new file, and the first PR
 * publish it (the tasks board's `createCard` precedent, ADR-0014/0020).
 *
 * Kept as small named exports because create-inventory (slice 2) seeds its
 * initial rooms through exactly this path. The content is pure; the write
 * that creates the good is the host's (`seedFiles.ts`).
 */
import { formatYamlScalar } from '@stillpointlab/common-format/yaml';

import { slugifyInventoryName } from './paths.js';

/**
 * A room title as a filename slug: the item-id slug rules (lowercase, alnum
 * runs joined by `-`, capped). Empty when the title carries no letters or
 * numbers — the caller refuses rather than inventing a name. Shared with the
 * client so the create dialog can pre-empt duplicate room names.
 */
export function slugifyRoomTitle(title: string): string {
  return slugifyInventoryName(title);
}

/**
 * The bytes a careful human would write for a brand-new empty room: one
 * `label:` line, block style, no `items:` key (it appears with the first
 * item, and an items-less file already scans as a valid empty writable room).
 */
export function roomSeedContent(title: string): string {
  return `label: ${formatYamlScalar(title)}\n`;
}
