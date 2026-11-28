// Importing the root entry defines no element and evaluates no element module:
// it is the parser and its types. The editor's class is exported as a type only;
// `./editor` and `./preview` define the elements.
import { describe, expect, it, vi } from 'vitest';

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./editor/xmdl-editor', async (load) => {
  evaluated.add('xmdl-editor');
  return load();
});
vi.mock('./preview/xmdl-preview', async (load) => {
  evaluated.add('xmdl-preview');
  return load();
});

describe('xmdl-format root entry', () => {
  it('defines no element and evaluates no element module', async () => {
    const root = await import('./index');

    expect(customElements.get('xmdl-editor')).toBeUndefined();
    expect(customElements.get('xmdl-preview')).toBeUndefined();
    expect([...evaluated]).toEqual([]);
    expect(Object.keys(root).sort()).toEqual([
      'createXmdlStarter',
      'parseXmdl',
      'renderXmdl',
      'setErrorHandler',
      'setReporter',
      'splitFrontmatterBlock',
    ]);
  });
});
