// Importing the root entry defines no element and evaluates no element module:
// it is the document codec, the selection model and the presentation rules. The
// elements' classes are exported as types only; `./editor`, `./grid` and
// `./preview` define the elements.
import { describe, expect, it, vi } from 'vitest';

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./editor/sheet-editor', async (load) => {
  evaluated.add('sheet-editor');
  return load();
});
vi.mock('./grid/sheet-grid', async (load) => {
  evaluated.add('sheet-grid');
  return load();
});
vi.mock('./preview/sheet-preview', async (load) => {
  evaluated.add('sheet-preview');
  return load();
});

describe('sheet-format root entry', () => {
  it('defines no element and evaluates no element module', async () => {
    const root = await import('./index');

    for (const tag of ['sheet-editor', 'sheet-grid', 'sheet-preview']) {
      expect(customElements.get(tag), tag).toBeUndefined();
    }
    expect([...evaluated]).toEqual([]);
    for (const name of ['SheetEditor', 'SheetGrid', 'SheetPreview']) {
      expect(root, name).not.toHaveProperty(name);
    }
    expect(root).toHaveProperty('parseSheetDocument');
  });
});
