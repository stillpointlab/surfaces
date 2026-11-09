// The inventory elements in the surfaces harness (`npm run dev`). Both elements
// are mounted; a fixture shows the one it fills and hides the other. The
// example fixtures run on the core: an in-memory host holds the examples'
// files, answers the elements' ops with the core's rules and re-projects, so
// an edit shows on every example fixture until the page reloads. The
// hand-built fixtures show cases the examples do not (a disabled space, local
// changes, hostile strings); their ops are refused. The controls switch the
// host off (every op unhandled) or make it refuse the next op. Requests and
// notifications show in the event log. Links are `#` anchors: the zone, export
// and editor URLs belong to a host.
import '../src/element/index.js';
import './host.css';

import { exampleSnapshot } from './example.js';
import { attachHost, spaceOf, workspace, zoneOf } from './host.js';
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

import type { HarnessHost, Workspace } from './host.js';
import type {
  HarnessElements,
  HarnessFixture,
  HarnessFormat,
} from '../../../../tooling/harness/types';
import type { InventoryLinks, InventoryOverview, InventoryZone } from '../src/element/index.js';
import type { SharedInventoryZoneState, SharedInventorySpace } from '../src/types.js';

const OVERVIEW = 'spl-inventory-overview';
const ZONE = 'spl-inventory-zone';

/** The manifests and the workshop's garage are "linked": the rest ask `link-editor`. */
const LINKS: InventoryLinks = {
  zone: (path) => `#zone:${path}`,
  exportAll: () => '#export.zip',
  exportZone: (path) => `#export:${path}.csv`,
  editor: (path) =>
    path.endsWith('inventory.yaml') || path.endsWith('garage.yaml') ? `#editor:${path}` : undefined,
};

/** The examples' files, kept for the page's life so edits carry across fixtures. */
const WORKSPACES = {
  workshop: workspace(exampleSnapshot('workshop')),
  house: workspace(exampleSnapshot('house')),
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

const overviewFixture = (
  state: () => SharedInventorySpace | null,
  ws: Workspace | null = null
): HarnessFixture => ({
  content: '',
  apply: (elements) => {
    const { overview, zone } = prepare(elements);
    only(overview, zone);
    host!.use(ws);
    overview.setState(state());
  },
});

const zoneFixture = (
  state: () => SharedInventoryZoneState,
  ws: Workspace | null = null
): HarnessFixture => ({
  content: '',
  apply: (elements) => {
    const { overview, zone } = prepare(elements);
    only(zone, overview);
    host!.use(ws);
    zone.setState(state());
  },
});

/** An example's overview, projected by the core from its files. */
const exampleOverview = (ws: Workspace): HarnessFixture => overviewFixture(() => spaceOf(ws), ws);

/** One of an example's zones, by its file's path. */
const exampleZone = (ws: Workspace, path: string): HarnessFixture =>
  zoneFixture(() => zoneOf(ws, path)!, ws);

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
    'Example workshop (configured)': exampleOverview(WORKSPACES.workshop),
    'Example workshop: garage': exampleZone(WORKSPACES.workshop, 'workshop/rooms/garage.yaml'),
    'Example workshop: work bench': exampleZone(WORKSPACES.workshop, 'workshop/rooms/bench.yaml'),
    'Example house (legacy)': exampleOverview(WORKSPACES.house),
    'Example house: kitchen': exampleZone(WORKSPACES.house, 'rooms/kitchen.yaml'),
    'Example house: office, needs attention': exampleZone(WORKSPACES.house, 'rooms/office.yaml'),
    'Example house: attic, read-only file': exampleZone(WORKSPACES.house, 'rooms/attic.yaml'),
    'Example house: cellar, parse error': exampleZone(WORKSPACES.house, 'rooms/cellar.yaml'),
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
