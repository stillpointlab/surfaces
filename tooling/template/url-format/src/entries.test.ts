// Importing the `./format` entry defines no element and evaluates no element
// module; its `load()` is the `./preview` entry itself, so the element is never
// defined twice. A format with an engine (a player, a PDF renderer) mocks it here
// too, so the entry is kept from loading it.
import { describe, expect, it, vi } from 'vitest';

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./preview/sample-url-preview', async (load) => {
  evaluated.add('sample-url-preview');
  return load();
});

// One sequence, in order: the module registry is shared by the file.
describe('sample-url-format ./format entry', () => {
  it('defines no element and evaluates no element module', async () => {
    await import('./format');

    expect(customElements.get('sample-url-preview')).toBeUndefined();
    expect([...evaluated]).toEqual([]);
  });

  it('loads the ./preview entry itself', async () => {
    const { sampleFormat } = await import('./format');

    expect(await sampleFormat.preview.load()).toBe(await import('./preview/index'));
    expect(evaluated).toContain('sample-url-preview');
  });
});
