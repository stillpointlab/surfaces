// Importing the root entry defines no element and evaluates no element module or
// CodeMirror. The editor's class is exported as a type only; `./editor`,
// `./preview` and `./diff` define the elements.
import { describe, expect, it, vi } from 'vitest';

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./editor/code-editor', async (load) => {
  evaluated.add('code-editor');
  return load();
});
vi.mock('./preview/code-preview', async (load) => {
  evaluated.add('code-preview');
  return load();
});
vi.mock('./diff/code-diff', async (load) => {
  evaluated.add('code-diff');
  return load();
});
for (const engine of [
  'codemirror',
  '@codemirror/commands',
  '@codemirror/language',
  '@codemirror/language-data',
  '@codemirror/merge',
  '@codemirror/state',
  '@codemirror/view',
  '@replit/codemirror-vim',
]) {
  vi.doMock(engine, async (load) => {
    evaluated.add(engine);
    return load();
  });
}

describe('code-format root entry', () => {
  it('defines no element and evaluates no element module or CodeMirror', async () => {
    const root = await import('./index');

    for (const tag of ['code-editor', 'code-preview', 'code-diff']) {
      expect(customElements.get(tag), tag).toBeUndefined();
    }
    expect([...evaluated]).toEqual([]);
    expect(Object.keys(root).sort()).toEqual(['setErrorHandler', 'setReporter']);
  });
});
