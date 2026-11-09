// An in-memory host for the harness: it keeps an inventory's files in memory,
// answers the elements' ops with the inventory core's `apply` (the app
// contract's), writes the changes back and re-projects with its `project`.
// There are no drafts, check-in or repository: a changed file is marked dirty,
// as a host marks it until check-in. A hand-built state has no files, so its
// ops are refused.
import { answerOps, fail, ok } from '@stillpointlab/common-format/app';

import { inventoryCore } from '../src/core.js';

import type { InventoryCoreOps } from '../src/core.js';
import type { InventoryOps } from '../src/element/index.js';
import type { InventoryHostFacts, InventorySnapshot } from '../src/space.js';
import type {
  SharedInventoryDirtyFile,
  SharedInventorySpace,
  SharedInventoryZoneState,
} from '../src/types.js';
import type { AppCoreOp, AppOp, FileChange, Result } from '@stillpointlab/common-format/app';

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
  return inventoryCore.project(ws.snapshot, { type: 'space' }, facts(ws));
}

/** A zone file's slug: its name, as detection reads it. */
const slugOf = (path: string): string =>
  path.slice(path.lastIndexOf('/') + 1).replace(/\.yaml$/, '');

/** One zone of the workspace, by its file's path (the first zone when none is given). */
export function zoneOf(ws: Workspace, path?: string): SharedInventoryZoneState | null {
  const zonePath = path ?? spaceOf(ws)?.zones[0]?.path;
  if (zonePath === undefined) return null;
  return inventoryCore.project(ws.snapshot, { type: 'zone', slug: slugOf(zonePath) }, facts(ws));
}

/** Write an op's changes into memory, marking each file dirty. */
function write(ws: Workspace, changes: readonly FileChange[]): void {
  for (const change of changes) {
    if (change.kind === 'move') {
      delete ws.snapshot.files[change.from];
      ws.snapshot.paths = ws.snapshot.paths.filter((path) => path !== change.from);
    }
    ws.snapshot.files[change.path] = change.content;
    if (!ws.snapshot.paths.includes(change.path)) ws.snapshot.paths.push(change.path);
    if (ws.dirty.some((file) => file.path === change.path)) continue;
    ws.dirty.push({
      path: change.path,
      kind: change.path === ws.snapshot.manifestPath ? 'manifest' : 'zone',
      ...(change.kind === 'create' ? { newFile: true as const } : {}),
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
    // The elements' ops are the core's: their `item` and `changes` are the
    // bodies a host's endpoints take, which are the core's inputs.
    const result = inventoryCore.apply(ws.snapshot, op as AppCoreOp<InventoryCoreOps>);
    if (!result.ok) return result;
    write(ws, result.changes);
    if (op.type === 'add-zone') {
      const space = spaceOf(ws);
      return space ? ok({ space }) : fail('NOT_FOUND', 'The inventory is gone');
    }
    const state = zoneOf(ws, op.path);
    return state ? ok({ state }) : fail('NOT_FOUND', `No zone at ${op.path}`);
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
