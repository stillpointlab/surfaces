// One in-memory host for any app: it answers an element's ops with the app
// module alone. A core op is applied to the workspace's snapshot, its changes
// are written into memory, and the element gets the module's reply; a host op
// goes to the handler the fixture gave. What a host knows that no file shows
// (facts, how a move is kept) is the workspace's, so an app's harness supplies
// its files and facts and nothing about its ops.
import { fail, isCoreOp } from '@stillpointlab/common-format/app';

import type {
  AnyAppModule,
  AppSnapshot,
  AppView,
  AppViewMap,
  FileChange,
  Result,
} from '@stillpointlab/common-format/app';

/** The files a host answers from, with the facts it lays on and how it writes a change. */
export interface MemoryWorkspace<S extends AppSnapshot = AppSnapshot, Facts = unknown> {
  snapshot: S;
  facts(): Facts;
  write(changes: readonly FileChange[]): void;
}

export interface MemoryHostOptions {
  module: AnyAppModule;
  /** The files to answer from now, or `null` for a hand-built state (core ops are refused). */
  workspace(): MemoryWorkspace | null;
  /** The view the page shows, for a reply that depends on it. */
  view?(): AppView<AppViewMap> | undefined;
  /** Answers for the module's host ops, by op type. */
  hostOps?: Record<string, (op: { type: string } & Record<string, unknown>) => Result<object>>;
  /** The time a new file is stamped with (now, unless a fixture pins it). */
  now?(): string;
}

/** An answer function for `answerOps`: any element op of the module, answered in memory. */
export function memoryAnswer(
  options: MemoryHostOptions
): (op: { type: string } & Record<string, unknown>) => Result<object> {
  const { module } = options;
  return (op) => {
    const hostOp = options.hostOps?.[op.type];
    if (hostOp) return hostOp(op);
    if (!isCoreOp(module, op.type)) {
      return fail('HARNESS_UNKNOWN_OP', `The harness does not answer "${op.type}"`);
    }
    const ws = options.workspace();
    if (!ws) {
      return fail(
        'HARNESS_NO_FILES',
        'This state is hand-built: the harness has no files to change.'
      );
    }
    const now = options.now?.() ?? new Date().toISOString();
    const applied = module.core.apply(ws.snapshot, module.toCoreOp(op, { now }));
    if (!applied.ok) return applied;
    ws.write(applied.changes);
    return module.reply(op, applied, {
      snapshot: ws.snapshot,
      facts: ws.facts(),
      view: options.view?.(),
    });
  };
}
