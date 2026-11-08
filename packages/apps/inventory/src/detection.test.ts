import { describe, expect, it } from 'vitest';

import { detectInventoryAt } from './detection.js';

import type { TreeNode } from './types.js';

const blob = (path: string): TreeNode => ({ path, type: 'blob', sha: `sha-${path}` });
const tree = (path: string): TreeNode => ({ path, type: 'tree', sha: `sha-${path}` });

// ADR-0025: the space is the manifest an instance points at — there is no
// search for the shallowest manifest any more, so every case anchors a path.
describe('detectInventoryAt', () => {
  it('detects the space, its rooms folder, and sorted zone files', () => {
    const detection = detectInventoryAt('home/inventory.yaml', [
      blob('home/inventory.yaml'),
      tree('home/rooms'),
      blob('home/rooms/kitchen.yaml'),
      blob('home/rooms/attic.yaml'),
    ]);
    expect(detection).toMatchObject({
      manifestPath: 'home/inventory.yaml',
      spacePath: 'home',
      roomsDir: 'home/rooms',
    });
    expect(detection.zones).toEqual([
      { path: 'home/rooms/attic.yaml', slug: 'attic' },
      { path: 'home/rooms/kitchen.yaml', slug: 'kitchen' },
    ]);
  });

  it('handles a repo-root manifest (spacePath is empty)', () => {
    const detection = detectInventoryAt('inventory.yaml', [
      blob('inventory.yaml'),
      blob('rooms/office.yaml'),
    ]);
    expect(detection.spacePath).toBe('');
    expect(detection.zones).toEqual([{ path: 'rooms/office.yaml', slug: 'office' }]);
  });

  it('excludes nested files, non-yaml files, and .yml spellings from zones', () => {
    const detection = detectInventoryAt('inventory.yaml', [
      blob('inventory.yaml'),
      blob('rooms/kitchen.yaml'),
      blob('rooms/closet/box.yaml'),
      blob('rooms/notes.md'),
      blob('rooms/garage.yml'),
      blob('rooms/.yaml'),
    ]);
    expect(detection.zones.map((zone) => zone.slug)).toEqual(['kitchen']);
  });

  it('ignores rooms folders that belong to other directories', () => {
    const detection = detectInventoryAt('home/inventory.yaml', [
      blob('home/inventory.yaml'),
      blob('other/rooms/kitchen.yaml'),
    ]);
    expect(detection.zones).toEqual([]);
  });

  it('enumerates the space even when its manifest is not in the tree (dangling)', () => {
    const detection = detectInventoryAt('home/inventory.yaml', [blob('home/rooms/attic.yaml')]);
    expect(detection.manifestPath).toBe('home/inventory.yaml');
    expect(detection.zones).toEqual([{ path: 'home/rooms/attic.yaml', slug: 'attic' }]);
  });
});

describe('detectInventoryAt with app-only paths (spec inventory_add_room)', () => {
  it('leaves every tree-only result unchanged when the union is empty', () => {
    const nodes = [blob('inventory.yaml'), blob('rooms/kitchen.yaml')];
    expect(detectInventoryAt('inventory.yaml', nodes, [])).toEqual(
      detectInventoryAt('inventory.yaml', nodes)
    );
  });

  it('enumerates a seeded zone that is not in the tree yet', () => {
    const detection = detectInventoryAt(
      'home/inventory.yaml',
      [blob('home/inventory.yaml'), blob('home/rooms/kitchen.yaml')],
      ['home/rooms/attic.yaml']
    );
    expect(detection.zones).toEqual([
      { path: 'home/rooms/attic.yaml', slug: 'attic' },
      { path: 'home/rooms/kitchen.yaml', slug: 'kitchen' },
    ]);
  });

  it('does not double a zone that is now in BOTH the tree and the goods (post-merge)', () => {
    const detection = detectInventoryAt(
      'inventory.yaml',
      [blob('inventory.yaml'), blob('rooms/attic.yaml')],
      ['rooms/attic.yaml']
    );
    expect(detection.zones).toEqual([{ path: 'rooms/attic.yaml', slug: 'attic' }]);
  });

  it('detects a space made ONLY of app-only paths (nothing upstream yet)', () => {
    const detection = detectInventoryAt(
      'inventory.yaml',
      [],
      ['inventory.yaml', 'rooms/attic.yaml']
    );
    expect(detection.manifestPath).toBe('inventory.yaml');
    expect(detection.zones).toEqual([{ path: 'rooms/attic.yaml', slug: 'attic' }]);
  });

  it('applies the same zone-shape rules to app-only paths', () => {
    const detection = detectInventoryAt(
      'inventory.yaml',
      [blob('inventory.yaml')],
      ['rooms/attic.yaml', 'rooms/closet/box.yaml', 'rooms/notes.md', 'other/rooms/shed.yaml']
    );
    expect(detection.zones.map((zone) => zone.slug)).toEqual(['attic']);
  });
});
