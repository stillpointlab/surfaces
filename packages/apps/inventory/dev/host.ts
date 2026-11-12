// The harness's inventory host: an inventory's files in memory, answered
// through the inventory module by the harness's one memory host. There are no
// drafts, check-in or repository: a changed file is marked dirty, as a host
// marks it until check-in. A hand-built state has no files, so its ops are
// refused.
import { answerOps, fail, ok } from '@stillpointlab/common-format/app';

import { memoryAnswer } from '../../../../tooling/harness/memory-host';
import { inventoryCore } from '../src/core.js';
import { inventoryModule } from '../src/module.js';

import type { InventoryOps } from '../src/element/index.js';
import type { InventoryHostFacts, InventorySnapshot } from '../src/space.js';
import type {
  SharedInventoryDirtyFile,
  SharedInventorySpace,
  SharedInventoryZoneState,
} from '../src/types.js';
import type { AppOp, FileChange, Result } from '@stillpointlab/common-format/app';

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

/** A just-created inventory: the seeded files, each a new local change. */
export function createdWorkspace(plan: { manifestPath: string; files: FileChange[] }): Workspace {
  const ws = workspace({ manifestPath: plan.manifestPath, paths: [], files: {} });
  write(ws, plan.files);
  return ws;
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

  const inMemory = memoryAnswer({
    module: inventoryModule,
    workspace: () =>
      ws && {
        snapshot: ws.snapshot,
        facts: () => facts(ws!),
        write: (changes) => write(ws!, changes),
      },
    // Linking is a host's own business: the harness's editor is an anchor.
    hostOps: { 'link-editor': (op) => ok({ href: `#editor:${op.path as string}` }) },
  });

  const answer = (op: AppOp<InventoryOps>): Result<object> => {
    if (failCode !== null) {
      const code = failCode;
      failCode = null;
      return fail(code, `The harness refused this op (${code})`);
    }
    return inMemory(op);
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
