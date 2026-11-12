/// <reference lib="dom" />
// The inventory app's elements: `<spl-inventory-overview>` and
// `<spl-inventory-zone>`, which take a state and ask their host for ops by path
// (see the README's Element section). The create form is its own entry,
// `./create-element`, so a page that only shows an inventory does not load it.

export { InventoryOverview } from './inventory-overview.js';
export { InventoryZone } from './inventory-zone.js';
export { CHECKIN_REQUEST_EVENT, NOTIFICATION_EVENT, RELOAD_REQUEST_EVENT } from './types.js';
export type {
  InventoryItemChanges,
  InventoryItemInput,
  InventoryLinks,
  InventoryNotification,
  InventoryNotificationType,
  InventoryOps,
} from './types.js';
