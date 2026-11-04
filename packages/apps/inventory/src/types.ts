/**
 * Inventory View shared types (ADR-0022). All YAML parsing happens
 * server-side; the client only receives these resolved shapes.
 */

/** A scalar value an item key may carry (YAML core-schema scalars). */
export type SharedInventoryScalar = string | number | boolean;

/** One v1 manifest-declared extension field. */
export interface SharedInventoryFieldDef {
  id: string;
  label: string;
  /** Display/validation hint; `text` when omitted in v1 YAML. */
  type: 'text' | 'number' | 'date';
}

/** The frozen legacy `inventory.yaml` contract. */
export interface SharedInventoryManifestV1 {
  version: 1;
  label?: string;
  currency: string;
  fields: SharedInventoryFieldDef[];
  containers: string[];
}

/** The one presentation format supported by configured inventory fields. */
export interface SharedInventoryCurrencyFormatV2 {
  kind: 'currency';
  currency: string;
  decimalPlaces: number;
}

/** A normalized v2 field. All policy defaults have already been applied. */
export interface SharedInventoryFieldV2 {
  id: string;
  label: string;
  type: 'text' | 'number';
  required: boolean;
  visibility: {
    table: boolean;
    add: boolean;
    edit: boolean;
  };
  export: boolean;
  format?: SharedInventoryCurrencyFormatV2;
}

/** The config-driven `inventory.yaml` contract. */
export interface SharedInventoryManifestV2 {
  version: 2;
  label?: string;
  fields: SharedInventoryFieldV2[];
  total?: {
    field: string;
    multiplyBy?: string;
  };
}

export type SharedInventoryManifest = SharedInventoryManifestV1 | SharedInventoryManifestV2;

/**
 * The single schema decision every inventory consumer branches on. Invalid
 * and future manifests deliberately carry no inferred field vocabulary.
 */
export type SharedInventorySchema =
  | { mode: 'legacy'; manifest: SharedInventoryManifestV1 }
  | { mode: 'configured'; manifest: SharedInventoryManifestV2 }
  | { mode: 'invalid'; declaredVersion?: number; errors: string[] };

export type SharedInventoryFieldIssueKind = 'missing-required' | 'type-mismatch' | 'structured';

export interface SharedInventoryFieldIssue {
  kind: SharedInventoryFieldIssueKind;
  message: string;
  expected: 'text' | 'number';
  actual?: string;
}

/**
 * A configured value without coercion. `missing` keeps optional absence
 * distinct from a missing required value; an invalid scalar retains its raw
 * value; a structured value is never represented as an empty input.
 */
export type SharedInventoryResolvedValue =
  | { state: 'missing'; issue?: SharedInventoryFieldIssue }
  | { state: 'valid'; value: string | number }
  | { state: 'invalid'; value: SharedInventoryScalar; issue: SharedInventoryFieldIssue }
  | { state: 'structured'; issue: SharedInventoryFieldIssue };

/**
 * An undeclared item key. Scalars and scalar lists retain their values;
 * unsupported YAML remains visible through a read-only summary.
 */
export interface SharedInventoryExtraField {
  key: string;
  value?: SharedInventoryScalar | SharedInventoryScalar[];
  /** True when the value cannot be faithfully edited by the modal. */
  opaque?: boolean;
  /** User-facing description for an opaque value (`Mapping`, `Null value`, …). */
  summary?: string;
  /** Why this key is visible but cannot be edited in the app. */
  readOnlyReason?: string;
}

/** One inventory item, parsed from a zone file's `items:` sequence. */
export interface SharedInventoryItem {
  /** Space-globally unique id (required in the file). */
  id: string;
  title: string;

  // Frozen v1 vocabulary. Configured consumers never read these properties.
  description?: string;
  value?: number;
  quantity: number;
  serial?: string;
  acquired?: string;
  container?: string;
  tags?: string[];
  photos?: string[];
  fieldValues: Record<string, SharedInventoryScalar>;

  /** Every v2 declared field, including missing/invalid/structured states. */
  resolvedFieldValues?: Record<string, SharedInventoryResolvedValue>;
  /** Undeclared keys, surfaced in source order. */
  extraFields: SharedInventoryExtraField[];
  /** Non-fatal item problems retained for compact legacy UI affordances. */
  warnings?: string[];
  /** Why this item's source span cannot be edited by the line writer. */
  readOnly?: string;
}

/** An item demoted out of the table: unusable as data, but not silent. */
export interface SharedInventoryAttentionItem {
  id?: string;
  title?: string;
  reason: string;
}

export interface SharedInventoryConfiguredTotal {
  fieldId: string;
  label: string;
  value: number;
  format?: SharedInventoryCurrencyFormatV2;
}

/** Legacy aggregate shape retained byte-for-byte for v1 clients/exports. */
export interface SharedInventoryLegacyAggregate {
  itemCount: number;
  value: number;
  unvaluedCount: number;
}

/** Configured/invalid aggregate shape: count plus at most one explicit total. */
export interface SharedInventoryConfiguredAggregate {
  itemCount: number;
  total?: SharedInventoryConfiguredTotal;
}

export type SharedInventoryTotals =
  SharedInventoryLegacyAggregate | SharedInventoryConfiguredAggregate;

/** One zone, fully resolved for the zone view. */
export interface SharedInventoryRoom {
  /** Filename without extension; the URL segment. */
  slug: string;
  /** `label:` from the file, else the slug. */
  label: string;
  /** Repo-relative `rooms/*.yaml` path (the storage name stays legacy). */
  path: string;
  items: SharedInventoryItem[];
  totals: SharedInventoryTotals;
  /** Legacy aliases, emitted only in legacy mode. */
  subtotal?: number;
  unvaluedCount?: number;
  needsAttention: SharedInventoryAttentionItem[];
  parseError?: string;
  writable: boolean;
  readOnlyReason?: string;
  goodId?: number;
  goodPublicId?: string;
  warnings?: string[];
}

/** One zone row on the inventory overview (no item payload). */
export interface SharedInventoryRoomSummary {
  slug: string;
  label: string;
  path: string;
  itemCount: number;
  totals: SharedInventoryTotals;
  /** Legacy aliases, emitted only in legacy mode. */
  subtotal?: number;
  unvaluedCount?: number;
  needsAttentionCount: number;
  parseError?: string;
}

/** An inventory file with un-checked-in local changes. */
export interface SharedInventoryDirtyFile {
  goodId: number;
  path: string;
  kind: 'manifest' | 'room';
  newFile?: true;
}

/** Everything the inventory overview renders. */
export interface SharedInventorySpace {
  manifestPath: string;
  spacePath: string;
  label?: string;
  schema: SharedInventorySchema;
  /** Legacy aliases, present only for the v1 compatibility branch. */
  currency?: string;
  fields?: SharedInventoryFieldDef[];
  containers?: string[];
  rooms: SharedInventoryRoomSummary[];
  totals: SharedInventoryTotals;
  enabled: boolean;
  dirty: SharedInventoryDirtyFile[];
  warnings: string[];
  /** Legacy recovery errors; configured/invalid consumers use `schema.errors`. */
  manifestErrors?: string[];
  /** Direct editor destination when the manifest is already linked. */
  manifestGoodPublicId?: string;
}

/** Everything one zone view renders. */
export interface SharedInventoryRoomState {
  manifestPath: string;
  spacePath: string;
  spaceLabel?: string;
  schema: SharedInventorySchema;
  /** Legacy aliases, present only for the v1 compatibility branch. */
  currency?: string;
  fields?: SharedInventoryFieldDef[];
  containers?: string[];
  room: SharedInventoryRoom;
  enabled: boolean;
  dirty: SharedInventoryDirtyFile[];
  warnings: string[];
  manifestGoodPublicId?: string;
}

/** Inventory presence composed onto the repo-tree endpoint. */
export interface SharedInventoryInfo {
  manifestPath: string | null;
  spacePath: string | null;
  enabled: boolean;
  instancePublicId?: string | null;
}

/**
 * One node of a synced repository tree, as detection reads it. Structural, so
 * a host's own tree type (with a required `sha`) is assignable to it.
 */
export interface TreeNode {
  path: string;
  type: 'blob' | 'tree';
  sha?: string;
  size?: number;
}
