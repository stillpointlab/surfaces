// The inventory elements in the surfaces harness (`npm run dev`). The three
// elements are mounted; a fixture shows the one it fills and hides the others. The
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

import { answerCreate, CREATE_TARGETS } from '../../../../tooling/harness/create-host';
import { inventoryCore } from '../src/core.js';

import { exampleSnapshot } from './example.js';
import { attachHost, createdWorkspace, spaceOf, workspace, zoneOf } from './host.js';
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
import type { InventoryCreateFields } from '../src/createRules.js';
import type {
  InventoryCreate,
  InventoryLinks,
  InventoryOverview,
  InventoryZone,
} from '../src/element/index.js';
import type { SharedInventoryZoneState, SharedInventorySpace } from '../src/types.js';

const OVERVIEW = 'spl-inventory-overview';
const ZONE = 'spl-inventory-zone';
const CREATE = 'spl-inventory-create';

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
let createTarget = CREATE_TARGETS['a folder']!;
let stopCreate: (() => void) | null = null;

function prepare(elements: HarnessElements): {
  overview: InventoryOverview;
  zone: InventoryZone;
  create: InventoryCreate;
} {
  const overview = elements.extras[OVERVIEW] as InventoryOverview;
  const zone = elements.extras[ZONE] as InventoryZone;
  const create = elements.extras[CREATE] as InventoryCreate;
  for (const el of [overview, zone]) {
    el.links = LINKS;
    const pane = el.parentElement;
    pane?.classList.add('inventory-harness');
    if (pane) pane.style.height = 'auto';
  }
  host ??= attachHost([overview, zone]);
  host.setAnswering(answering);
  if (create.parentElement) create.parentElement.style.height = 'auto';
  // The create form is answered by the core's seed, like a host's create endpoint.
  stopCreate ??= answerCreate<InventoryCreateFields>(create, {
    seed: (input) => inventoryCore.seed(input),
    target: () => createTarget,
    created: (plan) => {
      const ws = createdWorkspace(plan);
      host!.use(ws);
      only(overview, zone, create);
      overview.setState(spaceOf(ws));
    },
  });
  return { overview, zone, create };
}

/** Show one element's block and hide the others'. */
function only(shown: HTMLElement, ...hidden: HTMLElement[]): void {
  const block = (el: HTMLElement): HTMLElement | null => el.closest('.extra');
  const showBlock = block(shown);
  if (showBlock) showBlock.hidden = false;
  for (const el of hidden) {
    const hideBlock = block(el);
    if (hideBlock) hideBlock.hidden = true;
  }
}

const overviewFixture = (
  state: () => SharedInventorySpace | null,
  ws: Workspace | null = null
): HarnessFixture => ({
  content: '',
  apply: (elements) => {
    const { overview, zone, create } = prepare(elements);
    only(overview, zone, create);
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
    const { overview, zone, create } = prepare(elements);
    only(zone, overview, create);
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
  elements: { extra: [OVERVIEW, ZONE, CREATE] },
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
    {
      kind: 'select',
      label: 'Create in',
      options: ['a folder', 'the repository root'],
      apply: (_elements, value) => {
        createTarget = CREATE_TARGETS[value] ?? createTarget;
      },
    },
  ],
  fixtures: {
    Create: {
      content: '',
      apply: (elements) => {
        const { overview, zone, create } = prepare(elements);
        only(create, overview, zone);
        create.setState({});
      },
    },
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
