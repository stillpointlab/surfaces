// Importing the root entry defines no element and evaluates no element module,
// ProseMirror or markdown-it. The editor's class is exported as a type only;
// `./editor` defines the element and `./document` holds the engine.
import { describe, expect, it, vi } from 'vitest';

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./preview/md-preview', async (load) => {
  evaluated.add('md-preview');
  return load();
});
vi.mock('./editor/prosemirror-editor', async (load) => {
  evaluated.add('prosemirror-editor');
  return load();
});
vi.mock('./editor/md-icon', async (load) => {
  evaluated.add('md-icon');
  return load();
});
vi.mock('./editor/prosemirror-schema', async (load) => {
  evaluated.add('prosemirror-schema');
  return load();
});
vi.mock('./editor/prosemirror-markdown', async (load) => {
  evaluated.add('prosemirror-markdown (the parser)');
  return load();
});
vi.mock('markdown-it', async (load) => {
  evaluated.add('markdown-it');
  return load();
});
for (const engine of [
  'prosemirror-commands',
  'prosemirror-history',
  'prosemirror-inputrules',
  'prosemirror-keymap',
  'prosemirror-markdown',
  'prosemirror-model',
  'prosemirror-schema-list',
  'prosemirror-state',
  'prosemirror-tables',
  'prosemirror-view',
]) {
  vi.doMock(engine, async (load) => {
    evaluated.add(engine);
    return load();
  });
}

describe('md-format root entry', () => {
  it('defines no element and evaluates no element module or engine', async () => {
    const root = await import('./index');

    expect(customElements.get('md-editor')).toBeUndefined();
    expect(customElements.get('md-preview')).toBeUndefined();
    expect(customElements.get('md-icon')).toBeUndefined();
    expect([...evaluated]).toEqual([]);
    expect(Object.keys(root).sort()).toEqual(['setErrorHandler', 'setReporter']);
  });
});
