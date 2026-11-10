// The ops the inventory elements ask their host for, by type: what an element
// sends and what it expects back. DOM-free, so the app module and a host's
// server can name them; the elements re-export them.
import type { AddInventoryItemInput, UpdateInventoryItemInput } from './ops.js';
import type { SharedInventorySpace, SharedInventoryZoneState } from './types.js';

/**
 * The ops the inventory elements ask their page for. A zone is named by its
 * file's path, never by a host id or slug; each reply is what the page's
 * endpoint answers, less what the element does not use. A failure carries the
 * endpoint's error code and message.
 */
export type InventoryOps = {
  'add-zone': { op: { title: string }; reply: { space: SharedInventorySpace } };
  'add-item': {
    op: { path: string; item: AddInventoryItemInput };
    reply: { state: SharedInventoryZoneState };
  };
  'update-item': {
    op: { path: string; id: string; changes: UpdateInventoryItemInput };
    reply: { state: SharedInventoryZoneState };
  };
  'delete-item': {
    op: { path: string; id: string };
    reply: { state: SharedInventoryZoneState };
  };
  /**
   * Link a file that is not linked yet so it can open in the editor, and answer
   * the editor's URL. The element then follows it, as the link it replaces.
   */
  'link-editor': { op: { path: string; kind: 'manifest' | 'zone' }; reply: { href: string } };
};
