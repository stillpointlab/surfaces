// @vitest-environment jsdom
// The commit's pure parts: the rows in the tree's order, the field a refusal is
// about, and the commit a review's op asks for. In jsdom: the component's entry
// registers its element.
import { describe, expect, it } from 'vitest';

import { words } from '../words';

import {
  checkinOpFrom,
  commitFiles,
  commitRequestOf,
  compareTreePaths,
  refusalField,
} from './rows';

describe('the rows', () => {
  it('follow the tree: folders first at each level, names with numbers in order', () => {
    const paths = [
      'z.md',
      'a/b/c.md',
      'a/2.md',
      'a/10.md',
      'a/b.md',
      'B.md',
      'img-10.png',
      'img-9.png',
    ];
    expect([...paths].sort(compareTreePaths)).toEqual([
      'a/b/c.md',
      'a/2.md',
      'a/10.md',
      'a/b.md',
      'B.md',
      'img-9.png',
      'img-10.png',
      'z.md',
    ]);
  });

  it('each change with its status as its label, a moved one with where it was', () => {
    expect(
      commitFiles([
        { path: 'n.md', status: 'new' },
        { path: 'docs/moved.md', status: 'moved', from: 'old.md' },
        { path: 'gone.md', status: 'deleted' },
      ])
    ).toEqual([
      { path: 'docs/moved.md', from: 'old.md', label: 'moved' },
      { path: 'gone.md', label: 'deleted' },
      { path: 'n.md', label: 'new' },
    ]);
  });
});

describe('a refusal’s field', () => {
  it('the branch, the summary or the files, by the host’s code; else none', () => {
    expect(refusalField('HOST_BRANCH_EXISTS')).toBe('branch');
    expect(refusalField('HOST_BRANCH_INVALID')).toBe('branch');
    expect(refusalField('HOST_COMMIT_NO_MESSAGE')).toBe('title');
    expect(refusalField('HOST_COMMIT_NO_PATHS')).toBe('files');
    expect(refusalField('HOST_GIT_FAILED')).toBeNull();
  });
});

describe('the commit an op asks for', () => {
  it('the title as the summary, the body as the details, a new branch by name', () => {
    expect(
      commitRequestOf(
        { paths: ['a.md', 'b.md'], title: 'Fix', body: '\nWhy:\n# kept\n', branch: ' topic ' },
        'Inventory check-in'
      )
    ).toEqual({ paths: ['a.md', 'b.md'], message: 'Fix\n\nWhy:\n# kept', branch: 'topic' });
  });

  it('no title: the fallback; no branch: none', () => {
    expect(commitRequestOf({ paths: ['a.md'] }, words.apps.checkinTitle('Inventory'))).toEqual({
      paths: ['a.md'],
      message: 'Inventory check-in',
    });
  });

  it('an op is checked before it is read', () => {
    expect(checkinOpFrom({ paths: ['a.md'], title: 'T', context: { x: 1 } })).toEqual({
      paths: ['a.md'],
      title: 'T',
    });
    expect(checkinOpFrom({ paths: 'a.md' })).toBeNull();
    expect(checkinOpFrom({ paths: [1] })).toBeNull();
    expect(checkinOpFrom({ paths: [], branch: 3 })).toBeNull();
  });
});
