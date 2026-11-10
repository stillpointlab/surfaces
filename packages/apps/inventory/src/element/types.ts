/// <reference lib="dom" />
/**
 * What the inventory elements and their page agree on (Context Manager's
 * ADR-0038): the ops the elements ask for, by path; the links the page builds;
 * and the requests the elements raise for what the page owns.
 */
import type { AddInventoryItemInput, UpdateInventoryItemInput } from '../ops.js';

/** An item as quick add sends it: the core's input. */
export type InventoryItemInput = AddInventoryItemInput;

/** An item edit as the dialog sends it, only the changed fields: the core's input. */
export type InventoryItemChanges = UpdateInventoryItemInput;

export type { InventoryOps } from '../elementOps.js';

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
