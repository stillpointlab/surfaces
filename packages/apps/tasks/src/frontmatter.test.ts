import { describe, expect, it } from 'vitest';

import {
  parseFrontmatter,
  readCardMeta,
  readColumn,
  readTags,
  readTitle,
  rewriteFrontmatter,
} from './frontmatter.js';
import { BUILTIN_TASK_KINDS } from './types.js';

import type { SharedTasksManifest } from './types.js';

const manifest: SharedTasksManifest = {
  version: 1,
  columns: [
    { id: 'briefed', label: 'Briefed' },
    { id: 'in-progress', label: 'In progress' },
    { id: 'done', label: 'Done' },
  ],
  frontmatterKey: 'column',
  kinds: [...BUILTIN_TASK_KINDS],
  defaultColumn: 'briefed',
  doneColumn: 'done',
  tags: [],
};

describe('parseFrontmatter', () => {
  it('parses a simple block and returns the body', () => {
    const md = '---\ncolumn: briefed\ntitle: Hello\n---\n# Body\n';
    const result = parseFrontmatter(md);
    expect(result.data).toEqual({ column: 'briefed', title: 'Hello' });
    expect(result.parseError).toBeUndefined();
    expect(result.body).toBe('# Body\n');
  });

  it('returns data null without a parseError when there is no block', () => {
    const md = '# Just a doc\n\nNo frontmatter here.\n';
    const result = parseFrontmatter(md);
    expect(result.data).toBeNull();
    expect(result.parseError).toBeUndefined();
    expect(result.body).toBe(md);
  });

  it('does not treat a mid-document --- as a frontmatter opener', () => {
    const md = 'Intro\n---\ncolumn: briefed\n---\n';
    expect(parseFrontmatter(md).data).toBeNull();
  });

  it('handles CRLF line endings', () => {
    const md = '---\r\ncolumn: done\r\n---\r\nBody\r\n';
    const result = parseFrontmatter(md);
    expect(result.data).toEqual({ column: 'done' });
    expect(result.body).toBe('Body\r\n');
  });

  it('stops at the first closing delimiter even when --- appears in the body', () => {
    const md = '---\ncolumn: done\n---\nBody\n\n---\n\nMore body\n';
    const result = parseFrontmatter(md);
    expect(result.data).toEqual({ column: 'done' });
    expect(result.body).toBe('Body\n\n---\n\nMore body\n');
  });

  it('reports garbage YAML as a parseError, not a throw', () => {
    const md = '---\ncolumn: [unclosed\n---\nBody\n';
    const result = parseFrontmatter(md);
    expect(result.data).toBeNull();
    expect(result.parseError).toContain('parse error');
    expect(result.body).toBe('Body\n');
  });

  it('treats a non-mapping block (scalar/list) as a parseError', () => {
    const md = '---\n- just\n- a list\n---\nBody\n';
    const result = parseFrontmatter(md);
    expect(result.data).toBeNull();
    expect(result.parseError).toContain('not a YAML mapping');
  });

  it('parses an empty block as an empty mapping', () => {
    const md = '---\n---\nBody\n';
    const result = parseFrontmatter(md);
    expect(result.data).toEqual({});
    expect(result.body).toBe('Body\n');
  });
});

describe('rewriteFrontmatter', () => {
  it('replaces only the patched line, byte-for-byte elsewhere', () => {
    const md =
      '---\n# keep this comment\ntitle: "My: Task"\ncolumn: briefed\nowner: sam\n---\n\nBody text.\n';
    const result = rewriteFrontmatter(md, { column: 'done' });
    expect(result).toBe(
      '---\n# keep this comment\ntitle: "My: Task"\ncolumn: done\nowner: sam\n---\n\nBody text.\n'
    );
  });

  it('appends a missing key at the end of the block', () => {
    const md = '---\ntitle: T\n---\nBody\n';
    expect(rewriteFrontmatter(md, { column: 'briefed' })).toBe(
      '---\ntitle: T\ncolumn: briefed\n---\nBody\n'
    );
  });

  it('removes a key with null and leaves no blank line', () => {
    const md = '---\ntitle: T\ncolumn: done\nowner: sam\n---\nBody\n';
    expect(rewriteFrontmatter(md, { column: null })).toBe('---\ntitle: T\nowner: sam\n---\nBody\n');
  });

  it('drops the whole block when the last key is removed', () => {
    const md = '---\ncolumn: done\n---\nBody\n';
    expect(rewriteFrontmatter(md, { column: null })).toBe('Body\n');
  });

  it('removing a key that does not exist is a no-op', () => {
    const md = '---\ntitle: T\n---\nBody\n';
    expect(rewriteFrontmatter(md, { column: null })).toBe(md);
  });

  it('creates a minimal block on a file without one', () => {
    const md = '# Doc\n\nBody\n';
    expect(rewriteFrontmatter(md, { column: 'briefed' })).toBe(
      '---\ncolumn: briefed\n---\n# Doc\n\nBody\n'
    );
  });

  it('creating a block from only-null patches is a no-op', () => {
    const md = '# Doc\n';
    expect(rewriteFrontmatter(md, { column: null })).toBe(md);
  });

  it('preserves CRLF line endings throughout', () => {
    const md = '---\r\ntitle: T\r\ncolumn: briefed\r\n---\r\nBody\r\n';
    expect(rewriteFrontmatter(md, { column: 'done' })).toBe(
      '---\r\ntitle: T\r\ncolumn: done\r\n---\r\nBody\r\n'
    );
    const noBlock = 'Body\r\n';
    expect(rewriteFrontmatter(noBlock, { column: 'done' })).toBe(
      '---\r\ncolumn: done\r\n---\r\nBody\r\n'
    );
  });

  it('adds a key to an empty block', () => {
    const md = '---\n---\nBody\n';
    expect(rewriteFrontmatter(md, { column: 'done' })).toBe('---\ncolumn: done\n---\nBody\n');
  });

  it('quotes values that are not plain scalars', () => {
    const md = '---\ntitle: T\n---\nBody\n';
    expect(rewriteFrontmatter(md, { column: 'a: weird value' })).toBe(
      '---\ntitle: T\ncolumn: "a: weird value"\n---\nBody\n'
    );
  });

  it('patches textually even when the existing YAML is garbage', () => {
    const md = '---\n{{{ not yaml\n---\nBody\n';
    expect(rewriteFrontmatter(md, { column: 'briefed' })).toBe(
      '---\n{{{ not yaml\ncolumn: briefed\n---\nBody\n'
    );
  });

  it('does not match the key as a prefix of a longer key', () => {
    const md = '---\ncolumns: nope\n---\nBody\n';
    expect(rewriteFrontmatter(md, { column: 'done' })).toBe(
      '---\ncolumns: nope\ncolumn: done\n---\nBody\n'
    );
  });

  it('round-trips: rewrite then parse yields the patched value', () => {
    const md = '---\ntitle: T\n---\nBody\n';
    const rewritten = rewriteFrontmatter(md, { column: 'in-progress' });
    expect(parseFrontmatter(rewritten).data).toEqual({ title: 'T', column: 'in-progress' });
  });

  describe('list values', () => {
    it('writes a list as a single-line flow sequence', () => {
      const md = '---\ncolumn: briefed\n---\nBody\n';
      expect(rewriteFrontmatter(md, { tags: ['infra', 'ui'] })).toBe(
        '---\ncolumn: briefed\ntags: [infra, ui]\n---\nBody\n'
      );
    });

    it('replaces an existing flow list in place', () => {
      const md = '---\ntags: [old]\ncolumn: briefed\n---\nBody\n';
      expect(rewriteFrontmatter(md, { tags: ['a', 'b'] })).toBe(
        '---\ntags: [a, b]\ncolumn: briefed\n---\nBody\n'
      );
    });

    it('replaces a hand-authored block list with one flow line, touching nothing else', () => {
      const md = '---\n# keep me\ntags:\n  - old\n  - stale\ncolumn: briefed\n---\nBody\n';
      expect(rewriteFrontmatter(md, { tags: ['fresh'] })).toBe(
        '---\n# keep me\ntags: [fresh]\ncolumn: briefed\n---\nBody\n'
      );
    });

    it('an empty list removes the key, including a block list', () => {
      const md = '---\ntags:\n  - a\n  - b\ncolumn: briefed\n---\nBody\n';
      expect(rewriteFrontmatter(md, { tags: [] })).toBe('---\ncolumn: briefed\n---\nBody\n');
    });

    it('null removes a block list without orphaning its items', () => {
      const md = '---\ncolumn: briefed\ntags:\n  - a\n---\nBody\n';
      expect(rewriteFrontmatter(md, { tags: null })).toBe('---\ncolumn: briefed\n---\nBody\n');
    });

    it('quotes non-slug items inside the flow sequence', () => {
      const md = '---\ncolumn: briefed\n---\nBody\n';
      const rewritten = rewriteFrontmatter(md, { tags: ['needs review', 'ok'] });
      expect(rewritten).toContain('tags: ["needs review", ok]');
      expect(parseFrontmatter(rewritten).data?.tags).toEqual(['needs review', 'ok']);
    });

    it('creates a minimal block with a flow list on a file without one', () => {
      expect(rewriteFrontmatter('Body\n', { tags: ['a'] })).toBe('---\ntags: [a]\n---\nBody\n');
    });

    it('preserves CRLF line endings when replacing a block list', () => {
      const md = '---\r\ntags:\r\n  - a\r\ncolumn: briefed\r\n---\r\nBody\r\n';
      expect(rewriteFrontmatter(md, { tags: ['b'] })).toBe(
        '---\r\ntags: [b]\r\ncolumn: briefed\r\n---\r\nBody\r\n'
      );
    });

    it('does not consume an indented line that belongs to the next key', () => {
      const md = '---\ntags: [a]\nnotes: |\n  keep\n---\nBody\n';
      expect(rewriteFrontmatter(md, { tags: ['b'] })).toBe(
        '---\ntags: [b]\nnotes: |\n  keep\n---\nBody\n'
      );
    });

    it('composes list and scalar patches in one call', () => {
      const md = '---\ncolumn: briefed\n---\nBody\n';
      const rewritten = rewriteFrontmatter(md, { column: 'done', tags: ['a'] });
      expect(parseFrontmatter(rewritten).data).toEqual({ column: 'done', tags: ['a'] });
    });
  });
});

describe('readTags', () => {
  it('reads a flow sequence', () => {
    expect(readTags('---\ntags: [infra, ui]\n---\nBody\n')).toEqual(['infra', 'ui']);
  });

  it('reads a hand-authored block list', () => {
    expect(readTags('---\ntags:\n  - infra\n  - "needs review"\n---\nBody\n')).toEqual([
      'infra',
      'needs review',
    ]);
  });

  it('returns [] for an explicitly empty list', () => {
    expect(readTags('---\ntags: []\n---\nBody\n')).toEqual([]);
  });

  it('returns null for a missing key, missing block, or non-array value', () => {
    expect(readTags('---\ncolumn: briefed\n---\nBody\n')).toBeNull();
    expect(readTags('Body\n')).toBeNull();
    expect(readTags('---\ntags: not-a-list\n---\nBody\n')).toBeNull();
  });

  it('drops non-string and blank items, trimming the rest', () => {
    expect(readTags('---\ntags: [" a ", 3, ""]\n---\nBody\n')).toEqual(['a']);
  });

  it('reads a custom key', () => {
    expect(readTags('---\nlabels: [x]\n---\nBody\n', 'labels')).toEqual(['x']);
  });
});

describe('readTitle', () => {
  it('returns a plain title', () => {
    expect(readTitle('---\ntitle: Hello\n---\nBody\n')).toBe('Hello');
  });

  it('returns a quoted title with spaces', () => {
    expect(readTitle('---\ntitle: "My Fancy Title"\ncolumn: done\n---\nBody\n')).toBe(
      'My Fancy Title'
    );
  });

  it('returns undefined for a missing key', () => {
    expect(readTitle('---\ncolumn: done\n---\nBody\n')).toBeUndefined();
  });

  it('returns undefined for a non-string value', () => {
    expect(readTitle('---\ntitle: 3\n---\nBody\n')).toBeUndefined();
    expect(readTitle('---\ntitle: [a, b]\n---\nBody\n')).toBeUndefined();
  });

  it('returns undefined for a whitespace-only value', () => {
    expect(readTitle('---\ntitle: "   "\n---\nBody\n')).toBeUndefined();
  });

  it('returns undefined for a file without frontmatter', () => {
    expect(readTitle('# Doc\n')).toBeUndefined();
  });

  it('returns undefined for garbage frontmatter', () => {
    expect(readTitle('---\n{{{ not yaml\n---\nBody\n')).toBeUndefined();
  });

  it('trims surrounding whitespace', () => {
    expect(readTitle('---\ntitle: "  padded  "\n---\nBody\n')).toBe('padded');
  });
});

describe('readCardMeta', () => {
  it('reads blocked, completed, and pr scalars', () => {
    expect(
      readCardMeta('---\nblocked: waiting on infra\ncompleted: 2026-07-09\npr: 388\n---\nB\n')
    ).toEqual({ blocked: 'waiting on infra', completed: '2026-07-09', pr: '388' });
  });

  it('resolves missing block/keys and blank values to an empty object', () => {
    expect(readCardMeta('Body\n')).toEqual({});
    expect(readCardMeta('---\ncolumn: done\nblocked: ""\n---\nB\n')).toEqual({});
  });

  it('stringifies numeric pr values and ignores non-scalars', () => {
    expect(readCardMeta('---\npr: 42\nblocked: [a]\n---\nB\n')).toEqual({ pr: '42' });
  });
});

describe('readColumn', () => {
  it('returns a declared column id', () => {
    expect(readColumn('---\ncolumn: done\n---\n', manifest)).toEqual({ column: 'done' });
  });

  it('returns null for a missing key', () => {
    expect(readColumn('---\ntitle: T\n---\n', manifest)).toEqual({ column: null });
  });

  it('returns null plus the undeclared id for an unknown column (needs-attention)', () => {
    expect(readColumn('---\ncolumn: bogus\n---\n', manifest)).toEqual({
      column: null,
      undeclaredId: 'bogus',
    });
  });

  it('returns null for a non-string value', () => {
    expect(readColumn('---\ncolumn: 3\n---\n', manifest)).toEqual({ column: null });
  });

  it('returns null with no error for a file without frontmatter', () => {
    expect(readColumn('# Doc\n', manifest)).toEqual({ column: null });
  });

  it('returns null plus parseError for garbage frontmatter', () => {
    const result = readColumn('---\ncolumn: [unclosed\n---\n', manifest);
    expect(result.column).toBeNull();
    expect(result.parseError).toBeDefined();
  });

  it('honors a manifest frontmatterKey of status', () => {
    const statusManifest = { ...manifest, frontmatterKey: 'status' as const };
    expect(readColumn('---\nstatus: done\ncolumn: briefed\n---\n', statusManifest)).toEqual({
      column: 'done',
    });
  });
});

describe('rewriter hardening (review H9/M6/L1/L8)', () => {
  const MANIFEST = {
    version: 1,
    columns: [
      { id: 'briefed', label: 'B' },
      { id: 'done', label: 'D' },
    ],
    frontmatterKey: 'column',
    kinds: [...BUILTIN_TASK_KINDS],
    defaultColumn: 'briefed',
    doneColumn: 'done',
    tags: [],
  } as never;

  it('quotes YAML-ambiguous scalars in card tags so readers keep them', () => {
    const out = rewriteFrontmatter('---\ncolumn: briefed\n---\nBody\n', { tags: ['123', 'ok'] });
    expect(out).toContain('tags: ["123", ok]');
    expect(readTags(out)).toEqual(['123', 'ok']);
  });

  it('replaces a block list containing an interior blank line whole', () => {
    const input = '---\ntags:\n  - a\n\n  - b\ncolumn: briefed\n---\nBody\n';
    const out = rewriteFrontmatter(input, { tags: ['x'] });
    expect(out).toBe('---\ntags: [x]\ncolumn: briefed\n---\nBody\n');
    expect(readTags(out)).toEqual(['x']);
  });

  it('patches a quoted key in place instead of appending a duplicate', () => {
    const input = '---\n"column": briefed\n---\nBody\n';
    const out = rewriteFrontmatter(input, { column: 'done' });
    expect(out).toBe('---\ncolumn: done\n---\nBody\n');
    expect(readColumn(out, MANIFEST).column).toBe('done');
  });

  it('sees past a UTF-8 BOM instead of prepending a second block', () => {
    const input = '\uFEFF---\ncolumn: briefed\n---\nBody\n';
    const out = rewriteFrontmatter(input, { column: 'done' });
    expect(out).toBe('\uFEFF---\ncolumn: done\n---\nBody\n');
    expect(readColumn(input, MANIFEST).column).toBe('briefed');
  });

  it('round-trip property: a patch on parseable frontmatter never corrupts it', () => {
    const corpus = [
      '---\ncolumn: briefed\n---\nBody\n',
      '---\ntags:\n  - a\n\n  - b\n---\nBody\n',
      '---\n"column": briefed\ntags: [a, b]\n---\nBody\n',
      '\uFEFF---\ncolumn: briefed\n---\nBody\n',
      '---\r\ncolumn: briefed\r\n---\r\nBody\r\n',
      'No frontmatter at all\n',
      '---\n---\nEmpty block\n',
    ];
    const patches = [
      { column: 'done' },
      { tags: ['123', 'x-y', 'true'] },
      { column: null },
      { title: 'A title with spaces' },
    ] as const;
    for (const input of corpus) {
      const before = parseFrontmatter(input.replace(/^\uFEFF/, ''));
      for (const patch of patches) {
        const out = rewriteFrontmatter(input, patch as never);
        const after = parseFrontmatter(out.replace(/^\uFEFF/, ''));
        // Never corrupt: parseable in stays parseable out.
        expect(before.parseError).toBeUndefined();
        expect(after.parseError).toBeUndefined();
        // Patched keys read back exactly; the body survives byte-for-byte.
        expect(after.body).toBe(before.body);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) expect(after.data?.[key]).toBeUndefined();
          else expect(after.data?.[key]).toEqual(value);
        }
      }
    }
  });
});
