import { isAlias, isMap, isScalar as isYamlScalar, isSeq, parseDocument } from 'yaml';

import type {
  SharedInventoryAttentionItem,
  SharedInventoryExtraField,
  SharedInventoryFieldV2,
  SharedInventoryItem,
  SharedInventoryResolvedValue,
  SharedInventoryScalar,
  SharedInventorySchema,
} from './types.js';

/** Core v1 item keys, in canonical write/display order. */
export const ITEM_CORE_KEYS = [
  'id',
  'title',
  'description',
  'value',
  'quantity',
  'serial',
  'acquired',
  'container',
  'tags',
  'photos',
] as const;

const LEGACY_CORE_KEY_SET: ReadonlySet<string> = new Set(ITEM_CORE_KEYS);
const STRUCTURAL_KEY_SET: ReadonlySet<string> = new Set(['id', 'title']);
const KNOWN_ZONE_KEYS = new Set(['label', 'items']);

export type ZoneParseResult =
  | {
      ok: true;
      label?: string;
      items: SharedInventoryItem[];
      attention: SharedInventoryAttentionItem[];
      warnings: string[];
    }
  | { ok: false; error: string };

function isScalar(value: unknown): value is SharedInventoryScalar {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

/** V1 historically treated every JavaScript number scalar as displayable. */
function isLegacyScalar(value: unknown): value is SharedInventoryScalar {
  return typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number';
}

function isScalarList(value: unknown): value is SharedInventoryScalar[] {
  return Array.isArray(value) && value.every(isScalar);
}

function isLegacyScalarList(value: unknown): value is SharedInventoryScalar[] {
  return Array.isArray(value) && value.every(isLegacyScalar);
}

function scalarToString(value: SharedInventoryScalar): string {
  return typeof value === 'string' ? value : String(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function attentionRef(
  raw: Record<string, unknown>,
  scalar: (value: unknown) => value is SharedInventoryScalar = isScalar
): { id?: string; title?: string } {
  const usable = (value: unknown): string | null =>
    scalar(value) && scalarToString(value).trim() !== '' ? scalarToString(value) : null;
  const id = usable(raw.id);
  const title = usable(raw.title);
  return { ...(id !== null ? { id } : {}), ...(title !== null ? { title } : {}) };
}

function describeValue(value: unknown, alias = false): string {
  if (alias) return 'Alias';
  if (value === null) return 'Null value';
  if (Array.isArray(value)) return 'Nested sequence';
  if (isPlainObject(value)) return 'Mapping';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'Non-finite number';
  return 'Structured value';
}

function opaqueExtra(key: string, value: unknown, alias = false): SharedInventoryExtraField {
  const summary = describeValue(value, alias);
  return {
    key,
    opaque: true,
    summary,
    readOnlyReason: `${summary} can only be edited in YAML`,
  };
}

function extraFromValue(key: string, value: unknown, alias = false): SharedInventoryExtraField {
  if (alias) return opaqueExtra(key, value, true);
  if (isScalar(value)) return { key, value };
  if (isScalarList(value)) return { key, value };
  return opaqueExtra(key, value);
}

function baseIdentity(
  raw: unknown,
  index: number,
  scalar: (value: unknown) => value is SharedInventoryScalar = isScalar
):
  | { raw: Record<string, unknown>; id: string; title: string }
  | { attention: SharedInventoryAttentionItem } {
  if (!isPlainObject(raw)) {
    return { attention: { reason: `item ${index + 1} is not a mapping` } };
  }
  const ref = attentionRef(raw, scalar);
  const demote = (reason: string): { attention: SharedInventoryAttentionItem } => ({
    attention: { ...ref, reason },
  });
  if (!scalar(raw.id) || scalarToString(raw.id).trim() === '') {
    return demote(`item ${index + 1} has no usable 'id'`);
  }
  if (!scalar(raw.title) || scalarToString(raw.title).trim() === '') {
    return demote(`item '${scalarToString(raw.id)}' has no usable 'title'`);
  }
  return { raw, id: scalarToString(raw.id), title: scalarToString(raw.title) };
}

function parseLegacyItem(
  rawValue: unknown,
  index: number,
  declaredFieldIds: ReadonlySet<string>
): { item: SharedInventoryItem } | { attention: SharedInventoryAttentionItem } {
  const identity = baseIdentity(rawValue, index, isLegacyScalar);
  if ('attention' in identity) return identity;
  const { raw, id, title } = identity;
  const demote = (reason: string): { attention: SharedInventoryAttentionItem } => ({
    attention: { ...attentionRef(raw, isLegacyScalar), reason },
  });

  if (raw.value !== undefined && (typeof raw.value !== 'number' || !Number.isFinite(raw.value))) {
    return demote(`item '${id}': 'value' must be a number`);
  }
  if (
    raw.quantity !== undefined &&
    (typeof raw.quantity !== 'number' || !Number.isInteger(raw.quantity) || raw.quantity < 1)
  ) {
    return demote(`item '${id}': 'quantity' must be a positive integer`);
  }

  const coreText: Partial<Record<'description' | 'serial' | 'acquired' | 'container', string>> = {};
  for (const key of ['description', 'serial', 'acquired', 'container'] as const) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    if (!isLegacyScalar(value)) return demote(`item '${id}': '${key}' must be a scalar`);
    coreText[key] = scalarToString(value);
  }
  const lists: Partial<Record<'tags' | 'photos', string[]>> = {};
  for (const key of ['tags', 'photos'] as const) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    if (!isLegacyScalarList(value)) {
      return demote(`item '${id}': '${key}' must be a list of scalars`);
    }
    lists[key] = value.map(scalarToString);
  }

  const warnings: string[] = [];
  const fieldValues: Record<string, SharedInventoryScalar> = {};
  const extraFields: SharedInventoryExtraField[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (LEGACY_CORE_KEY_SET.has(key) || value === undefined || value === null) continue;
    if (declaredFieldIds.has(key)) {
      if (isLegacyScalar(value)) {
        fieldValues[key] = value;
      } else {
        extraFields.push({ key, opaque: true });
        warnings.push(`declared field '${key}' has a non-scalar value`);
      }
    } else {
      extraFields.push(
        isLegacyScalar(value)
          ? { key, value }
          : isLegacyScalarList(value)
            ? { key, value }
            : { key, opaque: true }
      );
    }
  }

  return {
    item: {
      id,
      title,
      ...coreText,
      ...(typeof raw.value === 'number' ? { value: raw.value } : {}),
      quantity: typeof raw.quantity === 'number' ? raw.quantity : 1,
      ...lists,
      fieldValues,
      extraFields,
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  };
}

function actualType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'sequence';
  if (isPlainObject(value)) return 'mapping';
  if (typeof value === 'string') return 'text';
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'non-finite number';
  return typeof value;
}

function resolveConfiguredValue(
  raw: Record<string, unknown>,
  field: SharedInventoryFieldV2,
  aliased: boolean
): SharedInventoryResolvedValue {
  if (!Object.hasOwn(raw, field.id)) {
    return field.required
      ? {
          state: 'missing',
          issue: {
            kind: 'missing-required',
            expected: field.type,
            message: `${field.label} is required`,
          },
        }
      : { state: 'missing' };
  }

  const value = raw[field.id];
  if (aliased) {
    return {
      state: 'structured',
      issue: {
        kind: 'structured',
        expected: field.type,
        actual: 'alias',
        message: `expected ${field.type}, found alias`,
      },
    };
  }
  const valid =
    (field.type === 'text' &&
      typeof value === 'string' &&
      (!field.required || value.trim() !== '')) ||
    (field.type === 'number' && typeof value === 'number' && Number.isFinite(value));
  if (valid) return { state: 'valid', value: value as string | number };

  if (field.required && field.type === 'text' && typeof value === 'string' && value.trim() === '') {
    return {
      state: 'invalid',
      value,
      issue: {
        kind: 'missing-required',
        expected: 'text',
        actual: 'blank text',
        message: `${field.label} is required and must not be blank`,
      },
    };
  }

  const actual = actualType(value);
  const issue = {
    kind: isScalar(value) ? ('type-mismatch' as const) : ('structured' as const),
    expected: field.type,
    actual,
    message: `expected ${field.type}, found ${actual}`,
  };
  return isScalar(value)
    ? { state: 'invalid', value, issue }
    : { state: 'structured', issue: { ...issue, kind: 'structured' } };
}

function parseConfiguredItem(
  rawValue: unknown,
  index: number,
  fields: readonly SharedInventoryFieldV2[],
  aliasKeys: ReadonlySet<string>
): { item: SharedInventoryItem } | { attention: SharedInventoryAttentionItem } {
  const identity = baseIdentity(rawValue, index);
  if ('attention' in identity) return identity;
  const { raw, id, title } = identity;
  const declaredIds = new Set(fields.map((field) => field.id));
  const resolvedFieldValues: Record<string, SharedInventoryResolvedValue> = {};
  const fieldValues: Record<string, SharedInventoryScalar> = {};
  const warnings: string[] = [];
  for (const field of fields) {
    const resolved = resolveConfiguredValue(raw, field, aliasKeys.has(field.id));
    resolvedFieldValues[field.id] = resolved;
    if (resolved.state === 'valid') fieldValues[field.id] = resolved.value;
    if ('issue' in resolved && resolved.issue !== undefined) {
      warnings.push(`${field.label}: ${resolved.issue.message}`);
    }
  }

  const extraFields: SharedInventoryExtraField[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (STRUCTURAL_KEY_SET.has(key) || declaredIds.has(key)) continue;
    extraFields.push(extraFromValue(key, value, aliasKeys.has(key)));
  }

  return {
    item: {
      id,
      title,
      quantity: 1,
      fieldValues,
      resolvedFieldValues,
      extraFields,
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  };
}

function parseNeutralItem(
  rawValue: unknown,
  index: number,
  aliasKeys: ReadonlySet<string>
): { item: SharedInventoryItem } | { attention: SharedInventoryAttentionItem } {
  const identity = baseIdentity(rawValue, index);
  if ('attention' in identity) return identity;
  const { raw, id, title } = identity;
  const extraFields = Object.entries(raw)
    .filter(([key]) => !STRUCTURAL_KEY_SET.has(key))
    .map(([key, value]) => extraFromValue(key, value, aliasKeys.has(key)));
  return {
    item: { id, title, quantity: 1, fieldValues: {}, resolvedFieldValues: {}, extraFields },
  };
}

type ZoneSchemaInput = SharedInventorySchema | ReadonlySet<string>;

function isResolvedSchema(input: ZoneSchemaInput): input is SharedInventorySchema {
  return !('has' in input);
}

function containsAlias(node: unknown): boolean {
  if (isAlias(node)) return true;
  if (isSeq(node)) return node.items.some(containsAlias);
  if (isMap(node)) {
    return node.items.some((pair) => containsAlias(pair.key) || containsAlias(pair.value));
  }
  return false;
}

function configuredAliasKeys(
  document: ReturnType<typeof parseDocument>
): ReadonlyArray<ReadonlySet<string>> {
  const itemsNode = document.get('items', true);
  if (!isSeq(itemsNode)) return [];
  return itemsNode.items.map((entry) => {
    const keys = new Set<string>();
    if (!isMap(entry)) return keys;
    for (const pair of entry.items) {
      const key = isYamlScalar(pair.key) ? String(pair.key.value) : String(pair.key);
      if (containsAlias(pair.value)) keys.add(key);
    }
    return keys;
  });
}

/**
 * Parse one zone file. The Set overload is retained for frozen v1 unit
 * tests and callers; production passes the resolved schema.
 */
export function parseZoneFile(
  content: string,
  schemaOrDeclaredIds: ZoneSchemaInput = new Set()
): ZoneParseResult {
  let document: ReturnType<typeof parseDocument>;
  let raw: unknown;
  try {
    document = parseDocument(content);
    if (document.errors.length > 0) throw document.errors[0];
    raw = document.toJS();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `YAML parse error: ${message}` };
  }
  if (raw === null || raw === undefined) {
    return { ok: true, items: [], attention: [], warnings: [] };
  }
  if (!isPlainObject(raw)) return { ok: false, error: 'zone file must be a YAML mapping' };

  const warnings: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!KNOWN_ZONE_KEYS.has(key)) warnings.push(`unknown key '${key}' is ignored`);
  }

  let label: string | undefined;
  if (raw.label !== undefined && raw.label !== null) {
    if (isScalar(raw.label) && scalarToString(raw.label).trim() !== '') {
      label = scalarToString(raw.label);
    } else {
      warnings.push(`'label' is not a usable scalar and was ignored`);
    }
  }

  if (raw.items === undefined || raw.items === null) {
    return {
      ok: true,
      ...(label !== undefined ? { label } : {}),
      items: [],
      attention: [],
      warnings,
    };
  }
  if (!Array.isArray(raw.items)) return { ok: false, error: `'items' must be a sequence` };

  const items: SharedInventoryItem[] = [];
  const attention: SharedInventoryAttentionItem[] = [];
  const aliasKeys = isResolvedSchema(schemaOrDeclaredIds) ? configuredAliasKeys(document) : [];
  raw.items.forEach((entry, index) => {
    const parsed = isResolvedSchema(schemaOrDeclaredIds)
      ? schemaOrDeclaredIds.mode === 'configured'
        ? parseConfiguredItem(
            entry,
            index,
            schemaOrDeclaredIds.manifest.fields,
            aliasKeys[index] ?? new Set()
          )
        : schemaOrDeclaredIds.mode === 'invalid'
          ? parseNeutralItem(entry, index, aliasKeys[index] ?? new Set())
          : parseLegacyItem(
              entry,
              index,
              new Set(schemaOrDeclaredIds.manifest.fields.map((field) => field.id))
            )
      : parseLegacyItem(entry, index, schemaOrDeclaredIds);
    if ('item' in parsed) items.push(parsed.item);
    else attention.push(parsed.attention);
  });

  return { ok: true, ...(label !== undefined ? { label } : {}), items, attention, warnings };
}
