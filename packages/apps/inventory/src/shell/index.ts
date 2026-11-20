/// <reference lib="dom" />
// The inventory app's shell: `<spl-inventory-app>`, the page around the overview
// and the zone (the app contract's `AppShellElement`; see the README's Shell
// section). It registers the two elements it lays out.

export { InventoryApp, NAVIGATE_EVENT } from './inventory-app.js';
export type { InventoryNavigate } from './inventory-app.js';
export type { InventoryExports } from './links.js';
export { NOTIFICATION_EVENT, RELOAD_REQUEST_EVENT } from '../element/types.js';
export type {
  InventoryNotification,
  InventoryNotificationType,
  InventoryOps,
} from '../element/types.js';
