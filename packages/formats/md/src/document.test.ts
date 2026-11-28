// Importing the `./document` entry defines no element and evaluates no element
// module: it is the schema, the parser and the serializer, and no more.
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

describe('md-format ./document entry', () => {
  it('defines no element and evaluates no element module', async () => {
    const document = await import('./document');

    expect(customElements.get('md-editor')).toBeUndefined();
    expect(customElements.get('md-preview')).toBeUndefined();
    expect(customElements.get('md-icon')).toBeUndefined();
    expect([...evaluated]).toEqual([]);
    expect(Object.keys(document).sort()).toEqual([
      'createSchema',
      'getMarkdownParser',
      'getMarkdownSerializer',
      'getSchema',
    ]);
  });

  it('reads markdown and writes it back', async () => {
    const { getMarkdownParser, getMarkdownSerializer } = await import('./document');

    const doc = getMarkdownParser().parse('# Title\n\nSome **bold** text.');
    expect(getMarkdownSerializer().serialize(doc)).toBe('# Title\n\nSome **bold** text.');
  });
});
