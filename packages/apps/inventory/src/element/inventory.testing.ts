/// <reference lib="dom" />
/**
 * Mounting an inventory element for a test: with links, a host answering its
 * ops in memory, and the events it raises collected.
 */
import { answerOps, ok } from '@stillpointlab/common-format/app';

import type { InventoryLinks, InventoryNotification, InventoryOps } from './types.js';
import type { AppOp, Result } from '@stillpointlab/common-format/app';

export const INVENTORY_BASE = '/inventory/view_1';

/** Editor links the test host knows, by path; anything else asks `link-editor`. */
export const linkedEditors = new Map<string, string>();

export const LINKS: InventoryLinks = {
  zone: (path) => `${INVENTORY_BASE}/zone/${encodeURIComponent(path)}`,
  exportAll: () => `${INVENTORY_BASE}/export.zip`,
  exportZone: (path) => `${INVENTORY_BASE}/export/${encodeURIComponent(path)}.csv`,
  editor: (path) => linkedEditors.get(path),
};

export interface Mounted<E extends HTMLElement> {
  el: E;
  /** Every op the element asked for. */
  ops: AppOp<InventoryOps>[];
  notifications: InventoryNotification[];
  /** The names of the request events the element raised. */
  requests: string[];
}

export type Answer = (op: AppOp<InventoryOps>) => Result<object> | Promise<Result<object>>;

export function mountInventory<E extends HTMLElement & { setState(state: S): void }, S>(
  tag: 'spl-inventory-overview' | 'spl-inventory-zone',
  state: S,
  answer: Answer = () => ok(),
  options: { links?: InventoryLinks | null } = {}
): Mounted<E> {
  const el = document.createElement(tag) as unknown as E & { links: InventoryLinks | null };
  el.links = options.links === undefined ? LINKS : options.links;
  const mounted: Mounted<E> = { el, ops: [], notifications: [], requests: [] };
  answerOps<InventoryOps>(el, (op) => {
    mounted.ops.push(op);
    return answer(op);
  });
  el.addEventListener('notification', (event) => {
    mounted.notifications.push((event as CustomEvent<InventoryNotification>).detail);
  });
  for (const name of ['checkin-request', 'reload-request']) {
    el.addEventListener(name, () => mounted.requests.push(name));
  }
  document.body.append(el);
  el.setState(state);
  return mounted;
}
