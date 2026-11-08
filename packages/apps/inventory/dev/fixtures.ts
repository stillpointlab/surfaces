// The inventory elements in the surfaces harness (`npm run dev`). Both elements
// are mounted; a fixture shows the one it fills and hides the other. An
// in-memory host answers their ops, and the controls switch it off (every op
// unhandled) or make it refuse the next op. Requests and notifications show in
// the event log. Links are `#` anchors: the zone, export and editor URLs belong
// to a host.
import '../src/element/index.js';
import './host.css';

import { exampleSpace, exampleZone } from './example.js';
import { attachHost } from './host.js';
import {
  attentionZone,
  brokenZone,
  configuredOverview,
  configuredZone,
  disabledOverview,
  emptyZone,
  hostileZone,
  invalidOverview,
  justCreated,
  legacyOverview,
  legacyZone,
  neutralZone,
  readOnlyZone,
} from './states.js';

import type { HarnessHost } from './host.js';
import type {
  HarnessElements,
  HarnessFixture,
  HarnessFormat,
} from '../../../../tooling/harness/types';
import type { InventoryLinks, InventoryOverview, InventoryZone } from '../src/element/index.js';
import type { SharedInventoryZoneState, SharedInventorySpace } from '../src/types.js';

const OVERVIEW = 'spl-inventory-overview';
const ZONE = 'spl-inventory-zone';

/** The manifests and the example's garage are "linked": the rest ask `link-editor`. */
const LINKS: InventoryLinks = {
  zone: (path) => `#zone:${path}`,
  exportAll: () => '#export.zip',
  exportZone: (path) => `#export:${path}.csv`,
  editor: (path) =>
    path.endsWith('inventory.yaml') || path.endsWith('garage.yaml') ? `#editor:${path}` : undefined,
};

let host: HarnessHost | null = null;
let answering = true;

function prepare(elements: HarnessElements): { overview: InventoryOverview; zone: InventoryZone } {
  const overview = elements.extras[OVERVIEW] as InventoryOverview;
  const zone = elements.extras[ZONE] as InventoryZone;
  for (const el of [overview, zone]) {
    el.links = LINKS;
    const pane = el.parentElement;
    pane?.classList.add('inventory-harness');
    if (pane) pane.style.height = 'auto';
  }
  host ??= attachHost([overview, zone]);
  host.setAnswering(answering);
  return { overview, zone };
}

/** Show one element's block and hide the other's. */
function only(shown: HTMLElement, hidden: HTMLElement): void {
  const block = (el: HTMLElement): HTMLElement | null => el.closest('.extra');
  const showBlock = block(shown);
  const hideBlock = block(hidden);
  if (showBlock) showBlock.hidden = false;
  if (hideBlock) hideBlock.hidden = true;
}

const overviewFixture = (state: () => SharedInventorySpace | null): HarnessFixture => ({
  content: '',
  apply: (elements) => {
    const { overview, zone } = prepare(elements);
    only(overview, zone);
    const next = state();
    host!.setState(next);
    overview.setState(next);
  },
});

const zoneFixture = (state: () => SharedInventoryZoneState): HarnessFixture => ({
  content: '',
  apply: (elements) => {
    const { overview, zone } = prepare(elements);
    only(zone, overview);
    const next = state();
    host!.setState(next);
    zone.setState(next);
  },
});

export default {
  elements: { extra: [OVERVIEW, ZONE] },
  controls: [
    {
      kind: 'toggle',
      label: 'Host answers ops',
      initial: true,
      apply: (_elements, on) => {
        answering = on;
        host?.setAnswering(on);
      },
    },
    {
      kind: 'select',
      label: 'Refuse the next op',
      options: ['no', 'with an error', 'item not found'],
      apply: (_elements, value) => {
        if (value === 'with an error') host?.failNext('HARNESS_REFUSED');
        if (value === 'item not found') host?.failNext('INVENTORY_ITEM_NOT_FOUND');
      },
    },
  ],
  fixtures: {
    'Example inventory (files only)': overviewFixture(exampleSpace),
    'Example zone: garage': zoneFixture(() => exampleZone('garage')),
    'Example zone: work bench': zoneFixture(() => exampleZone('bench')),
    'Overview: configured, dirty, broken zone': overviewFixture(configuredOverview),
    'Overview: legacy, a seeded zone': overviewFixture(legacyOverview),
    'Overview: just created': overviewFixture(justCreated),
    'Overview: not enabled': overviewFixture(disabledOverview),
    'Overview: invalid manifest': overviewFixture(invalidOverview),
    'Overview: no inventory': overviewFixture(() => null),
    'Zone: configured': zoneFixture(configuredZone),
    'Zone: configured, needs attention': zoneFixture(attentionZone),
    'Zone: legacy': zoneFixture(legacyZone),
    'Zone: read-only file': zoneFixture(readOnlyZone),
    'Zone: parse error': zoneFixture(brokenZone),
    'Zone: empty': zoneFixture(emptyZone),
    'Zone: invalid manifest (neutral)': zoneFixture(neutralZone),
    'Zone: hostile strings': zoneFixture(hostileZone),
  },
} satisfies HarnessFormat;
