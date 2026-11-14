// Importing the `./format` entry defines no element and evaluates no element
// module, codec or YAML parser; its `load()` is the `./preview` or `./editor`
// entry itself, so an element is never defined twice.
import { describe, expect, it, vi } from 'vitest';

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./preview/sheet-preview', async (load) => {
  evaluated.add('sheet-preview');
  return load();
});
vi.mock('./editor/sheet-editor', async (load) => {
  evaluated.add('sheet-editor');
  return load();
});
vi.mock('./document', async (load) => {
  evaluated.add('document');
  return load();
});
vi.mock('yaml', async (load) => {
  evaluated.add('yaml');
  return load();
});

// One sequence, in order: the module registry is shared by the file.
describe('sheet-format ./format entry', () => {
  it('defines no element and evaluates no element module, codec or parser', async () => {
    await import('./format');

    expect(customElements.get('sheet-preview')).toBeUndefined();
    expect(customElements.get('sheet-editor')).toBeUndefined();
    expect([...evaluated]).toEqual([]);
  });

  it('loads the ./preview and ./editor entries themselves', async () => {
    const { sheetFormat } = await import('./format');

    expect(await sheetFormat.preview.load()).toBe(await import('./preview/index'));
    expect(await sheetFormat.editor?.load()).toBe(await import('./editor/index'));
    expect(evaluated).toContain('sheet-preview');
    expect(evaluated).toContain('sheet-editor');
  });
});
