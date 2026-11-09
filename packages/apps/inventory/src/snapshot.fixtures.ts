/**
 * Inventory files the rule tests share, moved with those tests from Context
 * Manager's `inventory.service.test.ts`: a legacy space (a manifest with one
 * declared field, a kitchen and an office) and a configured manifest and
 * kitchen. `snapshotOf` turns a file set into the snapshot a host would hand
 * the core; `applyChanges` writes an op's answer back, as a host would.
 */
import type { InventorySnapshot } from './space.js';
import type { FileChange } from '@stillpointlab/common-format/app';

export const MANIFEST = [
  'version: 1',
  'label: Maple St House',
  'currency: USD',
  'fields:',
  '  - id: condition',
  '    label: Condition',
].join('\n');

export const KITCHEN = [
  'label: Kitchen',
  'items:',
  '  - id: espresso-machine',
  '    title: Rancilio Silvia',
  '    value: 545',
  '    condition: good',
  '  - id: mugs',
  '    title: Diner mugs',
  '    quantity: 6',
  '    value: 8',
  '  - id: mystery',
  '    title: Unpriced thing',
].join('\n');

export const OFFICE = [
  'label: Office',
  'items:',
  '  - id: desk',
  '    title: Desk',
  '    value: 100',
].join('\n');

export const CONFIGURED_MANIFEST = [
  'version: 2',
  'label: Workshop',
  'fields:',
  '  - id: owner',
  '    label: Owner',
  '    type: text',
  '    required: true',
  '  - id: amount',
  '    label: Replacement value',
  '    type: number',
  '    format:',
  '      kind: currency',
  '      currency: CAD',
  '      decimalPlaces: 2',
  '  - id: quantity',
  '    label: Quantity',
  '    type: number',
  '  - id: locked',
  '    label: Locked',
  '    type: text',
  '    visibility:',
  '      add: false',
  '      edit: false',
  'total:',
  '  field: amount',
  '  multiplyBy: quantity',
].join('\n');

export const CONFIGURED_KITCHEN = [
  'label: Kitchen',
  'items:',
  '  - id: lathe',
  '    title: Lathe',
  '    owner: Jamie',
  '    amount: 12.345',
  '    quantity: 2',
  '    locked: source-only',
  '    location: bench',
  '  - id: spare',
  '    title: Spare',
  '    owner: Morgan',
  '    amount: wrong',
  '    quantity: 0',
].join('\n');

/** The legacy space at the repository root. */
export const HOUSE: Record<string, string | null> = {
  'inventory.yaml': MANIFEST,
  'rooms/kitchen.yaml': KITCHEN,
  'rooms/office.yaml': OFFICE,
};

/** A snapshot of these files, every one visible, anchored at `manifestPath`. */
export function snapshotOf(
  files: Record<string, string | null>,
  options: { manifestPath?: string; paths?: string[]; taken?: string[] } = {}
): InventorySnapshot {
  return {
    manifestPath: options.manifestPath ?? 'inventory.yaml',
    paths: options.paths ?? Object.keys(files),
    files,
    ...(options.taken !== undefined ? { taken: options.taken } : {}),
  };
}

/** The snapshot after a host writes an op's changes. */
export function applyChanges(
  snapshot: InventorySnapshot,
  changes: readonly FileChange[]
): InventorySnapshot {
  const files: Record<string, string | null> = { ...snapshot.files };
  let paths = [...snapshot.paths];
  for (const change of changes) {
    if (change.kind === 'move') {
      delete files[change.from];
      paths = paths.filter((path) => path !== change.from);
    }
    files[change.path] = change.content;
    if (!paths.includes(change.path)) paths.push(change.path);
  }
  return { ...snapshot, paths, files };
}

/** No host facts: a clean space nobody enabled. */
export const NO_FACTS = { enabled: false, dirty: [] } as const;
