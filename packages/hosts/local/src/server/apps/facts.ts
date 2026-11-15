// What the local host knows about an instance beyond its files: git's changes in
// the instance's region, each changed or moved file with its text at the last
// commit (`base`), handed to the module's `fromChanges`. That is the runner's
// `know`, one function for every app.
//
// A base is read once (`port.git.base`) and kept until git's `HEAD` or index
// moves (`forget`, on the watcher's `status`), so an op does not read it twice.
// A file whose base cannot be read as text goes without. Outside a repository
// nothing is changed, new or moved.

import { createHash } from 'node:crypto';

import { inRegion } from '../../shared/apps';

import { folderOf } from './discovery';

import type { NodePort } from '../port';
import type { AnyAppModule, AppFileChange } from '@stillpointlab/common-format/app';
import type { LoadedInstance, RunnerHost } from '@stillpointlab/common-format/host';

export interface Facts {
  /**
   * A runner host for one request: `know` from the changes, and `changes()`, a
   * digest of the last changes it handed a module, for the host's revision.
   */
  runner(): RunnerHost & { changesDigest(): string };
  /** Drop the kept bases: `HEAD` or the index moved. */
  forget(): void;
}

const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

/** The host's revision: the runner's, joined with the digest of the changes the facts were made from. */
export function hostRevision(runnerRevision: string, changesDigest: string): string {
  return digest(`${runnerRevision}\0${changesDigest}`);
}

export function createFacts(port: NodePort): Facts {
  const bases = new Map<string, Promise<string | null>>();

  function baseOf(change: AppFileChange): Promise<string | null> {
    const key = `${change.path}\0${change.from ?? ''}`;
    let kept = bases.get(key);
    if (!kept) {
      kept = port.git.base(change.path).then(
        (read) => (read.ok ? read.text : null),
        () => null
      );
      bases.set(key, kept);
    }
    return kept;
  }

  /** The changes in the instance's region, each changed or moved file with its base. */
  async function changesFor(loaded: LoadedInstance): Promise<AppFileChange[]> {
    const listed = await port.git.changes();
    if (!listed.ok) return [];
    const { manifestPath } = loaded.snapshot;
    const folder = folderOf(manifestPath);
    const region = { folder, scope: [...loaded.scope] };
    const mine = listed.changes.filter(
      (change) =>
        inRegion(region, change.path) ||
        (change.from !== undefined && inRegion(region, change.from))
    );
    return Promise.all(
      mine.map(async (change) => {
        if (change.status !== 'changed' && change.status !== 'moved') return change;
        const base = await baseOf(change);
        return base === null ? change : { ...change, base };
      })
    );
  }

  return {
    runner() {
      let last = digest('[]');
      return {
        port,
        now: () => new Date().toISOString(),
        async know(module: AnyAppModule, loaded: LoadedInstance) {
          const changes = await changesFor(loaded);
          last = digest(JSON.stringify(changes));
          return module.fromChanges(changes, loaded.snapshot);
        },
        changesDigest: () => last,
      };
    },
    forget: () => bases.clear(),
  };
}
