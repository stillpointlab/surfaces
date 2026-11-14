import { describe, expect, it } from 'vitest';

import { createHostRegistry } from './registry';

describe('the host registry', () => {
  const registry = createHostRegistry();

  it('registers the five formats in order, with code as the fallback', () => {
    expect(registry.formats.map((format) => format.id)).toEqual([
      'md',
      'xmdl',
      'sheet',
      'image',
      'code',
    ]);
    expect(registry.fallback?.id).toBe('code');
  });

  it.each([
    ['README.md', 'md'],
    ['notes.MARKDOWN', 'md'],
    ['brief.xmdl', 'xmdl'],
    ['data/table.csv', 'sheet'],
    ['data/merged.sheet', 'sheet'],
    ['img/dot.PNG', 'image'],
    ['img/shape.svg', 'image'],
    ['src/app.ts', 'code'],
    ['types.d.ts', 'code'],
  ])('opens %s with %s', (path, id) => {
    expect(registry.find(path)?.id).toBe(id);
  });

  it('finds nothing for a file with no known extension', () => {
    expect(registry.find('Makefile')).toBeNull();
    expect(registry.find('notes.txt')).toBeNull();
  });
});
