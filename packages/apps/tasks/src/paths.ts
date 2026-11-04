/**
 * Naming rules and creation defaults for a task project started from nothing
 * (spec tasks_create). Shared because three layers must agree on them byte
 * for byte: the create-tasks Zod body, the service that seeds `tasks.yaml`,
 * and the dialog that mirrors both client-side. The folder rules are
 * `manifestFolder.utils.ts` — one grammar for "a folder a manifest may be
 * created in", whatever the app.
 */

/** Create defaults into a folder; the dialog encourages keeping it. */
export const TASKS_DEFAULT_FOLDER = 'tasks';

/**
 * Manifest slug rule (columns, kinds — `manifest.ts`'s `SLUG_PATTERN`,
 * re-stated here for the layers that cannot import a server service). Ids
 * are permanent once created (ADR-0028 decision 5): labels rename freely,
 * ids never change through app surfaces.
 */
export const TASKS_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export const TASKS_ID_MAX_LENGTH = 40;

/**
 * A label as a manifest slug: lowercase alphanumeric runs joined by `-`,
 * capped to the id length. Empty when the label has nothing to work with —
 * the dialog leaves the id field for the user to fill instead of inventing.
 */
export function slugifyTaskId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TASKS_ID_MAX_LENGTH)
    .replace(/-+$/, '');
}
