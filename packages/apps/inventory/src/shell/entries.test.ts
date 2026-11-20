// @vitest-environment jsdom
/// <reference lib="dom" />
import { describe, expect, it, vi } from 'vitest';

// The root entry is the DOM-free core: importing it evaluates none of the
// elements or the shell and registers nothing. `./shell` registers the shell and
// the two elements it lays out, and not the create form.

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./inventory-app.js', async (load) => {
  evaluated.add('shell');
  return load();
});
vi.mock('../element/inventory-overview.js', async (load) => {
  evaluated.add('overview');
  return load();
});
vi.mock('../element/inventory-zone.js', async (load) => {
  evaluated.add('zone');
  return load();
});
vi.mock('@stillpointlab/spl-icon-component', async (load) => {
  evaluated.add('spl-icon');
  return load();
});

const TAGS = ['spl-inventory-app', 'spl-inventory-overview', 'spl-inventory-zone'];

// One sequence, in order: the module registry is shared by the file.
describe('the root and ./shell entries', () => {
  it('the root entry loads no DOM code and registers no element', async () => {
    const root = await import('../index.js');

    expect(root.inventoryModule.id).toBe('inventory');
    expect([...evaluated]).toEqual([]);
    for (const tag of TAGS) expect(customElements.get(tag)).toBeUndefined();
  });

  it('`./shell` registers the shell and its two elements, not the create form', async () => {
    const shell = await import('./index.js');

    expect(customElements.get('spl-inventory-app')).toBe(shell.InventoryApp);
    expect(customElements.get('spl-inventory-overview')).toBeDefined();
    expect(customElements.get('spl-inventory-zone')).toBeDefined();
    expect(customElements.get('spl-inventory-create')).toBeUndefined();
    expect([...evaluated].sort()).toEqual(['overview', 'shell', 'spl-icon', 'zone']);
  });
});
