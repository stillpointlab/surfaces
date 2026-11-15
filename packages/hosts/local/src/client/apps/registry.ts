// The page's one registration of the apps, by app id: its `./meta`, how to load
// its shell (`./shell`) and the shell's tag, and the host ops the page answers in
// the browser. Nothing else in the page names an app; the server has its own
// registration (`src/server/apps/registry.ts`). `main.ts` hands this to the page,
// and a test hands it a fake.

import { inventoryMeta } from '@stillpointlab/inventory-app/meta';

import { editorLink } from './page-ops';

import type { AppMeta, Result } from '@stillpointlab/common-format/app';

/** A host op the page answers itself. */
export type PageOp = (
  op: { type: string } & Record<string, unknown>
) => Result<object> | Promise<Result<object>>;

export interface ClientApp {
  meta: AppMeta;
  /** The app's shell: its tag, defined once `load` resolves. */
  shell: { tag: string; load(): Promise<unknown> };
  /** The host ops the page answers, by op type; any other op goes to the server. */
  pageOps?: Readonly<Record<string, PageOp>>;
}

export type ClientApps = Readonly<Record<string, ClientApp>>;

export function createAppRegistry(): ClientApps {
  return {
    inventory: {
      meta: inventoryMeta,
      shell: { tag: 'spl-inventory-app', load: () => import('@stillpointlab/inventory-app/shell') },
      pageOps: { 'link-editor': editorLink },
    },
  };
}
