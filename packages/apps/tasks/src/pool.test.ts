import { describe, expect, it } from 'vitest';

import { formatOrderFile, orderPoolCards, parseOrderFile, parseOrderFileDetailed } from './pool.js';

describe('parseOrderFile', () => {
  it('parses a YAML list of paths', () => {
    expect(parseOrderFile('- a/b.md\n- c/d.md\n')).toEqual(['a/b.md', 'c/d.md']);
  });

  it('tolerates a header comment and quoted items', () => {
    expect(parseOrderFile('# order\n- "a b.md"\n- c.md\n')).toEqual(['a b.md', 'c.md']);
  });

  it('resolves empty, garbage, and non-list content to []', () => {
    expect(parseOrderFile('')).toEqual([]);
    expect(parseOrderFile('   \n')).toEqual([]);
    expect(parseOrderFile('[unclosed')).toEqual([]);
    expect(parseOrderFile('key: value\n')).toEqual([]);
  });

  it('drops non-string and blank items', () => {
    expect(parseOrderFile('- a.md\n- 3\n- ""\n')).toEqual(['a.md']);
  });
});

describe('orderPoolCards', () => {
  const cards = [{ path: 'p/a.md' }, { path: 'p/b.md' }, { path: 'p/c.md' }];

  it('sorts by order-file index', () => {
    expect(orderPoolCards(cards, ['p/c.md', 'p/a.md', 'p/b.md']).map((c) => c.path)).toEqual([
      'p/c.md',
      'p/a.md',
      'p/b.md',
    ]);
  });

  it('unlisted paths sort last, stable by path', () => {
    expect(orderPoolCards(cards, ['p/c.md']).map((c) => c.path)).toEqual([
      'p/c.md',
      'p/a.md',
      'p/b.md',
    ]);
  });

  it('ignores listed paths that no longer exist', () => {
    expect(orderPoolCards(cards, ['gone.md', 'p/b.md']).map((c) => c.path)).toEqual([
      'p/b.md',
      'p/a.md',
      'p/c.md',
    ]);
  });

  it('does not mutate the input', () => {
    const input = [...cards];
    orderPoolCards(input, ['p/c.md']);
    expect(input).toEqual(cards);
  });
});

describe('formatOrderFile', () => {
  it('round-trips through parseOrderFile', () => {
    const paths = ['p/a.md', 'p/with space.md'];
    expect(parseOrderFile(formatOrderFile(paths))).toEqual(paths);
  });

  it('quotes paths YAML would misread', () => {
    expect(formatOrderFile(['odd: path.md'])).toContain('"odd: path.md"');
  });

  it('serializes an empty order', () => {
    expect(parseOrderFile(formatOrderFile([]))).toEqual([]);
  });
});

describe('parseOrderFileDetailed', () => {
  it('flags unparseable and non-list content as invalid, but not emptiness', () => {
    expect(parseOrderFileDetailed('')).toEqual({ paths: [], invalid: false });
    expect(parseOrderFileDetailed('   \n')).toEqual({ paths: [], invalid: false });
    expect(parseOrderFileDetailed('[unclosed')).toEqual({ paths: [], invalid: true });
    expect(parseOrderFileDetailed('key: value\n')).toEqual({ paths: [], invalid: true });
    expect(parseOrderFileDetailed('- a.md\n')).toEqual({ paths: ['a.md'], invalid: false });
  });
});
