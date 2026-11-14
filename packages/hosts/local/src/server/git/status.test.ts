import { describe, expect, it } from 'vitest';

import { chunkPaths, parseIndexEntries, stagingPlan } from './stage';
import { changesFromStatus, parseStatusEntries, withIndexRemovals } from './status';

const H = 'b3c5a95f929a50feb06c275ac567cdb1b441d1e2';
const Z = '0000000000000000000000000000000000000000';

/** One ordinary record. */
const one = (xy: string, path: string) => `1 ${xy} N... 100644 100644 100644 ${H} ${H} ${path}`;
/** A rename's two records: the new path, then the old. */
const two = (xy: string, path: string, from: string, score = 'R100') =>
  `2 ${xy} N... 100644 100644 100644 ${H} ${H} ${score} ${path}\0${from}`;
const unmerged = (xy: string, path: string) =>
  `u ${xy} N... 100644 100644 100644 100644 ${H} ${H} ${H} ${path}`;
const output = (...records: string[]) => records.map((r) => `${r}\0`).join('');

const statusOf = (records: string[], prefix = '') =>
  changesFromStatus(parseStatusEntries(output(...records)), prefix);

describe('parseStatusEntries', () => {
  it('reads each kind of record, with spaces in paths and a rename’s old path from the next record', () => {
    expect(
      parseStatusEntries(
        output(
          '# branch.oid abc',
          one('.M', 'a b.md'),
          two('R.', 'new name.md', 'old name.md'),
          unmerged('UU', 'c.md'),
          '? un tracked.md',
          '! ignored.log'
        )
      )
    ).toEqual([
      { kind: '1', xy: '.M', path: 'a b.md' },
      { kind: '2', xy: 'R.', path: 'new name.md', from: 'old name.md' },
      { kind: 'u', xy: 'UU', path: 'c.md' },
      { kind: '?', xy: '??', path: 'un tracked.md' },
    ]);
  });
});

describe('changesFromStatus', () => {
  it.each([
    ['changed, unstaged', [one('.M', 'a.md')], { path: 'a.md', status: 'changed' }],
    ['changed, staged', [one('M.', 'a.md')], { path: 'a.md', status: 'changed' }],
    ['staged, then changed again', [one('MM', 'a.md')], { path: 'a.md', status: 'changed' }],
    [
      'a type change (a file made a link)',
      [one('.T', 'a.md')],
      { path: 'a.md', status: 'changed' },
    ],
    ['untracked', ['? a.md'], { path: 'a.md', status: 'new' }],
    ['added', [one('A.', 'a.md')], { path: 'a.md', status: 'new' }],
    ['added, then changed', [one('AM', 'a.md')], { path: 'a.md', status: 'new' }],
    ['intent to add', [one('.A', 'a.md')], { path: 'a.md', status: 'new' }],
    ['deleted, unstaged', [one('.D', 'a.md')], { path: 'a.md', status: 'deleted' }],
    ['deleted, staged', [one('D.', 'a.md')], { path: 'a.md', status: 'deleted' }],
    ['changed and staged, then deleted', [one('MD', 'a.md')], { path: 'a.md', status: 'deleted' }],
    [
      'removed from the index and still on disk',
      [one('D.', 'a.md'), '? a.md'],
      { path: 'a.md', status: 'changed' },
    ],
    ['renamed', [two('R.', 'b.md', 'a.md')], { path: 'b.md', status: 'moved', from: 'a.md' }],
    [
      'renamed, then edited',
      [two('RM', 'b.md', 'a.md', 'R087')],
      { path: 'b.md', status: 'moved', from: 'a.md' },
    ],
    ['renamed, then deleted', [two('RD', 'b.md', 'a.md')], { path: 'a.md', status: 'deleted' }],
    ['copied', [two('C.', 'b.md', 'a.md', 'C100')], { path: 'b.md', status: 'new' }],
    ['in conflict, both changed', [unmerged('UU', 'a.md')], { path: 'a.md', status: 'changed' }],
    ['in conflict, deleted by them', [unmerged('UD', 'a.md')], { path: 'a.md', status: 'changed' }],
    ['in conflict, both added', [unmerged('AA', 'a.md')], { path: 'a.md', status: 'changed' }],
  ])('%s', (_name, records, change) => {
    expect(statusOf(records)).toEqual([change]);
  });

  it('leaves out a file added and then deleted from disk: neither in HEAD nor on disk', () => {
    expect(statusOf([one('AD', 'a.md')])).toEqual([]);
  });

  it('a copy whose new path went from disk leaves its source alone', () => {
    expect(statusOf([two('CD', 'b.md', 'a.md', 'C100')])).toEqual([]);
  });

  it('a served subfolder sees its own paths, relative to itself', () => {
    expect(
      statusOf(
        [
          one('.M', 'top.md'),
          one('.M', 'sub/a.md'),
          one('.M', 'subway/x.md'),
          '? sub/deep/n.md',
          '? other/n.md',
        ],
        'sub/'
      )
    ).toEqual([
      { path: 'a.md', status: 'changed' },
      { path: 'deep/n.md', status: 'new' },
    ]);
  });

  it('a rename across the served folder’s edge is half of one: in is new, out is deleted', () => {
    expect(
      statusOf(
        [
          two('R.', 'sub/in.md', 'out/in.md'),
          two('R.', 'out/left.md', 'sub/left.md'),
          two('R.', 'sub/b.md', 'sub/a.md'),
          two('R.', 'out/y.md', 'out/x.md'),
        ],
        'sub/'
      )
    ).toEqual([
      { path: 'b.md', status: 'moved', from: 'a.md' },
      { path: 'in.md', status: 'new' },
      { path: 'left.md', status: 'deleted' },
    ]);
  });

  it('passes over a path the host cannot address', () => {
    expect(
      changesFromStatus(
        parseStatusEntries(output('? a\\b.md', '? ok.md')),
        '',
        (path) => !path.includes('\\')
      )
    ).toEqual([{ path: 'ok.md', status: 'new' }]);
  });

  it('withIndexRemovals adds what the index removed and nothing already named', () => {
    const changes = statusOf([two('R.', 'sub/b.md', 'sub/a.md'), one('.D', 'sub/c.md')], 'sub/');
    expect(
      withIndexRemovals(changes, ['sub/a.md', 'sub/c.md', 'sub/gone.md', 'out/x.md'], 'sub/')
    ).toEqual([
      { path: 'b.md', status: 'moved', from: 'a.md' },
      { path: 'c.md', status: 'deleted' },
      { path: 'gone.md', status: 'deleted' },
    ]);
  });
});

describe('stagingPlan', () => {
  const entries = parseIndexEntries(
    [
      `100644 ${H} 0\tsub/a.md`,
      `100755 ${H} 0\tsub/run.sh`,
      `100644 ${H} 1\tsub/conflict.md`,
      `100644 ${H} 2\tsub/conflict.md`,
      `100644 ${H} 0\tsub/with\ttab.md`,
    ]
      .map((line) => `${line}\0`)
      .join('')
  );

  it('moves a tracked entry under the new path, with its mode, and removes a deleted one', () => {
    const plan = stagingPlan(
      [
        { kind: 'move', from: 'a.md', path: 'b/a.md' },
        { kind: 'delete', path: 'run.sh' },
        { kind: 'delete', path: 'with\ttab.md' },
      ],
      entries,
      'sub/'
    );
    expect(plan.input.split('\0')).toEqual([
      `0 ${Z}\tsub/a.md`,
      `100644 ${H} 0\tsub/b/a.md`,
      `0 ${Z}\tsub/run.sh`,
      `0 ${Z}\tsub/with\ttab.md`,
      '',
    ]);
    expect(plan.staged).toEqual(['a.md', 'b/a.md', 'run.sh', 'with\ttab.md']);
  });

  it('stages nothing for an untracked file, a conflicted one, a write or a create', () => {
    const plan = stagingPlan(
      [
        { kind: 'move', from: 'untracked.md', path: 'u2.md' },
        { kind: 'delete', path: 'conflict.md' },
        { kind: 'write', path: 'a.md', content: 'x' },
        { kind: 'create', path: 'n.md', content: 'x' },
      ],
      entries,
      'sub/'
    );
    expect(plan).toEqual({ input: '', staged: [] });
  });

  it('zeros the object id at the repository’s own length (SHA-256)', () => {
    const long = 'a'.repeat(64);
    const plan = stagingPlan(
      [{ kind: 'delete', path: 'a.md' }],
      parseIndexEntries(`100644 ${long} 0\ta.md\0`),
      ''
    );
    expect(plan.input).toBe(`0 ${'0'.repeat(64)}\ta.md\0`);
  });

  it('chunkPaths keeps each group under the byte limit', () => {
    const paths = Array.from({ length: 10 }, (_, i) => `${'x'.repeat(20)}${i}`);
    const chunks = chunkPaths(paths, 50);
    expect(chunks.flat()).toEqual(paths);
    expect(chunks).toHaveLength(5);
  });
});
