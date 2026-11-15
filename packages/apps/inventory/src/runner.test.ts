// The inventory module on common's runner over a port in memory: what a host
// that knows only files (the harness, the local host) runs. The host's facts
// are the module's `fromChanges` over the port's changes.
import {
  createInstance,
  createMemoryPort,
  hostRefusalClass,
  projectView,
  runOp,
} from '@stillpointlab/common-format/host';
import { describe, expect, it } from 'vitest';

import { inventoryModule } from './module.js';
import {
  CONFIGURED_KITCHEN,
  CONFIGURED_MANIFEST,
  KITCHEN,
  MANIFEST,
  OFFICE,
} from './snapshot.fixtures.js';

import type { SharedInventorySpace, SharedInventoryZoneState } from './types.js';
import type { AnyAppModule } from '@stillpointlab/common-format/app';
import type { LoadedInstance, MemoryPort, RunnerHost } from '@stillpointlab/common-format/host';

const module = inventoryModule as AnyAppModule;
const NOW = '2026-11-14T12:00:00.000Z';

/** The legacy house at the root, and a configured workshop in a folder. */
const FILES: Record<string, string> = {
  'inventory.yaml': MANIFEST,
  'rooms/kitchen.yaml': KITCHEN,
  'rooms/office.yaml': OFFICE,
};
const WORKSHOP: Record<string, string> = {
  'README.md': 'The repository.\n',
  'workshop/inventory.yaml': CONFIGURED_MANIFEST,
  'workshop/rooms/kitchen.yaml': CONFIGURED_KITCHEN,
};

function hostOver(
  files: Record<string, string>,
  before?: (port: MemoryPort) => Promise<void>
): RunnerHost & { port: MemoryPort } {
  const port = createMemoryPort(files);
  return {
    port,
    know: async (m: AnyAppModule, loaded: LoadedInstance) => {
      if (before) await before(port);
      return m.fromChanges(port.changes(), loaded.snapshot);
    },
    now: () => NOW,
  };
}

describe('inventory on the runner', () => {
  it('adds a zone: a new file, shown dirty and new on the space it answers', async () => {
    const host = hostOver(FILES);
    const answer = await runOp(host, module, 'inventory.yaml', {
      op: { type: 'add-zone', title: 'Garage' },
    });
    if (!answer.ok) throw new Error(answer.message);
    const space = (answer.reply as { space: SharedInventorySpace }).space;
    expect(space.zones.map((zone) => zone.path)).toContain('rooms/garage.yaml');
    expect(space.dirty).toEqual([{ path: 'rooms/garage.yaml', kind: 'zone', newFile: true }]);
    expect(host.port.changes()).toEqual([{ path: 'rooms/garage.yaml', status: 'new' }]);
    expect(typeof answer.revision).toBe('string');
  });

  it('adds an item: the zone rewritten at its base, its state answered', async () => {
    const host = hostOver(WORKSHOP);
    const answer = await runOp(host, module, 'workshop/inventory.yaml', {
      op: {
        type: 'add-item',
        path: 'workshop/rooms/kitchen.yaml',
        item: { title: 'Kettle', fieldValues: { owner: 'Jamie' } },
      },
    });
    if (!answer.ok) throw new Error(answer.message);
    const state = (answer.reply as { state: SharedInventoryZoneState }).state;
    expect(JSON.stringify(state)).toContain('Kettle');
    expect(host.port.changes()).toEqual([
      { path: 'workshop/rooms/kitchen.yaml', status: 'changed', base: CONFIGURED_KITCHEN },
    ]);
  });

  it('projects the space with the files that changed as its dirty set', async () => {
    const host = hostOver(FILES);
    const before = await projectView(host, module, 'inventory.yaml', { type: 'space' });
    expect(before.ok && (before.state as SharedInventorySpace).dirty).toEqual([]);
    await host.port.put([{ kind: 'write', path: 'rooms/office.yaml', content: `${OFFICE}\n` }]);
    const after = await projectView(host, module, 'inventory.yaml', { type: 'space' });
    expect(after.ok && (after.state as SharedInventorySpace).dirty).toEqual([
      { path: 'rooms/office.yaml', kind: 'zone' },
    ]);
    expect(after.ok && before.ok && after.revision !== before.revision).toBe(true);
  });

  it('answers a zone the space does not have as null', async () => {
    const answer = await projectView(hostOver(FILES), module, 'inventory.yaml', {
      type: 'zone',
      slug: 'attic',
    });
    expect(answer).toMatchObject({ ok: true, state: null });
  });

  it('answers a zone changed under the op as a conflict, and writes nothing', async () => {
    let once = false;
    const host = hostOver(FILES, async (port) => {
      if (once) return;
      once = true;
      await port.put([{ kind: 'write', path: 'rooms/kitchen.yaml', content: `${KITCHEN}\n` }]);
    });
    const answer = await runOp(host, module, 'inventory.yaml', {
      op: { type: 'add-item', path: 'rooms/kitchen.yaml', item: { title: 'Kettle' } },
    });
    expect(answer).toMatchObject({ ok: false, code: 'HOST_FILE_CHANGED' });
    expect(hostRefusalClass('HOST_FILE_CHANGED')).toBe('conflict');
    expect(host.port.files()['rooms/kitchen.yaml']).toBe(`${KITCHEN}\n`);
  });

  it('leaves a manifest the core refuses to the core, as Context Manager does', async () => {
    const host = hostOver({
      ...FILES,
      'inventory.yaml': 'version: 2\nfields: []\ncurrency: USD\n',
    });
    const answer = await runOp(host, module, 'inventory.yaml', {
      op: { type: 'add-item', path: 'rooms/kitchen.yaml', item: { title: 'X' } },
    });
    expect(answer).toMatchObject({ ok: false, code: 'INVENTORY_SCHEMA_INVALID' });
    expect(inventoryModule.refusalClass('INVENTORY_SCHEMA_INVALID', 'add-item')).toBe('conflict');
    const space = await projectView(host, module, 'inventory.yaml', { type: 'space' });
    expect(space.ok && space.state).not.toBeNull();
  });

  it('creates an inventory in a folder, and refuses one that does not fit', async () => {
    const host = hostOver({ 'README.md': 'r' });
    const created = await createInstance(host, module, {
      folder: 'home',
      input: { label: 'Home', zones: ['Garage'] },
    });
    expect(created).toEqual({ ok: true, manifestPath: 'home/inventory.yaml' });
    expect(Object.keys(host.port.files()).sort()).toEqual([
      'README.md',
      'home/inventory.yaml',
      'home/rooms/garage.yaml',
    ]);
    const space = await projectView(host, module, 'home/inventory.yaml', { type: 'space' });
    expect(space.ok && (space.state as SharedInventorySpace).label).toBe('Home');

    const again = await createInstance(host, module, {
      folder: 'home',
      input: { label: 'Home again' },
    });
    expect(again).toMatchObject({ ok: false, code: 'INVENTORY_PATH_EXISTS' });
    expect(Object.keys(host.port.files())).toHaveLength(3);
  });
});
