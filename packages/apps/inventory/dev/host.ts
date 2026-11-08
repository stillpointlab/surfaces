// An in-memory host for the harness: answers the inventory elements' ops
// against the state they show, so adding, saving and deleting render without a
// server. It writes no files and keeps no drafts; it only gives the elements an
// answer of the shape a real host gives, or refuses on request.
import { answerOps, fail, ok } from '@stillpointlab/common-format/app';

import { slugifyInventoryName } from '../src/paths.js';
import { aggregateItems } from '../src/totals.js';

import type { InventoryOps } from '../src/element/index.js';
import type {
  SharedInventoryItem,
  SharedInventoryResolvedValue,
  SharedInventoryRoomState,
  SharedInventoryScalar,
  SharedInventorySpace,
} from '../src/types.js';
import type { AppOp, Result } from '@stillpointlab/common-format/app';

export interface HarnessHost {
  /** The state the host answers from: set with each fixture. */
  setState(state: SharedInventorySpace | SharedInventoryRoomState | null): void;
  /** Answer ops (true) or leave them unclaimed (false). */
  setAnswering(on: boolean): void;
  /** Refuse the next op once, with this code. */
  failNext(code: string): void;
}

type Values = Record<string, SharedInventoryScalar | null>;

/** A configured field's value as the core resolves it (configured fields are text or number). */
const resolved = (value: SharedInventoryScalar | undefined): SharedInventoryResolvedValue =>
  value === undefined || typeof value === 'boolean'
    ? { state: 'missing' }
    : { state: 'valid', value };

function markDirty<S extends SharedInventorySpace | SharedInventoryRoomState>(
  state: S,
  path: string,
  newFile = false
): void {
  if (state.dirty.some((file) => file.path === path)) return;
  state.dirty.push({
    goodId: state.dirty.length + 1,
    path,
    kind: 'room',
    ...(newFile ? { newFile: true } : {}),
  });
}

/** Apply an edit the way the server would, closely enough for the harness. */
function edited(item: SharedInventoryItem, changes: Record<string, unknown>): SharedInventoryItem {
  const next: SharedInventoryItem = structuredClone(item);
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'fieldValues' || key === 'extraValues') continue;
    if (value === null) delete (next as unknown as Record<string, unknown>)[key];
    else (next as unknown as Record<string, unknown>)[key] = value;
  }
  for (const [id, value] of Object.entries((changes.fieldValues ?? {}) as Values)) {
    if (value === null) {
      delete next.fieldValues[id];
      if (next.resolvedFieldValues) next.resolvedFieldValues[id] = { state: 'missing' };
    } else {
      next.fieldValues[id] = value;
      if (next.resolvedFieldValues) next.resolvedFieldValues[id] = resolved(value);
    }
  }
  for (const [key, value] of Object.entries((changes.extraValues ?? {}) as Values)) {
    const at = next.extraFields.findIndex((extra) => extra.key === key);
    if (value === null) {
      if (at >= 0) next.extraFields.splice(at, 1);
    } else if (at >= 0) next.extraFields[at] = { key, value };
    else next.extraFields.push({ key, value });
  }
  return next;
}

export function attachHost(elements: readonly HTMLElement[]): HarnessHost {
  let state: SharedInventorySpace | SharedInventoryRoomState | null = null;
  let stops: (() => void)[] = [];
  let failCode: string | null = null;

  const zoneState = (): SharedInventoryRoomState | null =>
    state && 'room' in state ? state : null;

  const settleZone = (zone: SharedInventoryRoomState, items: SharedInventoryItem[]): Result => {
    zone.room.items = items;
    zone.room.totals = aggregateItems(zone.schema, items);
    markDirty(zone, zone.room.path);
    return ok({ state: structuredClone(zone) });
  };

  const answer = (op: AppOp<InventoryOps>): Result<object> => {
    if (failCode !== null) {
      const code = failCode;
      failCode = null;
      return fail(code, `The harness refused this op (${code})`);
    }
    switch (op.type) {
      case 'add-zone': {
        if (!state || !('rooms' in state)) return fail('NOT_FOUND', 'No overview');
        const slug = slugifyInventoryName(op.title);
        const path = `${state.spacePath ? `${state.spacePath}/` : ''}rooms/${slug}.yaml`;
        if (state.rooms.some((zone) => zone.path === path)) {
          return fail('INVENTORY_ROOM_EXISTS', `“${slug}.yaml” already exists here`);
        }
        state.rooms.push({
          slug,
          label: op.title,
          path,
          itemCount: 0,
          totals: aggregateItems(state.schema, []),
          needsAttentionCount: 0,
        });
        markDirty(state, path, true);
        return ok({ space: structuredClone(state) });
      }
      case 'add-item': {
        const zone = zoneState();
        if (!zone) return fail('NOT_FOUND', 'No zone');
        const title = String(op.item.title);
        const fieldValues = (op.item.fieldValues ?? {}) as Record<string, SharedInventoryScalar>;
        const item: SharedInventoryItem = {
          ...(op.item as Partial<SharedInventoryItem>),
          id: `${slugifyInventoryName(title)}-${zone.room.items.length + 1}`,
          title,
          quantity: typeof op.item.quantity === 'number' ? op.item.quantity : 1,
          fieldValues,
          ...(zone.schema.mode === 'configured'
            ? {
                resolvedFieldValues: Object.fromEntries(
                  zone.schema.manifest.fields.map((field) => [
                    field.id,
                    resolved(fieldValues[field.id]),
                  ])
                ),
              }
            : {}),
          extraFields: [],
        };
        return settleZone(zone, [...zone.room.items, item]);
      }
      case 'update-item': {
        const zone = zoneState();
        const item = zone?.room.items.find((candidate) => candidate.id === op.id);
        if (!zone || !item) return fail('INVENTORY_ITEM_NOT_FOUND', `No item ${op.id}`);
        return settleZone(
          zone,
          zone.room.items.map((candidate) =>
            candidate === item ? edited(item, op.changes) : candidate
          )
        );
      }
      case 'delete-item': {
        const zone = zoneState();
        if (!zone?.room.items.some((candidate) => candidate.id === op.id)) {
          return fail('INVENTORY_ITEM_NOT_FOUND', `No item ${op.id}`);
        }
        return settleZone(
          zone,
          zone.room.items.filter((candidate) => candidate.id !== op.id)
        );
      }
      case 'link-editor':
        return ok({ href: `#editor:${op.path}` });
    }
  };

  const setAnswering = (on: boolean): void => {
    for (const stop of stops) stop();
    stops = on ? elements.map((el) => answerOps<InventoryOps>(el, answer)) : [];
  };
  setAnswering(true);
  return {
    setState: (next) => (state = structuredClone(next)),
    setAnswering,
    failNext: (code) => (failCode = code),
  };
}
