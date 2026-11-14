// Importing the `./format` entry defines no element and evaluates no element
// module; its `load()` is the `./preview` entry itself, so the element is never
// defined twice.
import { describe, expect, it, vi } from 'vitest';

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./preview/image-preview', async (load) => {
  evaluated.add('image-preview');
  return load();
});

// One sequence, in order: the module registry is shared by the file.
describe('image-format ./format entry', () => {
  it('defines no element and evaluates no element module', async () => {
    await import('./format');

    expect(customElements.get('image-preview')).toBeUndefined();
    expect([...evaluated]).toEqual([]);
  });

  it('loads the ./preview entry itself', async () => {
    const { imageFormat } = await import('./format');

    expect(await imageFormat.preview.load()).toBe(await import('./preview/index'));
    expect(evaluated).toContain('image-preview');
  });
});
