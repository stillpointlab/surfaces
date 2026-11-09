// An in-memory host for the harness: it keeps an inventory's files in memory,
// answers the elements' ops with the core's rules, writes the changes back and
// re-projects. There are no drafts, check-in or repository: a changed file is
// marked dirty, as a host marks it until check-in. A hand-built state has no
// files, so its ops are refused.
import { answerOps, fail, ok } from '@stillpointlab/common-format/app';

import {
  addInventoryItem,
  addInventoryZone,
  deleteInventoryItem,
  updateInventoryItem,
} from '../src/ops.js';
import { projectResolvedSpace, projectResolvedZone, resolveInventory } from '../src/space.js';

import type { InventoryOps } from '../src/element/index.js';
import type { AddInventoryItemInput, UpdateInventoryItemInput } from '../src/ops.js';
import type { InventoryChange, InventoryHostFacts, InventorySnapshot } from '../src/space.js';
import type {
  SharedInventoryDirtyFile,
  SharedInventorySpace,
  SharedInventoryZoneState,
} from '../src/types.js';
import type { AppOp, Result } from '@stillpointlab/common-format/app';

/** One inventory's files and the facts the harness keeps about them. */
export interface Workspace {
  snapshot: { manifestPath: string; paths: string[]; files: Record<string, string | null> };
  enabled: boolean;
  dirty: SharedInventoryDirtyFile[];
}

export function workspace(snapshot: InventorySnapshot): Workspace {
  return {
    snapshot: {
      manifestPath: snapshot.manifestPath,
      paths: [...snapshot.paths],
      files: { ...snapshot.files },
    },
    enabled: true,
    dirty: [],
  };
}

const facts = (ws: Workspace): InventoryHostFacts => ({ enabled: ws.enabled, dirty: ws.dirty });

/** The workspace's overview, or `null` when its manifest is gone. */
export function spaceOf(ws: Workspace): SharedInventorySpace | null {
  const resolved = resolveInventory(ws.snapshot);
  return resolved && projectResolvedSpace(resolved, facts(ws));
}

/** One zone of the workspace, by its file's path (the first zone when none is given). */
export function zoneOf(ws: Workspace, path?: string): SharedInventoryZoneState | null {
  const resolved = resolveInventory(ws.snapshot);
  const zone = resolved?.zones.find((candidate) => candidate.path === path) ?? resolved?.zones[0];
  return resolved && zone ? projectResolvedZone(resolved, zone.slug, facts(ws)) : null;
}

/** Write an op's changes into memory, marking each file dirty. */
function write(ws: Workspace, changes: readonly InventoryChange[]): void {
  for (const change of changes) {
    ws.snapshot.files[change.path] = change.content;
    if (change.created && !ws.snapshot.paths.includes(change.path)) {
      ws.snapshot.paths.push(change.path);
    }
    if (ws.dirty.some((file) => file.path === change.path)) continue;
    ws.dirty.push({
      path: change.path,
      kind: change.path === ws.snapshot.manifestPath ? 'manifest' : 'zone',
      ...(change.created ? { newFile: true as const } : {}),
    });
  }
}

export interface HarnessHost {
  /** The files the host answers from (`null` for a hand-built state): set with each fixture. */
  use(ws: Workspace | null): void;
  /** Answer ops (true) or leave them unclaimed (false). */
  setAnswering(on: boolean): void;
  /** Refuse the next op once, with this code. */
  failNext(code: string): void;
}

export function attachHost(elements: readonly HTMLElement[]): HarnessHost {
  let ws: Workspace | null = null;
  let stops: (() => void)[] = [];
  let failCode: string | null = null;

  /** Write a successful op's changes and answer the zone it changed. */
  const zoneReply = (
    files: Workspace,
    path: string,
    result: Result<{ changes: InventoryChange[] }>
  ): Result<{ state: SharedInventoryZoneState }> => {
    if (!result.ok) return result;
    write(files, result.changes);
    const state = zoneOf(files, path);
    return state ? ok({ state }) : fail('NOT_FOUND', `No zone at ${path}`);
  };

  const answer = (op: AppOp<InventoryOps>): Result<object> => {
    if (failCode !== null) {
      const code = failCode;
      failCode = null;
      return fail(code, `The harness refused this op (${code})`);
    }
    // Linking is a host's own business: the harness's editor is an anchor.
    if (op.type === 'link-editor') return ok({ href: `#editor:${op.path}` });
    if (!ws) {
      return fail(
        'HARNESS_NO_FILES',
        'This state is hand-built: the harness has no files to change.'
      );
    }
    switch (op.type) {
      case 'add-zone': {
        const result = addInventoryZone(ws.snapshot, op);
        if (!result.ok) return result;
        write(ws, result.changes);
        const space = spaceOf(ws);
        return space ? ok({ space }) : fail('NOT_FOUND', 'The inventory is gone');
      }
      // The elements send the bodies a host's endpoints take: the core's inputs.
      case 'add-item':
        return zoneReply(
          ws,
          op.path,
          addInventoryItem(ws.snapshot, {
            path: op.path,
            item: op.item as unknown as AddInventoryItemInput,
          })
        );
      case 'update-item':
        return zoneReply(
          ws,
          op.path,
          updateInventoryItem(ws.snapshot, {
            path: op.path,
            id: op.id,
            changes: op.changes as UpdateInventoryItemInput,
          })
        );
      case 'delete-item':
        return zoneReply(ws, op.path, deleteInventoryItem(ws.snapshot, op));
    }
  };

  const setAnswering = (on: boolean): void => {
    for (const stop of stops) stop();
    stops = on ? elements.map((el) => answerOps<InventoryOps>(el, answer)) : [];
  };
  setAnswering(true);
  return {
    use: (next) => (ws = next),
    setAnswering,
    failNext: (code) => (failCode = code),
  };
}
