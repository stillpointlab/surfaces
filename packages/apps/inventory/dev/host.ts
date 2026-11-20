// The harness's inventory host: an inventory's files in a memory port,
// answered through the inventory module by the harness's one memory host
// (common's runner). There are no drafts or repository: the files a fixture
// starts with are the last commit, and a file an op changes or adds is dirty,
// as the module's `fromChanges` reads the port's changes. A hand-built state
// has no files, so its ops are refused. The shell is answered as a host's
// client half answers it: a core op with the shell's `opView`, its reply passed
// to `learn`, and the shell's own `project` and `refresh` from the files in
// memory. Its `checkin` is the port's `commit` of the op's paths, answered
// `done`; then `checkedIn` runs, and the fixture reads the page again, so the
// marks clear.
import { answerOps, fail, isCoreOp, ok } from '@stillpointlab/common-format/app';
import { createMemoryPort } from '@stillpointlab/common-format/host';

import { memoryAnswer } from '../../../../tooling/harness/memory-host';
import { inventoryCore } from '../src/core.js';
import { inventoryModule } from '../src/module.js';

import type { InventoryViews } from '../src/core.js';
import type { InventoryOps } from '../src/element/index.js';
import type { InventoryApp } from '../src/shell/index.js';
import type { InventoryHostFacts, InventorySnapshot } from '../src/space.js';
import type { SharedInventorySpace, SharedInventoryZoneState } from '../src/types.js';
import type {
  AppOp,
  AppShellOps,
  AppView,
  FileChange,
  Result,
} from '@stillpointlab/common-format/app';
import type { MemoryPort } from '@stillpointlab/common-format/host';

/** An inventory's files in memory, and the manifest it is anchored at. */
export interface Workspace {
  port: MemoryPort;
  manifestPath: string;
}

/** A workspace over a snapshot's files, as committed. */
export function workspace(snapshot: InventorySnapshot): Workspace {
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(snapshot.files)) {
    if (typeof content === 'string') files[path] = content;
  }
  return { port: createMemoryPort(files), manifestPath: snapshot.manifestPath };
}

/** A just-created inventory: the seeded files, each a new local change. */
export function createdWorkspace(plan: { manifestPath: string; files: FileChange[] }): Workspace {
  const files = Object.fromEntries(plan.files.map((file) => [file.path, file.content]));
  return { port: createMemoryPort(files, { committed: {} }), manifestPath: plan.manifestPath };
}

/** The files as the core reads them, with the facts their changes make. */
function read(ws: Workspace): { snapshot: InventorySnapshot; facts: InventoryHostFacts } {
  const files = ws.port.files();
  const snapshot = { manifestPath: ws.manifestPath, paths: Object.keys(files).sort(), files };
  return { snapshot, facts: inventoryModule.fromChanges(ws.port.changes(), snapshot).facts };
}

/** The workspace's overview, or `null` when its manifest is gone. */
export function spaceOf(ws: Workspace): SharedInventorySpace | null {
  const { snapshot, facts } = read(ws);
  return inventoryCore.project(snapshot, { type: 'space' }, facts);
}

/** A zone file's slug: its name, as detection reads it. */
const slugOf = (path: string): string =>
  path.slice(path.lastIndexOf('/') + 1).replace(/\.yaml$/, '');

/**
 * Any view of the workspace, as a host's one read answers it: the view checked
 * by the module's bounds, then projected (`null` when its subject is gone).
 */
export function projectView(ws: Workspace, input: unknown): Result<{ state: object | null }> {
  const checked = inventoryModule.bounds.view(input);
  if (!checked.ok) return checked;
  const view = checked.view as AppView<InventoryViews>;
  const { snapshot, facts } = read(ws);
  return ok({ state: inventoryCore.project(snapshot, view, facts) });
}

/** One zone of the workspace, by its file's path (the first zone when none is given). */
export function zoneOf(ws: Workspace, path?: string): SharedInventoryZoneState | null {
  const zonePath = path ?? spaceOf(ws)?.zones[0]?.path;
  if (zonePath === undefined) return null;
  const { snapshot, facts } = read(ws);
  return inventoryCore.project(snapshot, { type: 'zone', slug: slugOf(zonePath) }, facts);
}

export interface HarnessHost {
  /** The files the host answers from (`null` for a hand-built state): set with each fixture. */
  use(ws: Workspace | null): void;
  /** Answer ops (true) or leave them unclaimed (false). */
  setAnswering(on: boolean): void;
  /** Refuse the next op once, with this code. */
  failNext(code: string): void;
}

export function attachHost(
  elements: readonly HTMLElement[],
  shell: InventoryApp | null = null,
  checkedIn: () => void = () => {}
): HarnessHost {
  let ws: Workspace | null = null;
  let stops: (() => void)[] = [];
  let failCode: string | null = null;
  /** The view the op being answered was sent with: the shell's `opView`. */
  let opView: AppView<InventoryViews> | undefined;

  const inMemory = memoryAnswer({
    module: inventoryModule,
    workspace: () => ws,
    view: () => opView,
    // Linking is a host's own business: the harness's editor is an anchor.
    hostOps: { 'link-editor': (op) => ok({ href: `#editor:${op.path as string}` }) },
  });

  const answer = (op: AppOp<InventoryOps>): Promise<Result<object>> => {
    if (failCode !== null) {
      const code = failCode;
      failCode = null;
      return Promise.resolve(fail(code, `The harness refused this op (${code})`));
    }
    return inMemory(op);
  };

  /** The shell's ops: its own two from the files, the rest as above, each reply learned. */
  const answerShell = async (op: AppOp<InventoryOps & AppShellOps>): Promise<Result<object>> => {
    if (op.type === 'project') {
      return ws ? projectView(ws, op.view) : fail('HARNESS_NO_FILES', 'No files to read');
    }
    // The memory host's files are their own source: there is nothing to bring up to date.
    if (op.type === 'refresh') return ok();
    if (op.type === 'checkin') {
      if (failCode !== null) {
        const code = failCode;
        failCode = null;
        return fail(code, `The harness refused this check-in (${code})`);
      }
      if (!ws) return fail('HARNESS_NO_FILES', 'No files to check in');
      ws.port.commit(op.paths);
      // The page is read again after the reply, as a host's status event would have it.
      setTimeout(checkedIn, 0);
      const files = op.paths.length === 1 ? '1 file' : `${op.paths.length} files`;
      return ok({ status: 'done', message: `Checked in ${files} in memory.` });
    }
    opView = shell!.opView(op) as AppView<InventoryViews> | undefined;
    // Read when the op starts: the view goes with this op alone.
    const replying = answer(op);
    opView = undefined;
    const reply = await replying;
    if (reply.ok && isCoreOp(inventoryModule, op.type)) shell!.learn(op, reply);
    return reply;
  };

  const setAnswering = (on: boolean): void => {
    for (const stop of stops) stop();
    stops = on ? elements.map((el) => answerOps<InventoryOps>(el, answer)) : [];
    if (on && shell) stops.push(answerOps<InventoryOps & AppShellOps>(shell, answerShell));
  };
  setAnswering(true);
  return {
    use: (next) => (ws = next),
    setAnswering,
    failNext: (code) => (failCode = code),
  };
}
