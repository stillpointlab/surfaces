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
//
// "Shell over the memory host" is the app as a page: `<spl-inventory-app>` over
// the example workshop, under a fragment base as the local host mounts it. The
// fixture is the host's client half: it answers the shell's ops (host.ts),
// resolves a `navigate` through the module's pages and sets the shell's input,
// and reads the view again on `reload-request`.
import '../src/element/index.js';
import '../src/element/create.js';
import '../src/shell/index.js';
import './host.css';

import { matchAppPage } from '@stillpointlab/common-format/app';

import { answerCreate, CREATE_TARGETS } from '../../../../tooling/harness/create-host';
import { inventoryCore } from '../src/core.js';
import { inventoryModule } from '../src/module.js';

import { exampleSnapshot } from './example.js';
import { attachHost, createdWorkspace, projectView, spaceOf, workspace, zoneOf } from './host.js';
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
import type { InventoryCreate } from '../src/element/create.js';
import type { InventoryLinks, InventoryOverview, InventoryZone } from '../src/element/index.js';
import type { InventoryApp, InventoryExports } from '../src/shell/index.js';
import type { SharedInventoryZoneState, SharedInventorySpace } from '../src/types.js';
import type { AppShellInput } from '@stillpointlab/common-format/app';

const OVERVIEW = 'spl-inventory-overview';
const ZONE = 'spl-inventory-zone';
const CREATE = 'spl-inventory-create';
const SHELL = 'spl-inventory-app';

/** Where the shell's pages hang: a fragment, as the local host mounts an app. */
const SHELL_BASE = '#/app/workshop/inventory.yaml';

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
let shellExports = false;
let shellPage: Pick<AppShellInput, 'view' | 'state'> | null = null;
let shellWired = false;

function prepare(elements: HarnessElements): {
  overview: InventoryOverview;
  zone: InventoryZone;
  create: InventoryCreate;
  shell: InventoryApp;
} {
  const overview = elements.extras[OVERVIEW] as InventoryOverview;
  const zone = elements.extras[ZONE] as InventoryZone;
  const create = elements.extras[CREATE] as InventoryCreate;
  const shell = elements.extras[SHELL] as InventoryApp;
  for (const el of [overview, zone]) el.links = LINKS;
  for (const el of [overview, zone, shell]) {
    const pane = el.parentElement;
    pane?.classList.add('inventory-harness');
    if (pane) pane.style.height = 'auto';
  }
  host ??= attachHost([overview, zone], shell);
  if (!shellWired) {
    shellWired = true;
    shell.addEventListener('navigate', (event) => followLink(shell, event as CustomEvent));
    shell.addEventListener('reload-request', () => void readAgain(shell));
  }
  host.setAnswering(answering);
  if (create.parentElement) create.parentElement.style.height = 'auto';
  // The create form is answered by the core's seed, like a host's create endpoint.
  stopCreate ??= answerCreate<InventoryCreateFields>(create, {
    seed: (input) => inventoryCore.seed(input),
    target: () => createTarget,
    created: (plan) => {
      const ws = createdWorkspace(plan);
      host!.use(ws);
      only(overview, zone, create, shell);
      overview.setState(spaceOf(ws));
    },
  });
  return { overview, zone, create, shell };
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

// ---- The shell, as a host's client half drives it ---------------------------

const SHELL_WORKSPACE = (): Workspace => WORKSPACES.workshop;

/** The exports a host offers, when the control says it has them. */
const EXPORTS: InventoryExports = {
  all: '#export.zip',
  zone: (path) => `#export:${path}.csv`,
};

/** Set the shell's input for a page: the overview leads back to a stand-in project page. */
function showPage(shell: InventoryApp, page: Pick<AppShellInput, 'view' | 'state'>): void {
  shellPage = page;
  shell.setState({
    base: SHELL_BASE,
    back: { href: '#project', label: 'Back to project' },
    location: 'examples/workshop',
    ...page,
    ...(shellExports ? { extras: { exports: EXPORTS } } : {}),
  });
}

/** Resolve a sub-path of the shell's base through the module's pages, as a host's router does. */
async function open(shell: InventoryApp, href: string): Promise<void> {
  const [subPath = '', query = ''] = href.slice(SHELL_BASE.length).split('?');
  const matched = matchAppPage(inventoryModule.pages!, subPath);
  const ws = SHELL_WORKSPACE();
  const project = async (view: unknown): Promise<object | null> => {
    const read = projectView(ws, view);
    return read.ok ? read.state : null;
  };
  const resolution = matched
    ? await matched.page.resolve({
        params: matched.params,
        query: Object.fromEntries(new URLSearchParams(query)),
        base: SHELL_BASE,
        manifestPath: ws.snapshot.manifestPath,
        project,
      })
    : { notFound: true as const };
  if ('redirect' in resolution) return open(shell, resolution.redirect);
  if ('notFound' in resolution) {
    notify(shell, `Not found: ${href}`);
    return;
  }
  const state = resolution.view ? await project(resolution.view) : null;
  if (state === null && resolution.view && !matched!.page.emptyWhenMissing) {
    notify(shell, `Not found: ${href}`);
    return;
  }
  showPage(shell, { view: resolution.view, state });
}

/** A followed link under the base is the host's: claim it and open the page. */
function followLink(shell: InventoryApp, event: CustomEvent<{ href: string }>): void {
  const { href } = event.detail;
  if (!href.startsWith(SHELL_BASE)) return;
  event.preventDefault();
  void open(shell, href);
}

/** `reload-request`: read the view on screen again. */
async function readAgain(shell: InventoryApp): Promise<void> {
  if (!shellPage?.view) return;
  const read = projectView(SHELL_WORKSPACE(), shellPage.view);
  if (read.ok) showPage(shell, { view: shellPage.view, state: read.state });
}

/** A note in the harness's event log, as a host's banner would show it. */
function notify(shell: InventoryApp, message: string): void {
  shell.dispatchEvent(
    new CustomEvent('notification', { detail: { message, type: 'warning' }, bubbles: true })
  );
}

const overviewFixture = (
  state: () => SharedInventorySpace | null,
  ws: Workspace | null = null
): HarnessFixture => ({
  content: '',
  apply: (elements) => {
    const { overview, zone, create, shell } = prepare(elements);
    only(overview, zone, create, shell);
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
    const { overview, zone, create, shell } = prepare(elements);
    only(zone, overview, create, shell);
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
  elements: { extra: [OVERVIEW, ZONE, CREATE, SHELL] },
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
      kind: 'toggle',
      label: 'Shell: host offers exports',
      initial: false,
      apply: (elements, on) => {
        shellExports = on;
        const shell = elements.extras[SHELL] as InventoryApp | undefined;
        if (shell && shellPage) showPage(shell, shellPage);
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
        const { overview, zone, create, shell } = prepare(elements);
        only(create, overview, zone, shell);
        create.setState({});
      },
    },
    'Shell over the memory host': {
      content: '',
      apply: (elements) => {
        const { overview, zone, create, shell } = prepare(elements);
        only(shell, overview, zone, create);
        host!.use(SHELL_WORKSPACE());
        void open(shell, SHELL_BASE);
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
