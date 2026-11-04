/**
 * Inventory item field rules (ADR-0022): the frozen v1 declared-field checks,
 * the configured (v2) field checks, and the Other-data key rules. Pure — the
 * inventory service calls them before it writes a room, and maps an
 * `InventoryRuleError` back to the 400 `ApiError` with the same code.
 */
import { InventoryRuleError } from './errors.js';
import {
  INVENTORY_FIELD_ID_MAX_LENGTH,
  INVENTORY_FIELD_ID_PATTERN,
  INVENTORY_RESERVED_FIELD_IDS,
} from './paths.js';

import type {
  SharedInventoryFieldV2,
  SharedInventoryManifestV1,
  SharedInventoryScalar,
} from './types.js';

/** The v1 core fields a v2 (configured) manifest does not accept. */
const LEGACY_CORE_FIELDS = [
  'description',
  'value',
  'quantity',
  'serial',
  'acquired',
  'container',
  'tags',
] as const;

/** Any item input that may carry the v1 core fields (add or update). */
export type LegacyCoreFieldInput = Partial<Record<(typeof LEGACY_CORE_FIELDS)[number], unknown>>;

/** Frozen v1 declared-field validation. */
export function validateLegacyDeclaredField(
  manifest: SharedInventoryManifestV1,
  key: string,
  value: SharedInventoryScalar
): void {
  const field = manifest.fields.find((candidate) => candidate.id === key);
  if (!field) {
    throw new InventoryRuleError(
      'INVENTORY_UNKNOWN_FIELD',
      `'${key}' is not a field declared in inventory.yaml`
    );
  }
  if (field.type === 'number' && typeof value !== 'number') {
    throw new InventoryRuleError('INVENTORY_FIELD_TYPE', `'${key}' must be a number`);
  }
  if (field.type !== 'number' && typeof value !== 'string') {
    throw new InventoryRuleError('INVENTORY_FIELD_TYPE', `'${key}' must be text`);
  }
}

/** Configured (v2) field validation; returns the declared field. */
export function validateConfiguredField(
  fields: readonly SharedInventoryFieldV2[],
  key: string,
  value: SharedInventoryScalar
): SharedInventoryFieldV2 {
  const field = fields.find((candidate) => candidate.id === key);
  if (!field) {
    throw new InventoryRuleError(
      'INVENTORY_UNKNOWN_FIELD',
      `'${key}' is not a field declared in inventory.yaml`
    );
  }
  if (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new InventoryRuleError('INVENTORY_FIELD_TYPE', `'${key}' must be a finite number`);
  }
  if (field.type === 'text' && typeof value !== 'string') {
    throw new InventoryRuleError('INVENTORY_FIELD_TYPE', `'${key}' must be text`);
  }
  if (field.required && field.type === 'text' && typeof value === 'string' && value.trim() === '') {
    throw new InventoryRuleError('INVENTORY_REQUIRED_FIELD', `'${key}' must not be blank`);
  }
  return field;
}

/** A v2 manifest refuses the v1 core fields outright. */
export function rejectConfiguredLegacyInput(input: LegacyCoreFieldInput): void {
  for (const key of LEGACY_CORE_FIELDS) {
    if (input[key] !== undefined) {
      throw new InventoryRuleError(
        'INVENTORY_LEGACY_FIELD',
        `'${key}' is a legacy field and is not accepted by inventory.yaml version 2`
      );
    }
  }
}

/** An Other-data key must be a safe field id that no configured field claims. */
export function validateExtraKey(fields: readonly SharedInventoryFieldV2[], key: string): void {
  if (
    key.length > INVENTORY_FIELD_ID_MAX_LENGTH ||
    !INVENTORY_FIELD_ID_PATTERN.test(key) ||
    INVENTORY_RESERVED_FIELD_IDS.has(key)
  ) {
    throw new InventoryRuleError('INVENTORY_EXTRA_KEY', `'${key}' is not a safe Other data key`);
  }
  if (fields.some((field) => field.id === key)) {
    throw new InventoryRuleError(
      'INVENTORY_EXTRA_COLLISION',
      `'${key}' is a configured field, not Other data`
    );
  }
}
