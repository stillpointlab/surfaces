// @vitest-environment jsdom
/// <reference lib="dom" />
import { answerOps, fail, ok } from '@stillpointlab/common-format/app';
import {
  describeAppElementContract,
  expectNoHostileMarkup,
  hostile,
} from '@stillpointlab/common-format/testing';
import { afterEach, describe, expect, it } from 'vitest';

import './index.js';
import { CONFIGURED_ZONE, LEGACY_ZONE, SPACE } from '../element/inventory.fixtures.js';
import { inventoryModule } from '../module.js';

import type { InventoryApp } from './inventory-app.js';
import type { InventoryOps } from '../element/types.js';
import type { SharedInventorySpace, SharedInventoryZoneState } from '../types.js';
import type { AppOp, AppShellInput, AppShellOps, Result } from '@stillpointlab/common-format/app';

const PATH_BASE = '/project/p/repos/r/inventory/view_1';
const FRAGMENT_BASE = '#/app/inventory/inventory.yaml';

const SPACE_VIEW = { type: 'space' };
const ZONE_VIEW = { type: 'zone', slug: 'workshop' };

/** The discriminants the elements switch on, kept intact in hostile states. */
const HOSTILE_EXCEPT = ['mode', 'type', 'state', 'kind', 'id', 'fieldId', 'field', 'multiplyBy'];

const spaceInput = (overrides: Partial<AppShellInput> = {}): AppShellInput => ({
  base: PATH_BASE,
  back: { href: '/project/p', label: 'Back to project' },
  location: 'stillpointlab/house',
  view: SPACE_VIEW,
  state: SPACE,
  ...overrides,
});

const zoneInput = (overrides: Partial<AppShellInput> = {}): AppShellInput => ({
  ...spaceInput(),
  view: ZONE_VIEW,
  state: CONFIGURED_ZONE,
  ...overrides,
});

function mountShell(input: AppShellInput): InventoryApp {
  const el = document.createElement('spl-inventory-app');
  document.body.append(el);
  el.setState(input);
  return el;
}

const title = (el: HTMLElement): string | null =>
  el.querySelector('#inventory-title')?.textContent ?? null;

const zoneLinks = (el: HTMLElement): string[] =>
  [...el.querySelectorAll('a.inventory-zone-link')].map((a) => a.getAttribute('href')!);

const submitZone = (el: HTMLElement, value: string): void => {
  const form = el.querySelector<HTMLFormElement>('#inventory-add-zone')!;
  form.querySelector<HTMLInputElement>('input[name=title]')!.value = value;
  form.requestSubmit();
};

/** The requests raised under `document` from now on, by name. */
function collectRequests(): { names: string[]; stop(): void } {
  const names: string[] = [];
  const record = (event: Event): void => {
    names.push(event.type);
  };
  const types = ['checkin-request', 'notification', 'reload-request'];
  for (const type of types) document.addEventListener(type, record);
  return {
    names,
    stop: () => {
      for (const type of types) document.removeEventListener(type, record);
    },
  };
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.replaceChildren();
  delete (globalThis as { __hostile?: unknown }).__hostile;
});

describe('<spl-inventory-app> views', () => {
  it('shows the overview for the space view, under the bar', async () => {
    const el = mountShell(spaceInput());
    await el.whenReady();

    expect(el.querySelector(':scope > .inventory-bar')).not.toBeNull();
    const overview = el.querySelector('spl-inventory-overview');
    expect(overview).not.toBeNull();
    expect(overview?.querySelector('.inventory-zone-name')?.textContent).toBe('Kitchen');
    expect(el.querySelector('spl-inventory-zone')).toBeNull();
    expect(el.dataset.variant).toBe('space');
    expect(title(el)).toBe('Maple St House');
    expect(el.querySelector('.inventory-repo')?.textContent).toBe('stillpointlab/house');
  });

  it('leads back where the host says on the overview, and has no back link without one', () => {
    const el = mountShell(spaceInput());
    const back = el.querySelector<HTMLAnchorElement>('a.back-button')!;
    expect(back.getAttribute('href')).toBe('/project/p');
    expect(back.getAttribute('aria-label')).toBe('Back to project');

    el.setState(spaceInput({ back: undefined, location: undefined }));
    expect(el.querySelector('.back-button')).toBeNull();
    expect(el.querySelector('.inventory-repo')).toBeNull();
  });

  it('shows one zone for the zone view, and leads back to the overview', () => {
    const el = mountShell(zoneInput());

    expect(
      el.querySelector('spl-inventory-zone')?.querySelector('.inventory-table')
    ).not.toBeNull();
    expect(el.querySelector('spl-inventory-overview')).toBeNull();
    expect(el.dataset.variant).toBe('zone');
    expect(title(el)).toBe('Workshop — Workshop floor');
    const back = el.querySelector<HTMLAnchorElement>('a.back-button')!;
    expect(back.getAttribute('href')).toBe(PATH_BASE);
    expect(back.getAttribute('aria-label')).toBe('Back to inventory overview');
  });

  it('titles a zone without its inventory’s label by the zone alone', () => {
    const el = mountShell(zoneInput({ state: { ...CONFIGURED_ZONE, spaceLabel: undefined } }));
    expect(title(el)).toBe('Workshop floor');
  });

  it('shows the overview’s empty state when there is no view, or no inventory', () => {
    const none = mountShell(spaceInput({ view: null, state: null }));
    expect(none.querySelector('spl-inventory-overview .inventory-notice')?.textContent).toContain(
      'no inventory yet'
    );
    expect(title(none)).toBe('Inventory');

    none.setState(spaceInput({ state: null }));
    expect(none.querySelector('spl-inventory-overview .inventory-notice')).not.toBeNull();
  });

  it('says so when a zone view has no state, and links to the overview', () => {
    const el = mountShell(zoneInput({ state: null }));

    expect(el.querySelector('spl-inventory-zone')).toBeNull();
    const missing = el.querySelector('.inventory-app-missing')!;
    expect(missing.textContent).toContain('not in the inventory');
    expect(missing.querySelector('a')?.getAttribute('href')).toBe(PATH_BASE);
  });

  it('keeps its element across states of the same view, and swaps it for another view', () => {
    const el = mountShell(zoneInput());
    const zone = el.querySelector('spl-inventory-zone');

    el.setState(zoneInput({ state: LEGACY_ZONE }));
    expect(el.querySelector('spl-inventory-zone')).toBe(zone);
    expect(title(el)).toBe('Maple St House — Living Room');

    el.setState(spaceInput());
    expect(el.querySelector('spl-inventory-zone')).toBeNull();
    expect(el.querySelector('spl-inventory-overview')).not.toBeNull();
  });
});

describe('<spl-inventory-app> links', () => {
  it('links each zone under a path base', () => {
    const el = mountShell(spaceInput());
    expect(zoneLinks(el)).toEqual([`${PATH_BASE}/room/kitchen`]);
  });

  it('links each zone under a fragment base, joined as text', () => {
    const el = mountShell(spaceInput({ base: FRAGMENT_BASE }));
    expect(zoneLinks(el)).toEqual([`${FRAGMENT_BASE}/room/kitchen`]);

    el.setState(zoneInput({ base: FRAGMENT_BASE }));
    expect(el.querySelector('a.back-button')?.getAttribute('href')).toBe(FRAGMENT_BASE);
  });

  it('drops one trailing slash from the base', () => {
    const el = mountShell(spaceInput({ base: `${PATH_BASE}/` }));
    expect(zoneLinks(el)).toEqual([`${PATH_BASE}/room/kitchen`]);
  });

  it('uses the slug a state carries, encoded, and the file’s name otherwise', () => {
    const odd: SharedInventorySpace = {
      ...SPACE,
      zones: [
        { ...SPACE.zones[0]!, slug: 'pantry & larder', path: 'rooms/pantry.yaml' },
        { ...SPACE.zones[0]!, slug: undefined as unknown as string, path: 'rooms/Shed.YML' },
      ],
    };
    const el = mountShell(spaceInput({ state: odd }));
    expect(zoneLinks(el)).toEqual([
      `${PATH_BASE}/room/${encodeURIComponent('pantry & larder')}`,
      `${PATH_BASE}/room/Shed`,
    ]);
  });
});

describe('<spl-inventory-app> exports', () => {
  it('hides the export controls without extras.exports', () => {
    const overview = mountShell(spaceInput());
    expect(overview.querySelector('.inventory-download')).toBeNull();

    const zone = mountShell(zoneInput());
    expect(zone.querySelector('.inventory-download')).toBeNull();
  });

  it('links the host’s exports from extras.exports', () => {
    const exports = {
      all: `${PATH_BASE}/export.zip`,
      zone: (path: string) => `${PATH_BASE}/export/${encodeURIComponent(path)}.csv`,
    };
    const overview = mountShell(spaceInput({ extras: { exports } }));
    expect(overview.querySelector('a.inventory-download')?.getAttribute('href')).toBe(
      `${PATH_BASE}/export.zip`
    );

    const zone = mountShell(zoneInput({ extras: { exports } }));
    expect(zone.querySelector('a.inventory-download')?.getAttribute('href')).toBe(
      `${PATH_BASE}/export/${encodeURIComponent(CONFIGURED_ZONE.zone.path)}.csv`
    );
  });

  it('shows only the exports the host has, and ignores ones of the wrong shape', () => {
    const zoneOnly = mountShell(spaceInput({ extras: { exports: { zone: () => '/z.csv' } } }));
    expect(zoneOnly.querySelector('.inventory-download')).toBeNull();

    const wrong = mountShell(zoneInput({ extras: { exports: { all: 7, zone: 'nope' } } }));
    expect(wrong.querySelector('.inventory-download')).toBeNull();
  });
});

describe('<spl-inventory-app> learn and opView', () => {
  it('keeps the title from an add-zone reply on the overview', () => {
    const el = mountShell(spaceInput());

    el.learn({ type: 'add-zone' }, ok({ space: { ...SPACE, label: 'Elm St House' } }));
    expect(title(el)).toBe('Elm St House');
  });

  it.each(['add-item', 'update-item', 'delete-item'])(
    'keeps the title from a %s reply on a zone',
    (type) => {
      const el = mountShell(zoneInput());
      const state: SharedInventoryZoneState = {
        ...CONFIGURED_ZONE,
        spaceLabel: 'Shop',
        zone: { ...CONFIGURED_ZONE.zone, label: `Bench after ${type}` },
      };

      el.learn({ type }, ok({ state }));
      expect(title(el)).toBe(`Shop — Bench after ${type}`);
    }
  );

  it('learns the new zone’s slug from an add-zone reply', () => {
    const el = mountShell(spaceInput());
    const space: SharedInventorySpace = {
      ...SPACE,
      zones: [...SPACE.zones, { ...SPACE.zones[0]!, slug: 'attic-2', path: 'rooms/attic.yaml' }],
    };

    el.learn({ type: 'add-zone' }, ok({ space }));
    el.querySelector('spl-inventory-overview')!.setState(space);
    expect(zoneLinks(el)).toContain(`${PATH_BASE}/room/attic-2`);
  });

  it('leaves the title alone for a reply that is not its view’s', () => {
    const el = mountShell(spaceInput());

    el.learn({ type: 'add-item' }, ok({ state: CONFIGURED_ZONE }));
    el.learn({ type: 'link-editor' }, ok({ href: '#editor' }));
    expect(title(el)).toBe('Maple St House');
  });

  it('answers no view for any op: no inventory reply depends on one', () => {
    const el = mountShell(zoneInput());
    for (const type of [...inventoryModule.coreOps, ...inventoryModule.hostOps]) {
      expect(el.opView({ type })).toBeUndefined();
    }
  });
});

describe('<spl-inventory-app> requests', () => {
  it('raises navigate for a followed link, and the click stays the host’s to claim', () => {
    const el = mountShell(spaceInput());
    const seen: string[] = [];
    const claim = (event: Event): void => {
      seen.push((event as CustomEvent<{ href: string }>).detail.href);
      event.preventDefault();
    };
    document.addEventListener('navigate', claim);
    const link = el.querySelector<HTMLAnchorElement>('a.inventory-zone-link')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(click);
    document.removeEventListener('navigate', claim);

    expect(seen).toEqual([`${PATH_BASE}/room/kitchen`]);
    expect(click.defaultPrevented).toBe(true);
  });

  it('leaves the click alone when no host claims navigate, or for a download or a new tab', () => {
    const el = mountShell(spaceInput({ extras: { exports: { all: '/export.zip' } } }));
    const seen: string[] = [];
    const watch = (event: Event): void => {
      seen.push((event as CustomEvent<{ href: string }>).detail.href);
    };
    document.addEventListener('navigate', watch);
    // Stop jsdom following the links: the shell's listener has run by then.
    const stop = (event: Event): void => event.preventDefault();

    const back = el.querySelector<HTMLAnchorElement>('a.back-button')!;
    const plain = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    back.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);

    document.addEventListener('click', stop);
    el.querySelector('a.inventory-download')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    );
    el.querySelector('a.inventory-zone-link')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true })
    );
    document.removeEventListener('click', stop);
    document.removeEventListener('navigate', watch);

    expect(seen).toEqual(['/project/p']);
  });

  it('lets its elements’ requests through, bubbling', async () => {
    const el = mountShell(
      spaceInput({ state: { ...SPACE, dirty: [{ path: 'rooms/kitchen.yaml', kind: 'zone' }] } })
    );
    const seen = collectRequests();
    answerOps<InventoryOps>(el, () => ok({ space: SPACE }));

    el.querySelector<HTMLElement>('#inventory-checkin')!.click();
    submitZone(el, 'Attic');
    await tick();
    seen.stop();
    expect(seen.names).toEqual(['checkin-request', 'notification']);
  });

  it('lets a zone’s reload request through when its item is gone', async () => {
    const el = mountShell(zoneInput());
    const seen = collectRequests();
    answerOps<InventoryOps>(el, () => fail('INVENTORY_ITEM_NOT_FOUND', 'Gone'));

    el.querySelector<HTMLElement>('[data-action="edit-item"]')!.click();
    const del = el.querySelector<HTMLButtonElement>('#delete-inventory-item')!;
    del.click();
    del.click();
    await tick();
    seen.stop();
    expect(seen.names).toEqual(['notification', 'reload-request']);
  });

  it('lets link-editor through to its host, which answers it', async () => {
    const el = mountShell(zoneInput({ state: { ...CONFIGURED_ZONE, zone: readOnly() } }));
    const asked: AppOp<InventoryOps & AppShellOps>[] = [];
    answerOps<InventoryOps & AppShellOps>(el, (op): Result<object> => {
      asked.push(op);
      return ok({ href: '#editor' });
    });
    const navigated: string[] = [];
    document.addEventListener(
      'navigate',
      (event) => {
        navigated.push((event as CustomEvent<{ href: string }>).detail.href);
        event.preventDefault();
      },
      { once: true }
    );

    el.querySelector<HTMLButtonElement>('button[data-action="open-inventory-editor"]')!.click();
    await tick();
    expect(asked.map((op) => op.type)).toEqual(['link-editor']);
    expect(navigated).toEqual(['#editor']);
  });
});

/** The configured zone, read-only for the app, so it offers "Open in editor". */
function readOnly(): SharedInventoryZoneState['zone'] {
  return { ...CONFIGURED_ZONE.zone, writable: false, readOnlyReason: 'Flow style' };
}

describe('<spl-inventory-app> hostile input', () => {
  it.each([
    ['the overview', spaceInput({ extras: { exports: { all: '/x.zip' } } })],
    ['a zone', zoneInput({ extras: { exports: { zone: () => '/z.csv' } } })],
  ])('escapes every string of %s', async (_name, input) => {
    const el = mountShell(hostile(input, { except: HOSTILE_EXCEPT }));
    await el.whenReady();
    expectNoHostileMarkup(el);
    el.learn({ type: 'add-zone' }, hostile(ok({ space: SPACE }), { except: HOSTILE_EXCEPT }));
    expectNoHostileMarkup(el);
  });
});

describeAppElementContract<AppShellInput, InventoryApp>('spl-inventory-app', {
  state: hostile(spaceInput(), { except: HOSTILE_EXCEPT }),
  trigger: (el) => submitZone(el, 'Attic'),
});
