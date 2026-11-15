import { matchAppPage } from '@stillpointlab/common-format/app';
import { describe, expect, it } from 'vitest';

import { inventoryPages } from './pages.js';

import type { AppPageResolution } from '@stillpointlab/common-format/app';

/** What the page at `subPath` answers, over a base that is the local host's fragment. */
async function resolve(subPath: string): Promise<AppPageResolution | null> {
  const match = matchAppPage(inventoryPages, subPath);
  if (!match) return null;
  return match.page.resolve({
    params: match.params,
    query: {},
    base: '#/app/home/inventory.yaml',
    manifestPath: 'home/inventory.yaml',
    project: async () => null,
  });
}

describe('inventoryPages', () => {
  it('shows the overview at the base, and a zone at /room/<slug>', async () => {
    expect(await resolve('')).toEqual({ view: { type: 'space' } });
    expect(await resolve('/room/kitchen')).toEqual({ view: { type: 'zone', slug: 'kitchen' } });
  });

  // Context Manager at 8fa439ba: "rejects a zone slug containing a path
  // separator" (it answered 400; a page here answers not found).
  it('answers not found for a slug that is not one path segment', async () => {
    expect(await resolve('/room/a%2Fb')).toEqual({ notFound: true });
    expect(await resolve('/room/a%5Cb')).toEqual({ notFound: true });
  });

  it('takes a slug of up to 200 characters', async () => {
    expect(await resolve(`/room/${'x'.repeat(200)}`)).toEqual({
      view: { type: 'zone', slug: 'x'.repeat(200) },
    });
    expect(await resolve(`/room/${'x'.repeat(201)}`)).toEqual({ notFound: true });
  });

  it('titles a page by the space’s label or the zone’s', () => {
    const [overview, zone] = inventoryPages;
    expect(overview.title({ label: 'Maple St House' })).toBe('Maple St House — Inventory');
    expect(overview.title({})).toBe('Inventory');
    expect(overview.title(null)).toBe('Inventory');
    expect(zone.title({ zone: { label: 'Kitchen' } })).toBe('Kitchen — Inventory');
  });

  it('renders the empty state for a missing space, and not found for a missing zone', () => {
    expect(inventoryPages.map((page) => page.emptyWhenMissing)).toEqual([true, false]);
  });
});
