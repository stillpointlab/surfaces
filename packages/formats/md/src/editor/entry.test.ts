// Importing the `./editor` entry defines <md-editor> and evaluates none of its
// engine: ProseMirror, the markdown parser and the serializer load on the first
// connect. A module the entry also exports statically would be in the entry's
// own chunk, and the editor's dynamic import of it would defer nothing.
import { describe, expect, it, vi } from 'vitest';

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./prosemirror-schema', async (load) => {
  evaluated.add('./prosemirror-schema');
  return load();
});
vi.mock('./prosemirror-markdown', async (load) => {
  evaluated.add('./prosemirror-markdown');
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

describe('md-format ./editor entry', () => {
  it('defines <md-editor> and evaluates no engine module', async () => {
    await import('./index');

    expect(customElements.get('md-editor')).toBeDefined();
    expect([...evaluated]).toEqual([]);
  });
});
