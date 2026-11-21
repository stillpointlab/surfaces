// The host ops the server answers itself, before the runner: an app's element
// asks for something only a host can do (read a file, scan the instance for
// links to a card, resolve a divergence). Each app's registration names the ones
// it needs (`registry.ts`); an op none names goes to the runner, which refuses a
// host op as `APP_OP_UNKNOWN`.
//
// A host op changes no file the runner tracks, so its answer carries no
// `revision`, and the page does not hand its reply to the shell's `learn`.
//
// A host op reaches the instance's own files and no others: `read-file` refuses
// a path outside the instance's region (its folder, or at the served root its
// scope), though the port could read it. An app deals with the files it holds.

import { fail, ok } from '@stillpointlab/common-format/app';

import { inRegion, type Region } from '../../shared/apps';

import type { AnyAppModule, AppSnapshot, Result } from '@stillpointlab/common-format/app';
import type { StoragePort } from '@stillpointlab/common-format/host';

/** What a host op has to work with: the port, the module, the instance, and its known snapshot. */
export interface HostOpContext {
  port: StoragePort;
  module: AnyAppModule;
  manifestPath: string;
  /** The instance's own files: its folder, or at the served root its scope's paths. */
  region: Region;
  /** The instance as the runner reads it, with the host's knowledge laid over. */
  snapshot(): Promise<Result<{ snapshot: AppSnapshot }>>;
}

export type ServerHostOp = (
  op: { type: string } & Record<string, unknown>,
  context: HostOpContext
) => Promise<Result<object>>;

/** The host ops one app's elements ask the server, by op type. */
export type ServerHostOps = Readonly<Record<string, ServerHostOp>>;

const pathOf = (op: Record<string, unknown>): string | null =>
  typeof op.path === 'string' && op.path !== '' ? op.path : null;

const noPath = (type: string) =>
  fail('APP_OP_INVALID', `The op is not valid: path: "${type}" names a file by its path.`);

/** `read-file`: the text of one of the instance's files, from the port: `{ content }`. */
export const readFile: ServerHostOp = async (op, { port, region }) => {
  const path = pathOf(op);
  if (path === null) return noPath(op.type);
  if (!inRegion(region, path)) {
    return fail(
      'APP_OP_INVALID',
      `The op is not valid: path: ${JSON.stringify(path)} is not one of this app's files.`
    );
  }
  const read = await port.get(path);
  return read.ok ? ok({ content: read.text }) : read;
};

/**
 * `resolve`: keep one side of a divergence between a card and its upstream.
 * The local host has no remote, so there is never one to resolve.
 */
export const nothingToResolve: ServerHostOp = async (op) => {
  const path = pathOf(op);
  if (path === null) return noPath(op.type);
  return fail(
    'HOST_NOTHING_TO_RESOLVE',
    `${JSON.stringify(path)} has nothing to resolve: this folder has no upstream to differ from.`
  );
};

/**
 * `scan-references`: the files that link to a card at a path it left, by the
 * app's own rule over the instance's files: `{ references }`.
 */
export function scanReferences(
  referencesTo: (snapshot: never, path: string) => string[]
): ServerHostOp {
  return async (op, context) => {
    const path = pathOf(op);
    if (path === null) return noPath(op.type);
    const read = await context.snapshot();
    if (!read.ok) return read;
    return ok({ references: referencesTo(read.snapshot as never, path) });
  };
}
