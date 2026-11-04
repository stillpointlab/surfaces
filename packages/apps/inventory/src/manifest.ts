import { MAX_SHEET_DECIMAL_PLACES } from '@stillpointlab/sheet-format/presentation';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import {
  INVENTORY_CURRENCY_PATTERN,
  INVENTORY_FIELD_ID_MAX_LENGTH,
  INVENTORY_FIELD_ID_PATTERN,
  INVENTORY_FIELD_LABEL_MAX_LENGTH,
  INVENTORY_MAX_FIELDS,
  INVENTORY_RESERVED_FIELD_IDS,
} from './paths.js';

import type {
  SharedInventoryManifest,
  SharedInventoryManifestV1,
  SharedInventoryManifestV2,
} from './types.js';

/**
 * Version-discriminated `inventory.yaml` parsing. V1 intentionally retains
 * its tolerant unknown-key behavior; every known v2 mapping is strict.
 */

const nonBlank = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => value.trim() !== '', 'must not be blank');

const legacyFieldIdSchema = z
  .string()
  .regex(INVENTORY_FIELD_ID_PATTERN, 'must be a lowercase slug (a-z, 0-9, -, _)');

const fieldIdSchema = z
  .string()
  .max(INVENTORY_FIELD_ID_MAX_LENGTH)
  .regex(INVENTORY_FIELD_ID_PATTERN, 'must be a lowercase slug (a-z, 0-9, -, _)');

const legacyFieldSchema = z.object({
  // V1 had no id-length cap; keep that parser frozen.
  id: legacyFieldIdSchema,
  label: z.string().min(1),
  type: z.enum(['text', 'number', 'date']).default('text'),
});

const legacyManifestSchema = z
  .object({
    version: z.literal(1),
    label: z.string().min(1).optional(),
    // Historical free-form currency is intentionally preserved.
    currency: z.string().min(1).default('USD'),
    fields: z.array(legacyFieldSchema).default([]),
    containers: z.array(z.string().min(1)).default([]),
  })
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    for (const field of manifest.fields) {
      if (seen.has(field.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields'],
          message: `duplicate field id '${field.id}'`,
        });
      }
      seen.add(field.id);
    }
  });

const visibilityV2Schema = z
  .object({
    table: z.boolean().optional(),
    add: z.boolean().optional(),
    edit: z.boolean().optional(),
  })
  .strict();

const currencyFormatV2Schema = z
  .object({
    kind: z.literal('currency'),
    currency: z
      .string()
      .regex(INVENTORY_CURRENCY_PATTERN, 'must be three uppercase letters such as USD'),
    decimalPlaces: z.number().int().min(0).max(MAX_SHEET_DECIMAL_PLACES),
  })
  .strict();

const fieldV2InputSchema = z
  .object({
    id: fieldIdSchema,
    label: nonBlank(INVENTORY_FIELD_LABEL_MAX_LENGTH),
    type: z.enum(['text', 'number']),
    required: z.boolean().optional(),
    visibility: visibilityV2Schema.optional(),
    export: z.boolean().optional(),
    format: currencyFormatV2Schema.optional(),
  })
  .strict();

const totalV2Schema = z
  .object({
    field: fieldIdSchema,
    multiplyBy: fieldIdSchema.optional(),
  })
  .strict();

const manifestV2InputSchema = z
  .object({
    version: z.literal(2),
    label: nonBlank(INVENTORY_FIELD_LABEL_MAX_LENGTH).optional(),
    fields: z.array(fieldV2InputSchema).max(INVENTORY_MAX_FIELDS).optional(),
    total: totalV2Schema.optional(),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const fields = manifest.fields ?? [];
    const ids = new Set<string>();
    const labels = new Set<string>();
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      if (INVENTORY_RESERVED_FIELD_IDS.has(field.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', index, 'id'],
          message: `'${field.id}' is reserved`,
        });
      }
      if (ids.has(field.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', index, 'id'],
          message: `duplicate field id '${field.id}'`,
        });
      }
      ids.add(field.id);

      const foldedLabel = field.label.toLocaleLowerCase('en-US');
      if (labels.has(foldedLabel)) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', index, 'label'],
          message: `duplicate field label '${field.label}'`,
        });
      }
      labels.add(foldedLabel);

      if (field.format !== undefined && field.type !== 'number') {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', index, 'format'],
          message: 'format is only valid for number fields',
        });
      }
      if (
        field.required === true &&
        (field.visibility?.add === false || field.visibility?.edit === false)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', index, 'visibility'],
          message: 'a required field must be visible when adding and editing items',
        });
      }
    }

    if (manifest.total !== undefined) {
      const amount = fields.find((field) => field.id === manifest.total!.field);
      if (!amount) {
        ctx.addIssue({
          code: 'custom',
          path: ['total', 'field'],
          message: `'${manifest.total.field}' is not a declared field`,
        });
      } else if (amount.type !== 'number') {
        ctx.addIssue({
          code: 'custom',
          path: ['total', 'field'],
          message: `'${manifest.total.field}' is not a number field`,
        });
      }

      if (manifest.total.multiplyBy !== undefined) {
        if (manifest.total.multiplyBy === manifest.total.field) {
          ctx.addIssue({
            code: 'custom',
            path: ['total', 'multiplyBy'],
            message: 'must reference a different field',
          });
        }
        const multiplier = fields.find((field) => field.id === manifest.total!.multiplyBy);
        if (!multiplier) {
          ctx.addIssue({
            code: 'custom',
            path: ['total', 'multiplyBy'],
            message: `'${manifest.total.multiplyBy}' is not a declared field`,
          });
        } else if (multiplier.type !== 'number') {
          ctx.addIssue({
            code: 'custom',
            path: ['total', 'multiplyBy'],
            message: `'${manifest.total.multiplyBy}' is not a number field`,
          });
        }
      }
    }
  })
  .transform((manifest): SharedInventoryManifestV2 => ({
    version: 2,
    ...(manifest.label !== undefined ? { label: manifest.label } : {}),
    fields: (manifest.fields ?? []).map((field) => ({
      id: field.id,
      label: field.label,
      type: field.type,
      required: field.required ?? false,
      visibility: {
        table: field.visibility?.table ?? true,
        add: field.visibility?.add ?? true,
        edit: field.visibility?.edit ?? true,
      },
      export: field.export ?? true,
      ...(field.format !== undefined ? { format: field.format } : {}),
    })),
    ...(manifest.total !== undefined ? { total: manifest.total } : {}),
  }));

const KNOWN_V1_TOP_LEVEL_KEYS = new Set(['version', 'label', 'currency', 'fields', 'containers']);
const KNOWN_V1_FIELD_KEYS = new Set(['id', 'label', 'type']);

export type InventoryManifestParseResult =
  | { ok: true; manifest: SharedInventoryManifest; warnings: string[] }
  | { ok: false; errors: string[]; declaredVersion?: number };

function collectLegacyUnknownKeyWarnings(raw: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!KNOWN_V1_TOP_LEVEL_KEYS.has(key)) warnings.push(`unknown key '${key}' is ignored`);
  }
  if (Array.isArray(raw.fields)) {
    raw.fields.forEach((field, index) => {
      if (field === null || typeof field !== 'object' || Array.isArray(field)) return;
      for (const key of Object.keys(field)) {
        if (!KNOWN_V1_FIELD_KEYS.has(key)) {
          warnings.push(`unknown key 'fields.${index}.${key}' is ignored`);
        }
      }
    });
  }
  return warnings;
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) =>
    issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message
  );
}

function sourceVersionEvidence(content: string): number | undefined {
  const match = /^\s*version\s*:\s*(-?\d+)\s*(?:#.*)?$/m.exec(content);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : undefined;
}

/** Parse and validate an `inventory.yaml` manifest. Returns a result, never throws. */
export function parseInventoryManifest(content: string): InventoryManifestParseResult {
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const declaredVersion = sourceVersionEvidence(content);
    return {
      ok: false,
      errors: [`YAML parse error: ${message}`],
      ...(declaredVersion !== undefined ? { declaredVersion } : {}),
    };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['manifest must be a YAML mapping'] };
  }

  const record = raw as Record<string, unknown>;
  const declaredVersion =
    typeof record.version === 'number' && Number.isSafeInteger(record.version)
      ? record.version
      : undefined;

  if (record.version === 1) {
    const parsed = legacyManifestSchema.safeParse(record);
    if (!parsed.success) {
      return { ok: false, errors: formatIssues(parsed.error), declaredVersion: 1 };
    }
    return {
      ok: true,
      manifest: parsed.data as SharedInventoryManifestV1,
      warnings: collectLegacyUnknownKeyWarnings(record),
    };
  }

  if (record.version === 2) {
    const parsed = manifestV2InputSchema.safeParse(record);
    if (!parsed.success) {
      return { ok: false, errors: formatIssues(parsed.error), declaredVersion: 2 };
    }
    return { ok: true, manifest: parsed.data, warnings: [] };
  }

  const versionMessage =
    declaredVersion === undefined
      ? 'version: expected 1 or 2'
      : `version: ${declaredVersion} is not supported`;
  return {
    ok: false,
    errors: [versionMessage],
    ...(declaredVersion !== undefined ? { declaredVersion } : {}),
  };
}
