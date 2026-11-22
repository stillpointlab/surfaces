import { describe, expect, it } from 'vitest';

import { inventoryFromChanges } from './changes.js';
import { HOUSE, snapshotOf } from './snapshot.fixtures.js';
import { projectInventorySpace } from './space.js';

const SPACE = {
  'home/inventory.yaml': HOUSE['inventory.yaml'],
  'home/rooms/kitchen.yaml': HOUSE['rooms/kitchen.yaml'],
  'home/rooms/office.yaml': HOUSE['rooms/office.yaml'],
  'home/notes.md': 'Not the app’s.\n',
  'other/inventory.yaml': 'version: 2\n',
};
const snapshot = snapshotOf(SPACE, { manifestPath: 'home/inventory.yaml' });

describe('inventoryFromChanges', () => {
  it('answers an enabled space with nothing dirty over no changes', () => {
    expect(inventoryFromChanges([], snapshot)).toEqual({ facts: { enabled: true, dirty: [] } });
  });

  it('marks the changed and new files that are the manifest or a zone, in the space’s order', () => {
    const { facts } = inventoryFromChanges(
      [
        { path: 'home/rooms/office.yaml', status: 'new' },
        { path: 'home/notes.md', status: 'changed' },
        { path: 'home/inventory.yaml', status: 'changed' },
        { path: 'other/inventory.yaml', status: 'changed' },
        { path: 'home/rooms/kitchen.yaml', status: 'changed' },
      ],
      snapshot
    );
    expect(facts.dirty).toEqual([
      { path: 'home/inventory.yaml', kind: 'manifest' },
      { path: 'home/rooms/kitchen.yaml', kind: 'zone' },
      { path: 'home/rooms/office.yaml', kind: 'zone', newFile: true },
    ]);
  });

  it('marks a moved zone or manifest with the path it had, and leaves out a deleted file', () => {
    const { facts } = inventoryFromChanges(
      [
        { path: 'home/rooms/kitchen.yaml', status: 'moved', from: 'home/rooms/galley.yaml' },
        { path: 'home/inventory.yaml', status: 'moved', from: 'house/inventory.yaml' },
        { path: 'home/rooms/pantry.yaml', status: 'deleted' },
        // Not the app's: a moved file beside it.
        { path: 'home/notes.md', status: 'moved', from: 'home/old-notes.md' },
      ],
      snapshot
    );
    expect(facts.dirty).toEqual([
      { path: 'home/inventory.yaml', kind: 'manifest', movedFrom: 'house/inventory.yaml' },
      { path: 'home/rooms/kitchen.yaml', kind: 'zone', movedFrom: 'home/rooms/galley.yaml' },
    ]);
  });

  it('answers facts the overview shows', () => {
    const known = inventoryFromChanges(
      [{ path: 'home/rooms/kitchen.yaml', status: 'changed' }],
      snapshot
    );
    expect(known.snapshot).toBeUndefined();
    expect(projectInventorySpace(snapshot, known.facts)).toMatchObject({
      enabled: true,
      dirty: [{ path: 'home/rooms/kitchen.yaml', kind: 'zone' }],
    });
  });
});
