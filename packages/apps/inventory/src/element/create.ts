/// <reference lib="dom" />
// `./create-element`: `<spl-inventory-create>`, the inventory's create form (see
// the README's "The create form"). Its own entry, apart from `./element`, so a
// host loads it only where it creates an inventory.

export { CREATE_VALIDITY_EVENT, InventoryCreate } from './inventory-create.js';
export type { InventoryCreateOps, InventoryCreateState } from './inventory-create.js';
