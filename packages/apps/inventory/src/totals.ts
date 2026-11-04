/**
 * Inventory totals and space-global id handling (ADR-0022): per-room and
 * overview totals for legacy and configured manifests, and demotion of
 * duplicate ids to needs-attention. Pure — the inventory service applies them
 * to the rooms it loads.
 */
import type {
  SharedInventoryItem,
  SharedInventoryRoom,
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

export function applyRoomTotals(room: SharedInventoryRoom, schema: SharedInventorySchema): void {
  room.totals = aggregateItems(schema, room.items);
  if (schema.mode === 'legacy' && 'value' in room.totals) {
    room.subtotal = room.totals.value;
    room.unvaluedCount = room.totals.unvaluedCount;
  } else {
    delete room.subtotal;
    delete room.unvaluedCount;
  }
}

/**
 * Space-global id uniqueness (ADR-0022): every item whose id collides —
 * within a room or across rooms — is demoted to needs-attention in its own
 * room, so the table never renders two rows claiming one identity.
 */
export function demoteDuplicateIds(rooms: SharedInventoryRoom[]): void {
  const roomsById = new Map<string, string[]>();
  for (const room of rooms) {
    for (const item of room.items) {
      roomsById.set(item.id, [...(roomsById.get(item.id) ?? []), room.slug]);
    }
  }
  for (const room of rooms) {
    const keep: SharedInventoryItem[] = [];
    for (const item of room.items) {
      const holders = roomsById.get(item.id) ?? [];
      if (holders.length <= 1) {
        keep.push(item);
        continue;
      }
      const elsewhere = holders.filter((slug) => slug !== room.slug);
      const where =
        elsewhere.length > 0 ? `also in ${[...new Set(elsewhere)].join(', ')}` : 'in this room';
      room.needsAttention.push({
        id: item.id,
        title: item.title,
        reason: `duplicate id '${item.id}' (${where})`,
      });
    }
    room.items = keep;
  }
}
