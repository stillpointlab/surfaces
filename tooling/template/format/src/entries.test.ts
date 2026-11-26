// Importing the `./format` entry defines no element and evaluates no element
// module; its `load()` is the `./preview` or `./editor` entry itself, so an element
// is never defined twice. A format with an engine (a parser, an editor library)
// mocks it here too, so the entry is kept from loading it.
import { describe, expect, it, vi } from 'vitest';

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./preview/sample-preview', async (load) => {
  evaluated.add('sample-preview');
  return load();
});
vi.mock('./editor/sample-editor', async (load) => {
  evaluated.add('sample-editor');
  return load();
});

// One sequence, in order: the module registry is shared by the file.
describe('sample-format ./format entry', () => {
  it('defines no element and evaluates no element module', async () => {
    await import('./format');

    expect(customElements.get('sample-preview')).toBeUndefined();
    expect(customElements.get('sample-editor')).toBeUndefined();
    expect([...evaluated]).toEqual([]);
  });

  it('loads the ./preview and ./editor entries themselves', async () => {
    const { sampleFormat } = await import('./format');

    expect(await sampleFormat.preview.load()).toBe(await import('./preview/index'));
    expect(await sampleFormat.editor?.load()).toBe(await import('./editor/index'));
    expect(evaluated).toContain('sample-preview');
    expect(evaluated).toContain('sample-editor');
  });
});
