// The review's pure parts: rows and their checks, groups, what is missing, the
// op, and the message a host over git makes of a title and a body.
import { describe, expect, it } from 'vitest';

import { bodyOf, checkinOpOf, checkinProblem, groupsOf, messageOf, rowsFor } from './request';

import type { CheckinFile, CheckinInput } from './request';

const FILES: CheckinFile[] = [
  { path: 'a.md', label: 'changed' },
  { path: 'new/b.md', from: 'b.md', label: 'moved' },
  { path: 'gone.md', label: 'deleted' },
];

const input = (overrides: Partial<CheckinInput> = {}): CheckinInput => ({
  rows: rowsFor(FILES),
  title: 'A title',
  body: '',
  titleRequired: false,
  branch: null,
  ...overrides,
});

describe('rows', () => {
  it('start checked when the review opens', () => {
    expect(rowsFor(FILES).map((row) => row.checked)).toEqual([true, true, true]);
  });

  it('read again: a row keeps its check, a new one starts unchecked, a gone one goes', () => {
    const rows = rowsFor(FILES);
    rows[0]!.checked = false;
    const again = rowsFor([FILES[0]!, FILES[1]!, { path: 'late.md', label: 'new' }], rows);
    expect(again.map((row) => [row.file.path, row.checked])).toEqual([
      ['a.md', false],
      ['new/b.md', true],
      ['late.md', false],
    ]);
  });
});

describe('groups', () => {
  it('gather rows by group in the order each first appears, rows in their own order', () => {
    const rows = rowsFor([
      { path: 'p2/a.md', label: 'x', group: 'Phase 2' },
      { path: 'order.yaml', label: 'x', group: 'Pool & config' },
      { path: 'p2/b.md', label: 'x', group: 'Phase 2' },
      { path: 'loose.md', label: 'x' },
      { path: 'p1/c.md', label: 'x', group: 'Phase 1' },
      { path: 'loose-2.md', label: 'x', group: '' },
    ]);
    expect(
      groupsOf(rows).map((group) => [group.name, group.rows.map(({ index }) => index)])
    ).toEqual([
      ['Phase 2', [0, 2]],
      ['Pool & config', [1]],
      [null, [3, 5]],
      ['Phase 1', [4]],
    ]);
  });
});

describe('what is missing', () => {
  it('a file, then a required title, then a new branch’s name', () => {
    const none = rowsFor(FILES).map((row) => ({ ...row, checked: false }));
    expect(checkinProblem(input({ rows: none, title: '' }))).toBe('files');
    expect(checkinProblem(input({ title: '  ', titleRequired: true }))).toBe('title');
    expect(checkinProblem(input({ title: '', titleRequired: false }))).toBeNull();
    expect(checkinProblem(input({ branch: '  ' }))).toBe('branch');
    expect(checkinProblem(input({ branch: 'topic' }))).toBeNull();
  });
});

describe('the op', () => {
  it('each checked path, a moved file’s old path too, and only what was given', () => {
    const rows = rowsFor(FILES);
    rows[0]!.checked = false;
    expect(checkinOpOf(input({ rows, title: '  ', body: '\n  \n' }))).toEqual({
      paths: ['new/b.md', 'b.md', 'gone.md'],
    });
    expect(
      checkinOpOf(
        input({
          title: ' Fix it ',
          body: '\n\n  Why:\n# kept\n\n',
          branch: ' topic ',
          onBranch: 'main',
          context: { a: 1 },
        })
      )
    ).toEqual({
      paths: ['a.md', 'new/b.md', 'b.md', 'gone.md'],
      title: 'Fix it',
      body: '  Why:\n# kept',
      branch: 'topic',
      onBranch: 'main',
      context: { a: 1 },
    });
    // Not on a branch is said too; a review that showed none says nothing.
    expect(checkinOpOf(input({ rows: [], title: '', onBranch: null }))).toEqual({
      paths: [],
      onBranch: null,
    });
  });

  it('a message: the title, then the body after a blank line', () => {
    expect(messageOf('  Fix it  ', '')).toBe('Fix it');
    expect(messageOf('Fix it', '\n\n  Why:\n# kept\n\n')).toBe('Fix it\n\n  Why:\n# kept');
    expect(bodyOf('   \n\t')).toBe('');
  });
});
