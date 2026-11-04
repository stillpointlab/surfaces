import { describe, expect, it } from 'vitest';

import {
  columnWarning,
  effectiveColumn,
  parseCardProjection,
  resolveProjectionColumn,
} from './cardProjection.js';
import { readCardMeta, readColumn, readTags, readTitle } from './frontmatter.js';
import { BUILTIN_TASK_KINDS } from './types.js';

import type { SharedTasksManifest } from './types.js';

const MANIFEST: SharedTasksManifest = {
  version: 1,
  columns: [
    { id: 'briefed', label: 'Briefed' },
    { id: 'done', label: 'Done' },
  ],
  frontmatterKey: 'column',
  kinds: [...BUILTIN_TASK_KINDS],
  defaultColumn: 'briefed',
  doneColumn: 'done',
  tags: [],
};

const STATUS_MANIFEST: SharedTasksManifest = { ...MANIFEST, frontmatterKey: 'status' };

describe('parseCardProjection', () => {
  it('reads column, title, tags and metadata in one pass', () => {
    const content =
      '---\ncolumn: done\ntitle: Ship it\ntags: [infra, ui]\nblocked: waiting\ncompleted: 2026-07-30\npr: 42\n---\nBody\n';

    expect(parseCardProjection(content, 'column')).toEqual({
      column: 'done',
      title: 'Ship it',
      tags: ['infra', 'ui'],
      meta: { blocked: 'waiting', completed: '2026-07-30', pr: '42' },
    });
  });

  it('reads the manifest frontmatter key, not always `column`', () => {
    const content = '---\nstatus: done\ncolumn: briefed\n---\nBody\n';

    expect(parseCardProjection(content, 'status').column).toBe('done');
    expect(parseCardProjection(content, 'column').column).toBe('briefed');
  });

  it('projects a file with no frontmatter as an empty projection', () => {
    expect(parseCardProjection('# Just a heading\n', 'column')).toEqual({
      column: null,
      tags: null,
      meta: {},
    });
  });

  it('reports a parse error instead of throwing, with no column', () => {
    const projection = parseCardProjection('---\ncolumn: [unclosed\n---\nBody\n', 'column');

    expect(projection.column).toBeNull();
    expect(projection.parseError).toContain('parse error');
  });

  it('ignores a non-string column value', () => {
    expect(parseCardProjection('---\ncolumn: 3\n---\n', 'column').column).toBeNull();
  });

  // The projection replaced four separate frontmatter reads in the board
  // service; card rendering must not have shifted a byte in the process.
  it('matches the readTitle/readTags/readCardMeta/readColumn reads it replaced', () => {
    const samples = [
      '---\ncolumn: done\ntitle: T\ntags:\n  - a\n  - b\npr: 7\n---\nBody\n',
      '---\ncolumn: bogus\n---\nBody\n',
      '---\ncolumn: [unclosed\n---\nBody\n',
      '---\ntitle: "  padded  "\ntags: not-a-list\n---\nBody\n',
      'no frontmatter at all\n',
      '﻿---\ncolumn: done\n---\nBody\n',
      '---\n---\nEmpty block\n',
    ];

    for (const content of samples) {
      const projection = parseCardProjection(content, MANIFEST.frontmatterKey);
      expect(resolveProjectionColumn(projection, MANIFEST)).toEqual(readColumn(content, MANIFEST));
      expect(projection.title).toEqual(readTitle(content));
      expect(projection.tags).toEqual(readTags(content));
      expect(projection.meta).toEqual(readCardMeta(content));
    }
  });
});

describe('resolveProjectionColumn', () => {
  it('passes a declared column id through', () => {
    expect(
      resolveProjectionColumn(parseCardProjection('---\ncolumn: done\n---\n', 'column'), MANIFEST)
    ).toEqual({
      column: 'done',
    });
  });

  it('reports an undeclared id rather than accepting it', () => {
    expect(
      resolveProjectionColumn(parseCardProjection('---\ncolumn: nope\n---\n', 'column'), MANIFEST)
    ).toEqual({ column: null, undeclaredId: 'nope' });
  });

  it('carries a parse error and never a column', () => {
    const read = resolveProjectionColumn(
      parseCardProjection('---\ncolumn: [unclosed\n---\n', 'column'),
      MANIFEST
    );
    expect(read.column).toBeNull();
    expect(read.parseError).toBeDefined();
  });

  it('honours a manifest that keys on `status`', () => {
    expect(
      resolveProjectionColumn(
        parseCardProjection('---\nstatus: done\n---\n', 'status'),
        STATUS_MANIFEST
      )
    ).toEqual({ column: 'done' });
  });
});

describe('effectiveColumn', () => {
  it('defaults a keyless board card to the manifest default column', () => {
    expect(effectiveColumn({ column: null }, MANIFEST, 'board')).toBe('briefed');
  });

  it('keeps a corrupt or undeclared board card out of every column', () => {
    expect(effectiveColumn({ column: null, parseError: 'bad' }, MANIFEST, 'board')).toBeNull();
    expect(effectiveColumn({ column: null, undeclaredId: 'nope' }, MANIFEST, 'board')).toBeNull();
  });

  it('never gives a pool card a column — membership is the location', () => {
    expect(effectiveColumn({ column: 'done' }, MANIFEST, 'pool')).toBeNull();
    expect(effectiveColumn({ column: null }, MANIFEST, 'pool')).toBeNull();
  });
});

describe('columnWarning', () => {
  it('names an undeclared column id on a board', () => {
    expect(columnWarning({ column: null, undeclaredId: 'nope' }, MANIFEST, 'board')).toBe(
      "'nope' is not a column declared in tasks.yaml"
    );
  });

  it('flags an ignored column key on a pooled card', () => {
    expect(columnWarning({ column: 'done' }, MANIFEST, 'pool')).toBe(
      "pooled cards carry no 'column:' key (ignored)"
    );
    expect(columnWarning({ column: null, undeclaredId: 'nope' }, MANIFEST, 'pool')).toBe(
      "pooled cards carry no 'column:' key (ignored)"
    );
  });

  it('is silent for an unremarkable column', () => {
    expect(columnWarning({ column: 'done' }, MANIFEST, 'board')).toBeUndefined();
    expect(columnWarning({ column: null }, MANIFEST, 'pool')).toBeUndefined();
    expect(columnWarning({ column: null, parseError: 'bad' }, MANIFEST, 'pool')).toBeUndefined();
  });
});
