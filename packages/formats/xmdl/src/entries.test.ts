// Importing the `./format` entry defines no element and evaluates no element
// module or parser; its `load()` is the `./preview` or `./editor` entry itself, so
// an element is never defined twice.
import { describe, expect, it, vi } from 'vitest';

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./preview/xmdl-preview', async (load) => {
  evaluated.add('xmdl-preview');
  return load();
});
vi.mock('./editor/xmdl-editor', async (load) => {
  evaluated.add('xmdl-editor');
  return load();
});
vi.mock('./parser/parse', async (load) => {
  evaluated.add('parse');
  return load();
});
vi.mock('yaml', async (load) => {
  evaluated.add('yaml');
  return load();
});
vi.mock('zod', async (load) => {
  evaluated.add('zod');
  return load();
});

// One sequence, in order: the module registry is shared by the file.
describe('xmdl-format ./format entry', () => {
  it('defines no element and evaluates no element module or parser', async () => {
    await import('./format');

    expect(customElements.get('xmdl-preview')).toBeUndefined();
    expect(customElements.get('xmdl-editor')).toBeUndefined();
    expect([...evaluated]).toEqual([]);
  });

  it('loads the ./preview and ./editor entries themselves', async () => {
    const { xmdlFormat } = await import('./format');

    expect(await xmdlFormat.preview.load()).toBe(await import('./preview/index'));
    expect(await xmdlFormat.editor?.load()).toBe(await import('./editor/index'));
    expect(evaluated).toContain('xmdl-preview');
    expect(evaluated).toContain('parse');
  });
});
