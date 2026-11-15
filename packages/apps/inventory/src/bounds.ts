/**
 * The inventory's bounds (the app contract's `AppBounds`): what an op, a view
 * and a create input must be before the core sees them. Sizes, number shapes
 * and no unknown keys; the core checks everything that needs the manifest
 * (declared fields, their types, required fields, the zone and the item), and
 * the create plan checks reserved and repeated ids, zone file names and the
 * total's columns, as the form does.
 *
 * Every limit, enum and pattern is Context Manager's at 8fa439ba, where these
 * bounded the generic op route, the view reads and the create route.
 */
import { fail, ok } from '@stillpointlab/common-format/app';
import { MAX_SHEET_DECIMAL_PLACES } from '@stillpointlab/sheet-format/presentation';
import { z } from 'zod';

import {
  INVENTORY_CURRENCY_PATTERN,
  INVENTORY_FIELD_ID_MAX_LENGTH,
  INVENTORY_FIELD_ID_PATTERN,
  INVENTORY_FIELD_LABEL_MAX_LENGTH,
  INVENTORY_MAX_FIELDS,
} from './paths.js';

import type { InventoryViews } from './core.js';
import type { InventoryCreateFields } from './createRules.js';
import type { InventoryOps } from './elementOps.js';
import type { AppBounds, AppOp, AppView, Result } from '@stillpointlab/common-format/app';
import type { ZodType } from 'zod';

const scalar = z.union([z.string().max(2000), z.number().finite(), z.boolean()]);

/** A zone file's path, as the elements name it. */
const zonePath = z.string().min(1).max(1000);

/** An item id: one path segment. */
const itemId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[^/\\]+$/, 'Item id must be a single path segment');

// Quick add: a title, the known optional fields, and declared fields' values
// as a map of scalars. Hand edits may hold anything; the op stays typed.
const addItem = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().max(4000).optional(),
    value: z.number().finite().optional(),
    quantity: z.number().int().positive().optional(),
    serial: z.string().max(500).optional(),
    acquired: z.string().max(200).optional(),
    container: z.string().trim().max(200).optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    fieldValues: z.record(z.string().max(100), scalar).optional(),
  })
  .strict();

// An edit: any subset of the known and declared fields, `null` clearing an
// optional one. The title stays non-empty, and the id cannot change.
const itemChanges = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().max(4000).nullable().optional(),
    value: z.number().finite().nullable().optional(),
    quantity: z.number().int().positive().nullable().optional(),
    serial: z.string().max(500).nullable().optional(),
    acquired: z.string().max(200).nullable().optional(),
    container: z.string().trim().max(200).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(50).nullable().optional(),
    fieldValues: z.record(z.string().max(100), scalar.nullable()).optional(),
    extraValues: z.record(z.string().max(100), scalar.nullable()).optional(),
  })
  .strict();

/** The core's four ops. `link-editor` is a host's op, so a host bounds it itself. */
export const inventoryOpSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add-zone'), title: z.string().trim().min(1).max(120) }).strict(),
  z.object({ type: z.literal('add-item'), path: zonePath, item: addItem }).strict(),
  z
    .object({ type: z.literal('update-item'), path: zonePath, id: itemId, changes: itemChanges })
    .strict(),
  z.object({ type: z.literal('delete-item'), path: zonePath, id: itemId }).strict(),
]);

/** The two views: the overview, and one zone by slug. */
export const inventoryViewSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('space') }).strict(),
  z.object({ type: z.literal('zone'), slug: z.string().min(1).max(200) }).strict(),
]);

const fieldId = z.string().max(INVENTORY_FIELD_ID_MAX_LENGTH).regex(INVENTORY_FIELD_ID_PATTERN);

/** A create's fields. The folder is the host's to add. */
export const inventoryCreateInputSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    fields: z
      .array(
        z
          .object({
            id: fieldId,
            label: z.string().trim().min(1).max(INVENTORY_FIELD_LABEL_MAX_LENGTH),
            type: z.enum(['text', 'number']),
            format: z
              .object({
                kind: z.literal('currency'),
                currency: z.string().regex(INVENTORY_CURRENCY_PATTERN),
                decimalPlaces: z.number().int().min(0).max(MAX_SHEET_DECIMAL_PLACES),
              })
              .strict()
              .optional(),
          })
          .strict()
      )
      .max(INVENTORY_MAX_FIELDS)
      .optional(),
    total: z.object({ field: fieldId, multiplyBy: fieldId.optional() }).strict().optional(),
    zones: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  })
  .strict();

/** `input` as `schema` parses it, or a refusal with `code`, the schema's issues in `details`. */
function bounded<T>(
  schema: ZodType,
  input: unknown,
  code: string,
  what: string
): Result<{ value: T }> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return ok({ value: parsed.data as T });
  const { issues } = parsed.error;
  const causes = issues
    .map(
      (issue) =>
        (issue.path.length > 0 ? `${issue.path.map(String).join('.')}: ` : '') + issue.message
    )
    .join('; ');
  return fail(code, `${what} is not valid: ${causes}`, issues);
}

/** Answer a bounded value under the field the contract names. */
function under<K extends string, T>(key: K, result: Result<{ value: T }>): Result<Record<K, T>> {
  return result.ok ? ok({ [key]: result.value } as Record<K, T>) : result;
}

export const inventoryBounds: AppBounds<InventoryViews, InventoryOps, InventoryCreateFields> = {
  op: (input) =>
    under('op', bounded<AppOp<InventoryOps>>(inventoryOpSchema, input, 'APP_OP_INVALID', 'The op')),
  view: (input) =>
    under(
      'view',
      bounded<AppView<InventoryViews>>(inventoryViewSchema, input, 'APP_VIEW_INVALID', 'The view')
    ),
  create: (input) =>
    under(
      'input',
      bounded<InventoryCreateFields>(
        inventoryCreateInputSchema,
        input,
        'APP_CREATE_INVALID',
        'The inventory'
      )
    ),
};
