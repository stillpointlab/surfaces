// One in-memory host for any app: it answers an element's ops with common's
// runner over the workspace's memory port. A core op runs as any host runs it
// (`runOp`: bounded, applied, written into the port, replied from the files
// read again); a host op goes to the handler the fixture gave. What a host
// knows that no file shows is the module's `fromChanges` over the port's
// changes, unless the workspace says more, so an app's harness supplies its
// files and nothing about its ops.
import { fail, isCoreOp, ok } from '@stillpointlab/common-format/app';
import { runOp } from '@stillpointlab/common-format/host';

import type { AnyAppModule, AppView, AppViewMap, Result } from '@stillpointlab/common-format/app';
import type { LoadedInstance, MemoryPort, RunnerHost } from '@stillpointlab/common-format/host';

/** The files a host answers from: a memory port, the instance's manifest, and what it knows beyond them. */
export interface MemoryWorkspace {
  port: MemoryPort;
  manifestPath: string;
  /** The facts and snapshot parts: the module's `fromChanges` over the port's changes by default. */
  know?: RunnerHost['know'];
}

export interface MemoryHostOptions {
  module: AnyAppModule;
  /** The files to answer from now, or `null` for a hand-built state (core ops are refused). */
  workspace(): MemoryWorkspace | null;
  /** The view the page shows, for a reply that depends on it. */
  view?(): AppView<AppViewMap> | undefined;
  /** Answers for the module's host ops, by op type. */
  hostOps?: Record<
    string,
    (op: { type: string } & Record<string, unknown>) => Result<object> | Promise<Result<object>>
  >;
  /** The time a new file is stamped with (now, unless a fixture pins it). */
  now?(): string;
}

/** The module's facts from the port's changes alone: what a host that knows only files knows. */
export function knowFromChanges(port: MemoryPort): RunnerHost['know'] {
  return async (module: AnyAppModule, loaded: LoadedInstance) =>
    module.fromChanges(port.changes(), loaded.snapshot);
}

/** An answer function for `answerOps`: any element op of the module, answered in memory. */
export function memoryAnswer(
  options: MemoryHostOptions
): (op: { type: string } & Record<string, unknown>) => Promise<Result<object>> {
  const { module } = options;
  return async (op) => {
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
    const view = options.view?.();
    const answer = await runOp(
      {
        port: ws.port,
        know: ws.know ?? knowFromChanges(ws.port),
        now: () => options.now?.() ?? new Date().toISOString(),
      },
      module,
      ws.manifestPath,
      view === undefined ? { op } : { op, view }
    );
    return answer.ok ? ok(answer.reply) : answer;
  };
}
