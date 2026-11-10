import { describe, expect, it } from 'vitest';

import {
  formatOrderFile,
  orderPoolCards,
  parseOrderFile,
  parseOrderFileDetailed,
  rewriteOrderFile,
} from './pool.js';

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

describe('rewriteOrderFile', () => {
  const grouped = [
    '# Backlog: top = highest priority.',
    '',
    '# Next up',
    '- p/specs/a.md',
    '- p/specs/b.md  # waiting on review',
    '',
    '# Later',
    '- p/seeds/c.md',
    '',
  ].join('\n');

  it('refills the item lines in the new order, leaving comments and blank lines in place', () => {
    expect(rewriteOrderFile(grouped, ['p/seeds/c.md', 'p/specs/a.md', 'p/specs/b.md'])).toBe(
      [
        '# Backlog: top = highest priority.',
        '',
        '# Next up',
        '- p/seeds/c.md',
        '- p/specs/a.md',
        '',
        '# Later',
        '- p/specs/b.md  # waiting on review',
        '',
      ].join('\n')
    );
  });

  it('drops the line of a path that left the list', () => {
    expect(rewriteOrderFile(grouped, ['p/specs/a.md', 'p/seeds/c.md'])).toBe(
      [
        '# Backlog: top = highest priority.',
        '',
        '# Next up',
        '- p/specs/a.md',
        '',
        '# Later',
        '- p/seeds/c.md',
        '',
      ].join('\n')
    );
  });

  it('adds a new path after the last item', () => {
    const next = rewriteOrderFile(grouped, [
      'p/specs/a.md',
      'p/specs/b.md',
      'p/seeds/c.md',
      'p/x.md',
    ]);
    expect(next.endsWith('- p/seeds/c.md\n- p/x.md\n')).toBe(true);
    expect(parseOrderFile(next)).toEqual([
      'p/specs/a.md',
      'p/specs/b.md',
      'p/seeds/c.md',
      'p/x.md',
    ]);
  });

  it('writes an emptied list as [] where the list was, and refills []', () => {
    const emptied = rewriteOrderFile('# Pool\n- p/a.md\n# end\n', []);
    expect(emptied).toBe('# Pool\n[]\n# end\n');
    expect(parseOrderFileDetailed(emptied)).toEqual({ paths: [], invalid: false });
    expect(rewriteOrderFile(emptied, ['p/a.md', 'p/b.md'])).toBe(
      '# Pool\n- p/a.md\n- p/b.md\n# end\n'
    );
  });

  it('keeps CRLF and a missing final newline', () => {
    expect(rewriteOrderFile('# Pool\r\n- p/a.md\r\n- p/b.md', ['p/b.md', 'p/a.md', 'p/c.md'])).toBe(
      '# Pool\r\n- p/b.md\r\n- p/a.md\r\n- p/c.md'
    );
  });

  it('keeps a quoted path that holds a comment marker', () => {
    const content = '- "p/odd #1.md"\n- p/a.md\n';
    expect(rewriteOrderFile(content, ['p/a.md', 'p/odd #1.md'])).toBe(
      '- p/a.md\n- "p/odd #1.md"\n'
    );
  });

  it('regenerates a file it cannot read line by line, or none', () => {
    const regenerated = formatOrderFile(['p/a.md']);
    expect(rewriteOrderFile('[p/b.md, p/a.md]\n', ['p/a.md'])).toBe(regenerated);
    expect(rewriteOrderFile('- - nested\n', ['p/a.md'])).toBe(regenerated);
    expect(rewriteOrderFile('not: a list\n', ['p/a.md'])).toBe(regenerated);
    expect(rewriteOrderFile('# only a comment\n', ['p/a.md'])).toBe(regenerated);
    expect(rewriteOrderFile(undefined, ['p/a.md'])).toBe(regenerated);
    expect(rewriteOrderFile(null, ['p/a.md'])).toBe(regenerated);
  });
});
