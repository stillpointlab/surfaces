/**
 * Naming rules and creation defaults for the files an inventory is made of
 * (ADR-0022). Shared because three layers must agree on them byte for byte:
 * the create-inventory Zod body, the service that names the seeded files, and
 * the dialog that mirrors both client-side (spec inventory_create #3, #5).
 */

/** Create defaults into a folder; the dialog encourages keeping it. */
export const INVENTORY_DEFAULT_FOLDER = 'inventory';

/** Written explicitly into every seeded manifest, default or not. */
export const INVENTORY_DEFAULT_CURRENCY = 'USD';

/** Display-only currency code (ADR-0022 keeps conversion out of scope). */
export const INVENTORY_CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** Configured field ids are durable zone-file keys. */
export const INVENTORY_FIELD_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
export const INVENTORY_FIELD_ID_MAX_LENGTH = 100;
export const INVENTORY_FIELD_LABEL_MAX_LENGTH = 120;
export const INVENTORY_MAX_FIELDS = 100;
export const INVENTORY_RESERVED_FIELD_IDS: ReadonlySet<string> = new Set(['id', 'title']);

/**
 * A title as a slug: lowercase alphanumeric runs joined by `-`, capped.
 * Empty for a degenerate title — callers that name FILES (zone seeding)
 * refuse instead of inventing a name, and callers that name ITEMS fall back.
 */
export function slugifyInventoryName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}
