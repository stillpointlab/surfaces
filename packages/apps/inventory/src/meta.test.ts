import { describe, expect, it, vi } from 'vitest';

// The `./meta` entry loads no zod, none of the core and none of the naming
// rules in `./paths`: a host page that lists the apps imports it, and in a host
// whose every page does, whatever it loads is on every page.

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('zod', async (load) => {
  evaluated.add('zod');
  return load();
});
vi.mock('./manifest.js', async (load) => {
  evaluated.add('manifest');
  return load();
});
vi.mock('./core.js', async (load) => {
  evaluated.add('core');
  return load();
});
vi.mock('./paths.js', async (load) => {
  evaluated.add('paths');
  return load();
});

describe('the ./meta entry', () => {
  it('loads neither zod, the core nor the naming rules', async () => {
    const { inventoryMeta } = await import('./meta.js');

    expect(inventoryMeta.label).toBe('Inventory');
    expect(inventoryMeta.create).toMatchObject({ noun: 'an inventory', subject: 'Inventory' });
    expect([...evaluated]).toEqual([]);
  });

  it('is the module’s meta', async () => {
    const { inventoryMeta } = await import('./meta.js');
    const { inventoryModule } = await import('./module.js');

    expect(inventoryModule.meta).toBe(inventoryMeta);
    expect(evaluated).toContain('zod');
  });
});
