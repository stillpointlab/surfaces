// Importing the `./format` entry defines no element and evaluates no element
// module, ProseMirror or markdown-it; its `load()` is the `./preview` or
// `./editor` entry itself, so an element is never defined twice.
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
vi.mock('markdown-it', async (load) => {
  evaluated.add('markdown-it');
  return load();
});
for (const engine of [
  'prosemirror-commands',
  'prosemirror-history',
  'prosemirror-inputrules',
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

// One sequence, in order: the module registry is shared by the file.
describe('md-format ./format entry', () => {
  it('defines no element and evaluates no element module or engine', async () => {
    await import('./format');

    expect(customElements.get('md-preview')).toBeUndefined();
    expect(customElements.get('md-editor')).toBeUndefined();
    expect([...evaluated]).toEqual([]);
  });

  it('loads the ./preview and ./editor entries themselves', async () => {
    const { mdFormat } = await import('./format');

    expect(await mdFormat.preview.load()).toBe(await import('./preview/index'));
    expect(await mdFormat.editor?.load()).toBe(await import('./editor/index'));
    expect(evaluated).toContain('md-preview');
    expect(evaluated).toContain('prosemirror-editor');
  });
});
