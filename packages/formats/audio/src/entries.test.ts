// Importing the `./format` entry defines no element and evaluates no element
// module; its `load()` is the `./preview` entry itself, so the element is never
// defined twice. A format with an engine (a player, a PDF renderer) mocks it here
// too, so the entry is kept from loading it.
import { describe, expect, it, vi } from 'vitest';

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./preview/audio-preview', async (load) => {
  evaluated.add('audio-preview');
  return load();
});

// One sequence, in order: the module registry is shared by the file.
describe('audio-format ./format entry', () => {
  it('defines no element and evaluates no element module', async () => {
    await import('./format');

    expect(customElements.get('audio-preview')).toBeUndefined();
    expect([...evaluated]).toEqual([]);
  });

  it('loads the ./preview entry itself', async () => {
    const { audioFormat } = await import('./format');

    expect(await audioFormat.preview.load()).toBe(await import('./preview/index'));
    expect(evaluated).toContain('audio-preview');
  });
});
