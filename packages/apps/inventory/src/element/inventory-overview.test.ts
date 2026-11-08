// @vitest-environment jsdom
/// <reference lib="dom" />
import { fail, ok } from '@stillpointlab/common-format/app';
import {
  describeAppElementContract,
  expectNoHostileMarkup,
  hostile,
} from '@stillpointlab/common-format/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './inventory-overview.js';
import { JUST_CREATED, SEEDED, SPACE } from './inventory.fixtures.js';
import { INVENTORY_BASE, linkedEditors, mountInventory } from './inventory.testing.js';

import type { InventoryOverview } from './inventory-overview.js';
import type { Answer } from './inventory.testing.js';
import type { SharedInventorySpace } from '../types.js';

const mountOverview = (space: SharedInventorySpace | null, answer?: Answer, links?: null) =>
  mountInventory<InventoryOverview, SharedInventorySpace | null>(
    'spl-inventory-overview',
    space,
    answer,
    links === null ? { links: null } : {}
  );

const submitZone = (el: HTMLElement, title: string): void => {
  const form = el.querySelector<HTMLFormElement>('#inventory-add-zone')!;
  form.querySelector<HTMLInputElement>('input[name=title]')!.value = title;
  form.requestSubmit();
};

afterEach(() => {
  document.body.replaceChildren();
  linkedEditors.clear();
  delete (globalThis as { __hostile?: unknown }).__hostile;
});

describe('<spl-inventory-overview>', () => {
  it('renders the add-zone row when the inventory is enabled', () => {
    const { el } = mountOverview(SPACE);

    const form = el.querySelector('#inventory-add-zone');
    expect(form).not.toBeNull();
    expect(form?.querySelector('input[name=title]')).not.toBeNull();
  });

  it('hides the add-zone row until the inventory is enabled', () => {
    const { el } = mountOverview({ ...SPACE, enabled: false });

    expect(el.querySelector('#inventory-add-zone')).toBeNull();
  });

  it('links each zone and the ZIP export through the page', () => {
    const { el } = mountOverview(SPACE);

    expect(el.querySelector('.inventory-zone-link')?.getAttribute('href')).toBe(
      `${INVENTORY_BASE}/zone/${encodeURIComponent('rooms/kitchen.yaml')}`
    );
    expect(el.querySelector('a.inventory-download')?.getAttribute('href')).toBe(
      `${INVENTORY_BASE}/export.zip`
    );
  });

  it('renders zone names as text and the export as disabled without links', () => {
    const { el } = mountOverview(SPACE, undefined, null);

    expect(el.querySelector('a.inventory-zone-link')).toBeNull();
    expect(el.querySelector('.inventory-zone-name')?.textContent).toBe('Kitchen');
    expect(el.querySelector('a.inventory-download')).toBeNull();
  });

  it('badges a seeded zone as new', () => {
    const { el } = mountOverview(SEEDED);

    const attic = el.querySelector('.inventory-zone-row')!;
    expect(attic.querySelector('.inventory-zone-dirty')?.textContent).toBe('new');
  });

  it('shows a just-created inventory as entirely new, and asks the page to check it in', () => {
    // spec inventory_create #6: no bespoke banner — every seeded file is dirty
    // and the check-in button is the nudge.
    const mounted = mountOverview(JUST_CREATED);

    const badges = [...mounted.el.querySelectorAll('.inventory-zone-dirty')].map(
      (badge) => badge.textContent
    );
    expect(badges).toEqual(['new', 'new']);
    expect(mounted.el.querySelector('.inventory-checkin-bar')?.textContent).toContain(
      '3 files with local changes'
    );

    mounted.el.querySelector<HTMLButtonElement>('#inventory-checkin')!.click();
    expect(mounted.requests).toEqual(['checkin-request']);
  });

  it('asks to add a zone and renders the overview it is answered', async () => {
    const mounted = mountOverview(SPACE, () => ok({ space: SEEDED }));

    submitZone(mounted.el, 'Attic');

    await vi.waitFor(() =>
      expect(mounted.el.querySelector('.inventory-zone-name')?.textContent).toContain('Attic')
    );
    expect(mounted.ops).toEqual([{ type: 'add-zone', title: 'Attic' }]);
    expect(mounted.el.querySelector('.inventory-zone-link')?.getAttribute('href')).toBe(
      `${INVENTORY_BASE}/zone/${encodeURIComponent('rooms/attic.yaml')}`
    );
    expect(mounted.notifications).toEqual([
      { message: 'Added zone “Attic” — local until check-in.', type: 'success' },
    ]);
  });

  it('does not ask for a blank zone title', () => {
    const mounted = mountOverview(SPACE);

    submitZone(mounted.el, '   ');

    expect(mounted.ops).toHaveLength(0);
  });

  it('shows a name collision inline instead of a toast', async () => {
    const mounted = mountOverview(SPACE, () =>
      fail('INVENTORY_ROOM_EXISTS', '“kitchen.yaml” already exists here')
    );

    submitZone(mounted.el, 'Kitchen');

    const error = mounted.el.querySelector<HTMLElement>('#inventory-add-zone-error')!;
    await vi.waitFor(() => expect(error.hidden).toBe(false));
    expect(error.textContent).toContain('already exists here');
    expect(mounted.notifications).toEqual([]);
  });

  it('disables zone creation and ZIP export on an invalid-v2 overview', () => {
    const space: SharedInventorySpace = {
      manifestPath: 'inventory/inventory.yaml',
      spacePath: 'inventory',
      schema: { mode: 'invalid', declaredVersion: 2, errors: ['total.field: invalid'] },
      rooms: [],
      totals: { itemCount: 0 },
      enabled: true,
      dirty: [{ goodId: 9, path: 'inventory/inventory.yaml', kind: 'manifest' }],
      warnings: [],
    };
    const { el } = mountOverview(space);

    expect(el.querySelector('#inventory-add-zone')).toBeNull();
    expect(el.querySelector('a.inventory-download')).toBeNull();
    expect(el.querySelector('.inventory-download.is-disabled')?.getAttribute('title')).toBe(
      'Repair inventory.yaml before exporting'
    );
    expect(el.querySelector('#inventory-checkin')).not.toBeNull();
    expect(
      el
        .querySelector('button[data-action="open-inventory-editor"]')
        ?.getAttribute('data-editor-kind')
    ).toBe('manifest');
  });

  it('renders the empty state when the repository has no inventory', () => {
    const { el } = mountOverview(null);

    expect(el.querySelector('.inventory-notice--info')?.textContent).toContain(
      'This repository has no inventory yet'
    );
  });

  it('renders hostile repository text as text', () => {
    const space = hostile(
      {
        ...SEEDED,
        warnings: ['A warning'],
        manifestErrors: ['An error'],
        rooms: [...SEEDED.rooms, { ...SEEDED.rooms[0], path: 'rooms/x.yaml', parseError: 'Bad' }],
      },
      { except: ['mode', 'type', 'kind'] }
    );

    expectNoHostileMarkup(mountOverview(space).el);
  });
});

describeAppElementContract<SharedInventorySpace | null, InventoryOverview>(
  'spl-inventory-overview',
  {
    state: SPACE,
    trigger: (el) => submitZone(el, 'Attic'),
  }
);
