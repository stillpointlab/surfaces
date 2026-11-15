/**
 * The shell's links: the inventory's pages under a host's base, and the
 * exports a host offers. DOM-free. A base is joined as text, never parsed as a
 * `URL`: Context Manager's is a path, the local host's a fragment
 * (`#/app/inventory/inventory.yaml`).
 */
import { pageHref } from '@stillpointlab/common-format/app';

import { inventoryPages } from '../pages.js';

/** What a host exports, as it hands them to the shell in `extras.exports`. */
export interface InventoryExports {
  /** The whole inventory as a ZIP. */
  all?: string;
  /** One zone as CSV, by its file's path. */
  zone?(path: string): string;
}

/** `rooms/attic.yaml` → `attic`: a zone's slug is its file's name without the extension. */
export function zoneSlugOfPath(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1);
  return file.replace(/\.ya?ml$/i, '');
}

/** The page that shows one zone, from the module's pages: `/room/:roomSlug`. */
const ZONE_PAGE = inventoryPages.find((page) => page.path.endsWith('/:roomSlug'))!.path;

/** A zone's page under `base`. */
export function zoneHref(base: string, slug: string): string {
  return pageHref(base, ZONE_PAGE, { roomSlug: slug });
}

/** The exports in a host's `extras`, keeping only what has the right shape. */
export function exportsOf(extras: Record<string, unknown> | undefined): InventoryExports {
  const given = extras?.exports;
  if (typeof given !== 'object' || given === null) return {};
  const { all, zone } = given as Record<string, unknown>;
  return {
    ...(typeof all === 'string' ? { all } : {}),
    ...(typeof zone === 'function'
      ? { zone: (path: string) => String((zone as (path: string) => unknown)(path)) }
      : {}),
  };
}
