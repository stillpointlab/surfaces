// Importing the root entry defines no element and evaluates no element module.
// The element's class is exported as a type only; `./preview` defines it.
import { describe, expect, it, vi } from 'vitest';

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./preview/image-preview', async (load) => {
  evaluated.add('image-preview');
  return load();
});

describe('image-format root entry', () => {
  it('defines no element and evaluates no element module', async () => {
    const root = await import('./index');

    expect(customElements.get('image-preview')).toBeUndefined();
    expect([...evaluated]).toEqual([]);
    expect(Object.keys(root)).toEqual(['setErrorHandler']);
  });
});
