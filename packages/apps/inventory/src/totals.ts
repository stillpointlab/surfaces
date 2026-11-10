/**
 * Inventory totals and space-global id handling (ADR-0022): per-zone and
 * overview totals for legacy and configured manifests, and demotion of
 * duplicate ids to needs-attention. Pure — the inventory service applies them
 * to the zones it loads.
 */
import type {
  SharedInventoryItem,
  SharedInventoryZone,
  SharedInventorySchema,
  SharedInventoryTotals,
} from './types.js';

function configuredNumber(item: SharedInventoryItem, fieldId: string): number | undefined {
  const resolved = item.resolvedFieldValues?.[fieldId];
  return resolved?.state === 'valid' && typeof resolved.value === 'number'
    ? resolved.value
    : undefined;
}

export function aggregateItems(
  schema: SharedInventorySchema,
  items: readonly SharedInventoryItem[]
): SharedInventoryTotals {
  if (schema.mode === 'legacy') {
    let value = 0;
    let unvaluedCount = 0;
    for (const item of items) {
      if (item.value === undefined) unvaluedCount += 1;
      else value += item.value * item.quantity;
    }
    return { itemCount: items.length, value, unvaluedCount };
  }

  if (schema.mode === 'invalid' || schema.manifest.total === undefined) {
    return { itemCount: items.length };
  }

  const totalDefinition = schema.manifest.total;
  const amountField = schema.manifest.fields.find((field) => field.id === totalDefinition.field)!;
  let value = 0;
  for (const item of items) {
    const amount = configuredNumber(item, totalDefinition.field) ?? 0;
    const multiplier = totalDefinition.multiplyBy
      ? (configuredNumber(item, totalDefinition.multiplyBy) ?? 1)
      : 1;
    value += amount * multiplier;
  }
  return {
    itemCount: items.length,
    total: {
      fieldId: amountField.id,
      label: amountField.label,
      value,
      ...(amountField.format !== undefined ? { format: amountField.format } : {}),
    },
  };
}

export function emptyTotals(schema: SharedInventorySchema): SharedInventoryTotals {
  return aggregateItems(schema, []);
}

export function applyZoneTotals(zone: SharedInventoryZone, schema: SharedInventorySchema): void {
  zone.totals = aggregateItems(schema, zone.items);
  if (schema.mode === 'legacy' && 'value' in zone.totals) {
    zone.subtotal = zone.totals.value;
    zone.unvaluedCount = zone.totals.unvaluedCount;
  } else {
    delete zone.subtotal;
    delete zone.unvaluedCount;
  }
}

/**
 * Space-global id uniqueness (ADR-0022): every item whose id collides —
 * within a zone or across zones — is demoted to needs-attention in its own
 * zone, so the table never renders two rows claiming one identity.
 */
export function demoteDuplicateIds(zones: SharedInventoryZone[]): void {
  const zonesById = new Map<string, string[]>();
  for (const zone of zones) {
    for (const item of zone.items) {
      zonesById.set(item.id, [...(zonesById.get(item.id) ?? []), zone.slug]);
    }
  }
  for (const zone of zones) {
    const keep: SharedInventoryItem[] = [];
    for (const item of zone.items) {
      const holders = zonesById.get(item.id) ?? [];
      if (holders.length <= 1) {
        keep.push(item);
        continue;
      }
      const elsewhere = holders.filter((slug) => slug !== zone.slug);
      const where =
        elsewhere.length > 0 ? `also in ${[...new Set(elsewhere)].join(', ')}` : 'in this zone';
      zone.needsAttention.push({
        id: item.id,
        title: item.title,
        reason: `duplicate id '${item.id}' (${where})`,
      });
    }
    zone.items = keep;
  }
}
