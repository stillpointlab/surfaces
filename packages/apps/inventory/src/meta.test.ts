import { describe, expect, it, vi } from 'vitest';

// The `./meta` entry loads no zod and none of the core: a host page that lists
// the apps imports it (the `./paths` precedent).

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

describe('the ./meta entry', () => {
  it('loads neither zod nor the core', async () => {
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
