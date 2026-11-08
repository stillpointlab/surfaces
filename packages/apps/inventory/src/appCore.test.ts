import { describeAppCore } from '@stillpointlab/common-format/testing/app';

import { detectInventoryAt } from './detection.js';
import { inventoryLifecycle } from './lifecycle.js';
import { parseInventoryManifest } from './manifest.js';
import { parseZoneFile } from './zone.js';
import { zoneSeedContent } from './zoneSeed.js';
import { appendItem, deleteItem, patchItem } from './zoneWriter.js';

import type { TreeNode } from './types.js';
import type { NewItemBlock } from './zoneWriter.js';
import type { AppFixture, AppMountResult } from '@stillpointlab/common-format/testing/app';

// The inventory core held to the app core suite (ADR-0028 decision 1: a rewrite
// keeps what a hand-edited file holds). Fixture folders are inventories with
// the manifest at the root; files the app does not recognise stay beside them.

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
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const nodes: TreeNode[] = Object.keys(files).map((path) => ({ path, type: 'blob' }));
  const detection = detectInventoryAt(manifestPath, nodes);
  return {
    ok: true,
    scope: [manifestPath, ...detection.zones.map((zone) => zone.path)],
    warnings: parsed.warnings,
  };
}

function written(result: { ok: true; content: string } | { ok: false }): string {
  if (!result.ok) throw new Error(`the rewrite refused: ${JSON.stringify(result)}`);
  return result.content;
}

const reparses = (text: string): boolean => parseZoneFile(text).ok;

const lamp: NewItemBlock = {
  id: 'lamp',
  title: 'Arc lamp',
  fieldValues: [
    ['owner', 'Alex'],
    ['replacement-value', 120],
  ],
};

describeAppCore('inventory', {
  manifest: 'inventory.yaml',
  lifecycle: inventoryLifecycle,
  fixtures: { 'v2 minimal': v2Minimal, 'v2 configured': v2Configured, v1 },
  mount,
  rewrites: [
    {
      name: 'add an item',
      fixture: 'v2 configured',
      path: 'rooms/workshop.yaml',
      apply: (text) => written(appendItem(text, lamp)),
      reparses,
    },
    {
      name: 'edit an item',
      fixture: 'v2 configured',
      path: 'rooms/workshop.yaml',
      apply: (text) =>
        written(patchItem(text, 'cordless-drill', { owner: 'Alex', 'replacement-value': 140 })),
      reparses,
    },
    {
      name: 'delete an item',
      fixture: 'v2 configured',
      path: 'rooms/workshop.yaml',
      apply: (text) => written(deleteItem(text, 'bench-vise')),
      reparses,
    },
    {
      name: 'add the first item to an added zone',
      fixture: 'v2 configured',
      path: 'rooms/attic.yaml',
      apply: (text) => written(appendItem(text, lamp)),
      reparses,
      // appendItem at the end of the file always ends with a line break (CM's
      // "adds a newline first" test): a recorded gap, stage 2 follow-ups.
      addsFinalNewline: true,
    },
    {
      name: 'add an item to a minimal inventory',
      fixture: 'v2 minimal',
      path: 'rooms/garage.yaml',
      apply: (text) => written(appendItem(text, { id: 'rake', title: 'Rake' })),
      reparses,
      // appendItem at the end of the file always ends with a line break (CM's
      // "adds a newline first" test): a recorded gap, stage 2 follow-ups.
      addsFinalNewline: true,
    },
    {
      name: 'edit a v1 item',
      fixture: 'v1',
      path: 'rooms/kitchen.yaml',
      apply: (text) => written(patchItem(text, 'espresso-machine', { value: 600 })),
      reparses,
    },
    {
      name: 'add a v1 item',
      fixture: 'v1',
      path: 'rooms/kitchen.yaml',
      apply: (text) => written(appendItem(text, { id: 'toaster', title: 'Toaster', value: 35 })),
      reparses,
      // appendItem at the end of the file always ends with a line break (CM's
      // "adds a newline first" test): a recorded gap, stage 2 follow-ups.
      addsFinalNewline: true,
    },
  ],
});
