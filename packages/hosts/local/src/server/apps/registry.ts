// The server's one registration of the apps: their modules. Nothing else on the
// server names an app; `createHost` takes the list as its `apps` option, so a
// test can hand it a fake. The page has its own registration
// (`src/client/apps/registry.ts`).

import { inventoryModule } from '@stillpointlab/inventory-app';

import type { AnyAppModule } from '@stillpointlab/common-format/app';

/** The modules a host runs when it is given none. */
export const DEFAULT_APPS: readonly AnyAppModule[] = [inventoryModule];
