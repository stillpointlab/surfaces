// The server's one registration of the apps: their modules, and the host ops
// each app's elements ask the server for. Nothing else on the server names an
// app; `createHost` takes both as options (`apps`, `hostOps`), so a test can
// hand it a fake. The page has its own registration
// (`src/client/apps/registry.ts`).

import { inventoryModule } from '@stillpointlab/inventory-app';
import { referencesTo, tasksModule } from '@stillpointlab/tasks-app';

import { nothingToResolve, readFile, scanReferences } from './host-ops';

import type { ServerHostOps } from './host-ops';
import type { AnyAppModule } from '@stillpointlab/common-format/app';

/** The modules a host runs when it is given none. */
export const DEFAULT_APPS: readonly AnyAppModule[] = [inventoryModule, tasksModule];

/**
 * The host ops the server answers, by app id, then op type. Inventory's one
 * host op, `link-editor`, is the page's. Tasks' shell answers `refresh-stage`
 * and `close-candidates` itself.
 */
export const DEFAULT_HOST_OPS: Readonly<Record<string, ServerHostOps>> = {
  tasks: {
    'read-file': readFile,
    'scan-references': scanReferences(referencesTo as (snapshot: never, path: string) => string[]),
    resolve: nothingToResolve,
  },
};
