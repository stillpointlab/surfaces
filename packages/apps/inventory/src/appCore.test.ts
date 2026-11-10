import { describeAppCore } from '@stillpointlab/common-format/testing/app';

import { inventoryCore } from './core.js';
import { detectInventoryAt, INVENTORY_MANIFEST_FILENAME } from './detection.js';
import { inventoryLifecycle } from './lifecycle.js';
import { parseInventoryManifest } from './manifest.js';
import { parseZoneFile } from './zone.js';
import { zoneSeedContent } from './zoneSeed.js';

import type { AddInventoryItemInput } from './ops.js';
import type { TreeNode } from './types.js';
import type { AppFixture, AppMountResult } from '@stillpointlab/common-format/testing/app';

// The inventory core held to the app core suite (ADR-0028 decision 1: a rewrite
// keeps what a hand-edited file holds), through the contract's round trip: each
// op applied to a fixture, its changes written, and the view projected again.
// Fixture folders are inventories with the manifest at the root; files the app
// does not recognise stay beside them.

const v2Minimal = {
  'inventory.yaml': 'version: 2\n',
  'rooms/garage.yaml': [
    'label: Garage',
    'items:',
    '  - id: cordless-drill',
    '    title: Cordless drill',
    '  - id: ladder',
    '    title: Ladder',
    '',
  ].join('\n'),
};

const v2Configured = {
  'inventory.yaml': [
    '# Workshop assets, kept by hand and by the app.',
    'version: 2',
    'label: Workshop assets',
    'fields:',
    '  - id: owner',
    '    label: Owner',
    '    type: text',
    '    required: true',
    '  # what it would cost to replace today',
    '  - id: replacement-value',
    '    label: Replacement value',
    '    type: number',
    '    format:',
    '      kind: currency',
    '      currency: CAD',
    '      decimalPlaces: 2',
    '  - id: quantity',
    '    label: Quantity',
    '    type: number',
    'total:',
    '  field: replacement-value',
    '  multiplyBy: quantity',
    '',
  ].join('\n'),
  'rooms/workshop.yaml': [
    '# The bench and the wall rack.',
    'label: Workshop',
    'items:',
    '  - id: cordless-drill',
    '    title: Cordless drill',
    '    # bought with the spare batteries',
    '    owner: Sam',
    '    replacement-value: 129.95',
    '    quantity: 2',
    '  - id: bench-vise',
    '    title: Bench vise',
    '    owner: Sam',
    '    replacement-value: 89',
    '    quantity: 1',
    '# Next: the lathe.',
    '',
  ].join('\n'),
  // A zone as "Add zone" seeds it: a label and no items yet.
  'rooms/attic.yaml': zoneSeedContent('Attic'),
  // Not the app's files: ignored, and the folder still mounts.
  'notes.md': 'Insurance renewal is in March.\n',
  'rooms/README.txt': 'One YAML file per zone.\n',
};

const v1 = {
  'inventory.yaml': [
    'version: 1',
    'label: Home',
    'currency: USD',
    'fields:',
    '  - id: brand',
    '    label: Brand',
    '    type: text',
    '',
  ].join('\n'),
  'rooms/kitchen.yaml': [
    'label: Kitchen',
    'items:',
    '  # the espresso corner',
    '  - id: espresso-machine',
    '    title: Rancilio Silvia',
    '    value: 545',
    '    brand: Rancilio',
    '  - id: kettle',
    '    title: Kettle',
    '    value: 40',
    '',
  ].join('\n'),
};

/** Mount the way Context Manager's inventory lifecycle derives the scope. */
function mount(files: AppFixture, manifestPath: string): AppMountResult {
  const parsed = parseInventoryManifest(files[manifestPath] ?? '');
  if (!parsed.ok) return { ok: false, errors: parsed.details };
  const nodes: TreeNode[] = Object.keys(files).map((path) => ({ path, type: 'blob' }));
  const detection = detectInventoryAt(manifestPath, nodes);
  return {
    ok: true,
    scope: [manifestPath, ...detection.zones.map((zone) => zone.path)],
    warnings: parsed.warnings,
  };
}

/** A written file reads back: a zone file as a zone, the manifest as a manifest. */
const reparses = (path: string, text: string): boolean =>
  path.endsWith(INVENTORY_MANIFEST_FILENAME)
    ? parseInventoryManifest(text).ok
    : parseZoneFile(text).ok;

const lamp: AddInventoryItemInput = {
  title: 'Arc lamp',
  fieldValues: { owner: 'Alex', 'replacement-value': 120 },
};

// appendItem at the end of a file always ends it with a line break (CM's "adds
// a newline first" test): a recorded gap, stage 2 follow-ups. `addsFinalNewline`
// marks the ops that append there.
describeAppCore('inventory', {
  manifest: 'inventory.yaml',
  lifecycle: inventoryLifecycle,
  fixtures: { 'v2 minimal': v2Minimal, 'v2 configured': v2Configured, v1 },
  mount,
  core: {
    core: inventoryCore,
    facts: { enabled: true, dirty: [] },
    reparses,
    ops: [
      {
        name: 'add an item',
        fixture: 'v2 configured',
        op: { type: 'add-item', path: 'rooms/workshop.yaml', item: lamp },
        view: { type: 'zone', slug: 'workshop' },
      },
      {
        name: 'edit an item',
        fixture: 'v2 configured',
        op: {
          type: 'update-item',
          path: 'rooms/workshop.yaml',
          id: 'cordless-drill',
          changes: { fieldValues: { owner: 'Alex', 'replacement-value': 140 } },
        },
        view: { type: 'zone', slug: 'workshop' },
      },
      {
        name: 'delete an item',
        fixture: 'v2 configured',
        op: { type: 'delete-item', path: 'rooms/workshop.yaml', id: 'bench-vise' },
        view: { type: 'zone', slug: 'workshop' },
      },
      {
        name: 'add the first item to an added zone',
        fixture: 'v2 configured',
        op: { type: 'add-item', path: 'rooms/attic.yaml', item: lamp },
        view: { type: 'zone', slug: 'attic' },
        addsFinalNewline: true,
      },
      {
        name: 'add a zone',
        fixture: 'v2 configured',
        op: { type: 'add-zone', title: 'Loft: east end' },
        view: { type: 'space' },
      },
      {
        name: 'add an item to a minimal inventory',
        fixture: 'v2 minimal',
        op: { type: 'add-item', path: 'rooms/garage.yaml', item: { title: 'Rake' } },
        view: { type: 'zone', slug: 'garage' },
        addsFinalNewline: true,
      },
      {
        name: 'edit a v1 item',
        fixture: 'v1',
        op: {
          type: 'update-item',
          path: 'rooms/kitchen.yaml',
          id: 'espresso-machine',
          changes: { value: 600 },
        },
        view: { type: 'zone', slug: 'kitchen' },
      },
      {
        name: 'add a v1 item',
        fixture: 'v1',
        op: { type: 'add-item', path: 'rooms/kitchen.yaml', item: { title: 'Toaster', value: 35 } },
        view: { type: 'zone', slug: 'kitchen' },
        addsFinalNewline: true,
      },
    ],
  },
});
