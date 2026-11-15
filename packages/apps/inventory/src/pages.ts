/**
 * The inventory's pages (the app contract's `AppPage`): the space overview at
 * the app's base, and one zone at `/room/<slug>`. The URLs, titles and the
 * zone slug's rule are Context Manager's at 8fa439ba; a slug the rule refuses
 * is not found here, where Context Manager answered 400.
 */
import type { SharedInventorySpace, SharedInventoryZoneState } from './types.js';
import type { AppPage } from '@stillpointlab/common-format/app';

/** The longest zone slug a page's URL takes. */
export const INVENTORY_PAGE_SLUG_MAX_LENGTH = 200;

/** A zone's slug in its page's URL: one non-empty path segment, at most 200 characters. */
export function isInventoryPageSlug(slug: string): boolean {
  return (
    slug.length >= 1 && slug.length <= INVENTORY_PAGE_SLUG_MAX_LENGTH && /^[^/\\]+$/.test(slug)
  );
}

export const inventoryPages: readonly AppPage[] = [
  {
    path: '',
    resolve: async () => ({ view: { type: 'space' } }),
    title: (state) => {
      const label = (state as SharedInventorySpace | null)?.label;
      return label ? `${label} — Inventory` : 'Inventory';
    },
    // A manifest gone from the folder: the link got them here, so the app's
    // empty state says so.
    emptyWhenMissing: true,
  },
  {
    path: '/room/:roomSlug',
    resolve: async ({ params }) => {
      const slug = params.roomSlug ?? '';
      return isInventoryPageSlug(slug) ? { view: { type: 'zone', slug } } : { notFound: true };
    },
    title: (state) => `${(state as SharedInventoryZoneState).zone.label} — Inventory`,
    emptyWhenMissing: false,
  },
];
