/**
 * The inventory elements' ops as rules (phase 7, inventory-rules): each takes a
 * snapshot and the op in the shape the elements ask for it, and answers the
 * file changes the op makes or a refusal. A host writes the changes (its own
 * way: a draft, a new file) and maps a refusal's code to its own errors. The
 * codes and messages are the ones Context Manager's endpoints have always
 * sent.
 */
import { fail, ok } from '@stillpointlab/common-format/app';

import {
  rejectConfiguredLegacyInput,
  validateConfiguredField,
  validateExtraKey,
  validateLegacyDeclaredField,
} from './fields.js';
import { resolveInventory, snapshotContent } from './space.js';
import { slugifyZoneTitle, zoneSeedContent } from './zoneSeed.js';
import {
  appendItem,
  deleteItem,
  disambiguateItemId,
  patchItem,
  slugifyItemId,
} from './zoneWriter.js';

import type { InventorySnapshot, ResolvedInventory } from './space.js';
import type {
  SharedInventoryManifestV1,
  SharedInventoryManifestV2,
  SharedInventoryScalar,
  SharedInventoryZone,
} from './types.js';
import type { ItemPatchValue } from './zoneWriter.js';
import type { Failure, FileChange, Result } from '@stillpointlab/common-format/app';

/** A new item's fields (its id is assigned by `addInventoryItem`). */
export interface AddInventoryItemInput {
  title: string;
  description?: string;
  value?: number;
  quantity?: number;
  serial?: string;
  acquired?: string;
  container?: string;
  tags?: string[];
  /** Declared-field values, keyed by field id (validated against the manifest). */
  fieldValues?: Record<string, SharedInventoryScalar>;
}

/**
 * An item edit: any subset of the core fields plus declared-field values;
 * `null` clears an optional field. `id` is deliberately absent: immutable
 * after creation.
 */
export interface UpdateInventoryItemInput {
  title?: string;
  description?: string | null;
  value?: number | null;
  quantity?: number | null;
  serial?: string | null;
  acquired?: string | null;
  container?: string | null;
  tags?: string[] | null;
  fieldValues?: Record<string, SharedInventoryScalar | null>;
  /** Configured (v2) scalar Other data; `null` removes an existing key. */
  extraValues?: Record<string, SharedInventoryScalar | null>;
}

/** What every op answers on success: the files to write. */
export interface InventoryOpChanges {
  changes: FileChange[];
}

type WritableSchema =
  | { mode: 'legacy'; manifest: SharedInventoryManifestV1 }
  | { mode: 'configured'; manifest: SharedInventoryManifestV2 };

interface WritableZone {
  resolved: ResolvedInventory;
  schema: WritableSchema;
  zone: SharedInventoryZone;
  content: string;
}

const noManifest = (): Failure =>
  fail('INVENTORY_MANIFEST_NOT_FOUND', 'This repository has no inventory.yaml');

/**
 * The item ops' shared gate: a valid schema, the zone, and a writable file
 * with content. Its messages, like the other messages users see, keep their
 * room wording: the zone rename changed names, not what users read.
 */
function writableZone(snapshot: InventorySnapshot, path: string): Result<WritableZone> {
  const resolved = resolveInventory(snapshot);
  if (!resolved) return noManifest();
  const { schema } = resolved;
  if (schema.mode === 'invalid') {
    return fail('INVENTORY_SCHEMA_INVALID', 'Repair inventory.yaml before changing items');
  }
  const zone = resolved.zones.find((candidate) => candidate.path === path);
  if (!zone) return fail('INVENTORY_ZONE_NOT_FOUND', `No zone at “${path}”`);
  if (!zone.writable) {
    return fail(
      'INVENTORY_ROOM_READ_ONLY',
      zone.readOnlyReason ?? zone.parseError ?? 'The zone file cannot be edited by the app'
    );
  }
  const content = snapshotContent(snapshot, path);
  if (content === null) {
    return fail('INVENTORY_CONTENT_UNAVAILABLE', 'Zone content is unavailable');
  }
  return ok({ resolved, schema, zone, content });
}

/** Fields in the manifest's order. */
function inManifestOrder(
  fields: readonly { id: string }[],
  values: [string, SharedInventoryScalar][]
): [string, SharedInventoryScalar][] {
  const at = (id: string): number => fields.findIndex((field) => field.id === id);
  return values.sort((a, b) => at(a[0]) - at(b[0]));
}

/**
 * Seed a new zone: `rooms/<slug>.yaml` beside the manifest, holding its label.
 * Collisions are refused, never disambiguated: a file named differently than
 * asked is more surprising than an error.
 */
export function addInventoryZone(
  snapshot: InventorySnapshot,
  op: { title: string }
): Result<InventoryOpChanges & { slug: string; path: string }> {
  const resolved = resolveInventory(snapshot);
  if (!resolved) return noManifest();
  if (resolved.schema.mode === 'invalid') {
    return fail('INVENTORY_SCHEMA_INVALID', 'Repair inventory.yaml before adding a zone');
  }
  const slug = slugifyZoneTitle(op.title);
  if (slug === '') {
    return fail('INVENTORY_ROOM_NAME_INVALID', 'The title must contain letters or numbers');
  }
  const path = `${resolved.detection.roomsDir}/${slug}.yaml`;
  if (snapshot.paths.includes(path) || (snapshot.taken ?? []).includes(path)) {
    return fail('INVENTORY_ROOM_EXISTS', `“${slug}.yaml” already exists here`);
  }
  return ok({
    slug,
    path,
    changes: [{ kind: 'create', path, content: zoneSeedContent(op.title) }],
  });
}

/**
 * Add an item to a zone: the fields validated against the manifest, written
 * in its order, under an id unique across the whole space.
 */
export function addInventoryItem(
  snapshot: InventorySnapshot,
  op: { path: string; item: AddInventoryItemInput }
): Result<InventoryOpChanges & { id: string }> {
  const gate = writableZone(snapshot, op.path);
  if (!gate.ok) return gate;
  const { resolved, schema, content } = gate;
  const input = op.item;
  if (typeof input.title !== 'string' || input.title.trim() === '') {
    return fail('INVENTORY_TITLE_REQUIRED', `'title' must be non-empty`);
  }

  const fieldValues: [string, SharedInventoryScalar][] = [];
  if (schema.mode === 'configured') {
    const legacy = rejectConfiguredLegacyInput(input);
    if (!legacy.ok) return legacy;
    for (const [key, value] of Object.entries(input.fieldValues ?? {})) {
      const checked = validateConfiguredField(schema.manifest.fields, key, value);
      if (!checked.ok) return checked;
      if (!checked.field.visibility.add) {
        return fail('INVENTORY_FIELD_NOT_ADDABLE', `'${key}' is hidden from Add item`);
      }
      fieldValues.push([key, value]);
    }
    for (const field of schema.manifest.fields) {
      if (!field.required) continue;
      const value = input.fieldValues?.[field.id];
      if (
        value === undefined ||
        (field.type === 'text' && (typeof value !== 'string' || value.trim() === ''))
      ) {
        return fail('INVENTORY_REQUIRED_FIELD', `'${field.id}' is required`);
      }
    }
  } else {
    for (const [key, value] of Object.entries(input.fieldValues ?? {})) {
      const checked = validateLegacyDeclaredField(schema.manifest, key, value);
      if (!checked.ok) return checked;
      fieldValues.push([key, value]);
    }
  }
  inManifestOrder(schema.manifest.fields, fieldValues);

  // Unique across the space, needs-attention ids included.
  const taken = new Set<string>();
  for (const zone of resolved.zones) {
    for (const item of zone.items) taken.add(item.id);
    for (const attention of zone.needsAttention) {
      if (attention.id !== undefined) taken.add(attention.id);
    }
  }
  const id = disambiguateItemId(slugifyItemId(input.title), taken);

  const appended = appendItem(content, {
    id,
    title: input.title,
    ...(schema.mode === 'legacy'
      ? {
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.value !== undefined ? { value: input.value } : {}),
          ...(input.quantity !== undefined && input.quantity !== 1
            ? { quantity: input.quantity }
            : {}),
          ...(input.serial !== undefined ? { serial: input.serial } : {}),
          ...(input.acquired !== undefined ? { acquired: input.acquired } : {}),
          ...(input.container !== undefined ? { container: input.container } : {}),
          ...(input.tags !== undefined && input.tags.length > 0 ? { tags: input.tags } : {}),
        }
      : {}),
    ...(fieldValues.length > 0 ? { fieldValues } : {}),
  });
  // The gate's scan already passed; a refusal here is the writer double-checking.
  if (!appended.ok) return appended;
  return ok({ id, changes: [{ kind: 'write', path: op.path, content: appended.content }] });
}

/**
 * The configured (v2) patch of an edit: declared fields checked one by one,
 * then the repair boundary (after the patch every required field is valid),
 * then Other data.
 */
function configuredPatch(
  manifest: SharedInventoryManifestV2,
  zone: SharedInventoryZone,
  id: string,
  input: UpdateInventoryItemInput,
  patch: Record<string, ItemPatchValue>
): Failure | null {
  const legacy = rejectConfiguredLegacyInput(input);
  if (!legacy.ok) return legacy;
  const item = zone.items.find((candidate) => candidate.id === id);
  // Hand-deleted since the state was read (spec inventory_edit_item #1): an
  // element asks its host to reload on this code.
  if (!item) return fail('INVENTORY_ITEM_NOT_FOUND', `No item with id '${id}' exists in this zone`);

  for (const [key, value] of Object.entries(input.fieldValues ?? {})) {
    const field = manifest.fields.find((candidate) => candidate.id === key);
    if (!field) {
      return fail('INVENTORY_UNKNOWN_FIELD', `'${key}' is not a field declared in inventory.yaml`);
    }
    if (!field.visibility.edit) {
      return fail('INVENTORY_FIELD_NOT_EDITABLE', `'${key}' is hidden from Edit item`);
    }
    if (value !== null) {
      const checked = validateConfiguredField(manifest.fields, key, value);
      if (!checked.ok) return checked;
    }
    if (value === null && field.required) {
      return fail('INVENTORY_REQUIRED_FIELD', `'${key}' is required`);
    }
    patch[key] = value;
  }

  // A save is the repair boundary: after this patch, every required field
  // holds a valid, non-blank value.
  for (const field of manifest.fields.filter((candidate) => candidate.required)) {
    const changed = Object.hasOwn(input.fieldValues ?? {}, field.id);
    const current = item.resolvedFieldValues?.[field.id];
    const next = changed
      ? input.fieldValues?.[field.id]
      : current?.state === 'valid'
        ? current.value
        : undefined;
    if (
      next === undefined ||
      next === null ||
      (field.type === 'text' && (typeof next !== 'string' || next.trim() === '')) ||
      (field.type === 'number' && (typeof next !== 'number' || !Number.isFinite(next)))
    ) {
      return fail('INVENTORY_REQUIRED_FIELD', `'${field.id}' must be repaired before saving`);
    }
  }

  for (const [key, value] of Object.entries(input.extraValues ?? {})) {
    const safe = validateExtraKey(manifest.fields, key);
    if (!safe.ok) return safe;
    const existing = item.extraFields.find((extra) => extra.key === key);
    if (
      existing &&
      (existing.opaque === true || Array.isArray(existing.value) || existing.value === undefined)
    ) {
      return fail('INVENTORY_EXTRA_READ_ONLY', `'${key}' has a read-only structured value`);
    }
    if (value !== null && typeof value === 'number' && !Number.isFinite(value)) {
      return fail('INVENTORY_FIELD_TYPE', `'${key}' must be finite`);
    }
    patch[key] = value;
  }
  return null;
}

/** The legacy (v1) patch of an edit: the frozen core fields and declared fields. */
function legacyPatch(
  manifest: SharedInventoryManifestV1,
  input: UpdateInventoryItemInput,
  patch: Record<string, ItemPatchValue>
): Failure | null {
  if (input.extraValues !== undefined) {
    return fail(
      'INVENTORY_EXTRA_UNSUPPORTED',
      'Other data editing requires inventory.yaml version 2'
    );
  }
  for (const key of ['description', 'serial', 'acquired', 'container'] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  if (input.value !== undefined) patch.value = input.value;
  if (input.quantity !== undefined) {
    patch.quantity = input.quantity === null || input.quantity === 1 ? null : input.quantity;
  }
  if (input.tags !== undefined) {
    patch.tags = input.tags === null || input.tags.length === 0 ? null : input.tags;
  }
  for (const [key, value] of Object.entries(input.fieldValues ?? {})) {
    if (value !== null) {
      const checked = validateLegacyDeclaredField(manifest, key, value);
      if (!checked.ok) return checked;
    } else if (!manifest.fields.some((field) => field.id === key)) {
      return fail('INVENTORY_UNKNOWN_FIELD', `'${key}' is not a field declared in inventory.yaml`);
    }
    patch[key] = value;
  }
  return null;
}

/**
 * Edit one item field by field: changed fields patch their own lines; other
 * lines keep their bytes. `null` clears a field; `id` is immutable and a new
 * title does not re-slug it. An edit that changes nothing answers no changes.
 */
export function updateInventoryItem(
  snapshot: InventorySnapshot,
  op: { path: string; id: string; changes: UpdateInventoryItemInput }
): Result<InventoryOpChanges> {
  const gate = writableZone(snapshot, op.path);
  if (!gate.ok) return gate;
  const { schema, zone, content } = gate;
  const input = op.changes;
  if (input.title !== undefined && input.title.trim() === '') {
    return fail('INVENTORY_TITLE_REQUIRED', `'title' must remain non-empty`);
  }

  const patch: Record<string, ItemPatchValue> = {};
  if (input.title !== undefined) patch.title = input.title;
  const refused =
    schema.mode === 'configured'
      ? configuredPatch(schema.manifest, zone, op.id, input, patch)
      : legacyPatch(schema.manifest, input, patch);
  if (refused) return refused;
  if (Object.keys(patch).length === 0) return ok({ changes: [] });

  const patched = patchItem(content, op.id, patch);
  if (!patched.ok) return patched;
  return ok({ changes: [{ kind: 'write', path: op.path, content: patched.content }] });
}

/** Remove one item's whole span from its zone file. */
export function deleteInventoryItem(
  snapshot: InventorySnapshot,
  op: { path: string; id: string }
): Result<InventoryOpChanges> {
  const gate = writableZone(snapshot, op.path);
  if (!gate.ok) return gate;
  const deleted = deleteItem(gate.content, op.id);
  if (!deleted.ok) return deleted;
  return ok({ changes: [{ kind: 'write', path: op.path, content: deleted.content }] });
}
