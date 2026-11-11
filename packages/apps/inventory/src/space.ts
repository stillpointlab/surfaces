/**
 * An inventory from a host's files (phase 7, inventory-rules): the snapshot a
 * host hands the core, the space resolved from it, and the two states the
 * elements render. Pure: the host reads the files (drafts already laid over)
 * and supplies the few facts only it knows; nothing here sees goods, users or
 * a repository.
 */
import { detectInventoryAt } from './detection.js';
import { parseInventoryManifest } from './manifest.js';
import { applyZoneTotals, aggregateItems, demoteDuplicateIds, emptyTotals } from './totals.js';
import { parseZoneFile } from './zone.js';
import { scanZoneShape } from './zoneWriter.js';

import type { InventoryDetection, InventoryZoneFile } from './detection.js';
import type {
  SharedInventoryAttentionItem,
  SharedInventoryDirtyFile,
  SharedInventoryItem,
  SharedInventoryManifestV1,
  SharedInventorySchema,
  SharedInventorySpace,
  SharedInventoryZone,
  SharedInventoryZoneState,
} from './types.js';
import type { AppSnapshot } from '@stillpointlab/common-format/app';

/**
 * What a host hands the core: the contract's `AppSnapshot` (plain data, no
 * callbacks). `detectInventoryAt` over its `paths` names the files the host
 * must read: the manifest and the zone files.
 */
export type InventorySnapshot = AppSnapshot;

/** The facts only a host knows, laid onto a projected state. */
export interface InventoryHostFacts {
  /** Whether the space is enabled where the host shows it. */
  enabled: boolean;
  /** The space's files with local changes not yet checked in. */
  dirty: readonly SharedInventoryDirtyFile[];
}

/** The space assembled from a snapshot: what both projections and the ops read. */
export interface ResolvedInventory {
  detection: InventoryDetection;
  schema: SharedInventorySchema;
  /** Version 1 recovery errors (the schema is then the recovery manifest). */
  manifestErrors: string[];
  warnings: string[];
  /** Every zone, parsed, scanned, duplicate ids demoted and totalled. */
  zones: SharedInventoryZone[];
}

const LEGACY_RECOVERY_MANIFEST: SharedInventoryManifestV1 = {
  version: 1,
  currency: 'USD',
  fields: [],
  containers: [],
};

/** A file's content, or `null` when the host could not read it. */
export function snapshotContent(snapshot: InventorySnapshot, path: string): string | null {
  return snapshot.files[path] ?? null;
}

/**
 * The manifest's schema. Positive v1 evidence keeps the historical recovery
 * branch; invalid v2, future or unknown manifests select the neutral schema
 * and never inherit the legacy vocabulary.
 */
function resolveSchema(content: string | null): {
  schema: SharedInventorySchema;
  manifestErrors: string[];
  warnings: string[];
} {
  if (content === null) {
    return {
      schema: { mode: 'invalid', errors: ['inventory.yaml content is unavailable'] },
      manifestErrors: [],
      warnings: [],
    };
  }
  const parsed = parseInventoryManifest(content);
  if (parsed.ok) {
    return {
      schema:
        parsed.manifest.version === 1
          ? { mode: 'legacy', manifest: parsed.manifest }
          : { mode: 'configured', manifest: parsed.manifest },
      manifestErrors: [],
      warnings: parsed.warnings.map((warning) => `inventory.yaml: ${warning}`),
    };
  }
  if (parsed.declaredVersion === 1) {
    return {
      schema: { mode: 'legacy', manifest: LEGACY_RECOVERY_MANIFEST },
      manifestErrors: parsed.details,
      warnings: [],
    };
  }
  return {
    schema: {
      mode: 'invalid',
      ...(parsed.declaredVersion !== undefined ? { declaredVersion: parsed.declaredVersion } : {}),
      errors: parsed.details,
    },
    manifestErrors: [],
    warnings: [],
  };
}

/** One zone from its content: parsed, scanned for writability, per-item read-only joined on. */
function resolveZone(
  zoneFile: InventoryZoneFile,
  content: string | null,
  schema: SharedInventorySchema
): SharedInventoryZone {
  const base = {
    slug: zoneFile.slug,
    label: zoneFile.slug,
    path: zoneFile.path,
    items: [] as SharedInventoryItem[],
    totals: emptyTotals(schema),
    needsAttention: [] as SharedInventoryAttentionItem[],
  };
  // The wording users see stays as it was when the names became zone.
  if (content === null) {
    return { ...base, writable: false, parseError: 'zone file content is unavailable' };
  }

  const parsed = parseZoneFile(content, schema);
  if (!parsed.ok) {
    // An unparseable zone is never writable: there is no items sequence the
    // writer could trust (spec inventory_add_item clarification).
    return { ...base, writable: false, parseError: parsed.error };
  }

  // Writability is the writer's supported-shape scan alone: a host that links
  // files on their first change offers editing either way (ADR-0023).
  const scan = scanZoneShape(content);
  const readOnlyById = new Map<string, string>();
  if (scan.writable) {
    for (const entry of scan.entries) {
      if (entry.id !== undefined && entry.readOnlyReason !== undefined) {
        readOnlyById.set(entry.id, entry.readOnlyReason);
      }
    }
  }
  const items = parsed.items.map((item) => {
    const reason = readOnlyById.get(item.id);
    return reason === undefined ? item : { ...item, readOnly: reason };
  });
  const zone: SharedInventoryZone = {
    ...base,
    ...(parsed.label !== undefined ? { label: parsed.label } : {}),
    items,
    needsAttention: parsed.attention,
    writable: scan.writable,
    ...(scan.writable ? {} : { readOnlyReason: scan.reason }),
    ...(parsed.warnings.length > 0 ? { warnings: parsed.warnings } : {}),
  };
  applyZoneTotals(zone, schema);
  return zone;
}

/**
 * The space a snapshot holds, or `null` when its manifest is not among the
 * host's paths (a dangling instance: the manifest is gone).
 */
export function resolveInventory(snapshot: InventorySnapshot): ResolvedInventory | null {
  if (!snapshot.paths.includes(snapshot.manifestPath)) return null;
  const detection = detectInventoryAt(snapshot.manifestPath, [], [...snapshot.paths]);
  // Additional manifests are other spaces (ADR-0025), not extras to warn about.
  const { schema, manifestErrors, warnings } = resolveSchema(
    snapshotContent(snapshot, detection.manifestPath)
  );
  const zones = detection.zones.map((zoneFile) =>
    resolveZone(zoneFile, snapshotContent(snapshot, zoneFile.path), schema)
  );
  demoteDuplicateIds(zones);
  for (const zone of zones) applyZoneTotals(zone, schema);
  return { detection, schema, manifestErrors, warnings, zones };
}

/** The legacy aliases a version 1 state carries beside its schema. */
function legacyAliases(schema: SharedInventorySchema): {
  currency?: string;
  fields?: SharedInventoryManifestV1['fields'];
  containers?: string[];
} {
  return schema.mode === 'legacy'
    ? {
        currency: schema.manifest.currency,
        fields: schema.manifest.fields,
        containers: schema.manifest.containers,
      }
    : {};
}

/** The overview of a resolved space, with the host's facts laid on. */
export function projectResolvedSpace(
  resolved: ResolvedInventory,
  facts: InventoryHostFacts
): SharedInventorySpace {
  const { detection, schema, manifestErrors, warnings, zones } = resolved;
  const label = schema.mode === 'invalid' ? undefined : schema.manifest.label;
  return {
    manifestPath: detection.manifestPath,
    spacePath: detection.spacePath,
    ...(label !== undefined ? { label } : {}),
    schema,
    ...legacyAliases(schema),
    zones: zones.map((zone) => ({
      slug: zone.slug,
      label: zone.label,
      path: zone.path,
      itemCount: zone.items.length,
      totals: zone.totals,
      ...(zone.subtotal !== undefined ? { subtotal: zone.subtotal } : {}),
      ...(zone.unvaluedCount !== undefined ? { unvaluedCount: zone.unvaluedCount } : {}),
      needsAttentionCount: zone.needsAttention.length,
      ...(zone.parseError !== undefined ? { parseError: zone.parseError } : {}),
    })),
    totals: aggregateItems(
      schema,
      zones.flatMap((zone) => zone.items)
    ),
    enabled: facts.enabled,
    dirty: [...facts.dirty],
    warnings,
    ...(manifestErrors.length > 0 ? { manifestErrors } : {}),
  };
}

/** One zone of a resolved space by slug, with the host's facts laid on; `null` when no zone has it. */
export function projectResolvedZone(
  resolved: ResolvedInventory,
  slug: string,
  facts: InventoryHostFacts
): SharedInventoryZoneState | null {
  const { detection, schema, warnings, zones } = resolved;
  const zone = zones.find((candidate) => candidate.slug === slug);
  if (!zone) return null;
  return {
    manifestPath: detection.manifestPath,
    spacePath: detection.spacePath,
    ...(schema.mode !== 'invalid' && schema.manifest.label !== undefined
      ? { spaceLabel: schema.manifest.label }
      : {}),
    schema,
    ...legacyAliases(schema),
    zone,
    enabled: facts.enabled,
    dirty: [...facts.dirty],
    warnings,
  };
}

/** The overview a snapshot holds, or `null` when its manifest is gone. */
export function projectInventorySpace(
  snapshot: InventorySnapshot,
  facts: InventoryHostFacts
): SharedInventorySpace | null {
  const resolved = resolveInventory(snapshot);
  return resolved && projectResolvedSpace(resolved, facts);
}

/** One zone's state by slug, or `null` when the manifest or the zone is gone. */
export function projectInventoryZone(
  snapshot: InventorySnapshot,
  slug: string,
  facts: InventoryHostFacts
): SharedInventoryZoneState | null {
  const resolved = resolveInventory(snapshot);
  return resolved && projectResolvedZone(resolved, slug, facts);
}
