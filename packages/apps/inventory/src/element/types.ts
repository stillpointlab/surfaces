/// <reference lib="dom" />
/**
 * What the inventory elements and their page agree on (Context Manager's
 * ADR-0038): the ops the elements ask for, by path; the links the page builds;
 * and the requests the elements raise for what the page owns.
 */
import type { SharedInventoryZoneState, SharedInventorySpace } from '../types.js';

/** An item as quick add sends it: the endpoint's body, unchanged. */
export type InventoryItemInput = Record<string, unknown>;

/** An item edit as the dialog sends it: only the changed fields. */
export type InventoryItemChanges = Record<string, unknown>;

/**
 * The ops the inventory elements ask their page for. A zone is named by its
 * file's path, never by a host id or slug; each reply is what the page's
 * endpoint answers, less what the element does not use. A failure carries the
 * endpoint's error code and message.
 */
export type InventoryOps = {
  'add-zone': { op: { title: string }; reply: { space: SharedInventorySpace } };
  'add-item': {
    op: { path: string; item: InventoryItemInput };
    reply: { state: SharedInventoryZoneState };
  };
  'update-item': {
    op: { path: string; id: string; changes: InventoryItemChanges };
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

/**
 * The URLs the elements render as links. They belong to the page: the elements
 * know no routes.
 */
export interface InventoryLinks {
  /** The zone's own page. */
  zone(path: string): string;
  /** The whole inventory as a ZIP. */
  exportAll(): string;
  /** One zone as CSV. */
  exportZone(path: string): string;
  /** The file's editor, when the file is already linked; else the element asks `link-editor`. */
  editor(path: string): string | undefined;
}

export type InventoryNotificationType = 'info' | 'success' | 'warning' | 'error';

/** The `notification` event's detail: a message for the page's banner. */
export interface InventoryNotification {
  message: string;
  type: InventoryNotificationType;
}

/** Raised (bubbling, no detail) when the check-in bar's button is pressed. */
export const CHECKIN_REQUEST_EVENT = 'checkin-request';

/** Raised (bubbling, no detail) when the element's state is gone and only a reload helps. */
export const RELOAD_REQUEST_EVENT = 'reload-request';

/** Raised (bubbling) with an `InventoryNotification`. */
export const NOTIFICATION_EVENT = 'notification';
