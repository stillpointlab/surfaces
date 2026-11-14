import { describe, expect, it } from 'vitest';

import {
  deleteChanges,
  filesUnder,
  folderProblem,
  indexListing,
  movedTo,
  nameRange,
  pathProblem,
  renameChanges,
} from './paths';

import type { FolderNode } from '@stillpointlab/common-format/app';

const blob = (path: string): FolderNode => ({ path, type: 'blob' });
const tree = (path: string): FolderNode => ({ path, type: 'tree' });

// As the server lists them: folders as nodes, a submodule as a folder with nothing under it.
const nodes = [
  blob('a.md'),
  tree('docs'),
  blob('docs/b.md'),
  tree('docs/deep'),
  blob('docs/deep/c.png'),
  blob('docs-old.md'),
  tree('vendor'),
  tree('vendor/lib'),
  tree('ext'),
];
const index = indexListing(nodes);
const none = () => null;

describe('the listing', () => {
  it('knows files, folders, and folders listed with nothing under them', () => {
    expect([...index.files].sort()).toEqual([
      'a.md',
      'docs-old.md',
      'docs/b.md',
      'docs/deep/c.png',
    ]);
    expect([...index.folders].sort()).toEqual(['docs', 'docs/deep', 'ext', 'vendor', 'vendor/lib']);
    expect([...index.separate].sort()).toEqual(['ext', 'vendor/lib']);
  });

  it('implies the folders above a path that has no node of its own', () => {
    const implied = indexListing([blob('x/y/z.md')]);
    expect([...implied.folders].sort()).toEqual(['x', 'x/y']);
    expect(implied.separate.size).toBe(0);
  });

  it('lists the files under a folder at any depth, and no sibling that shares its prefix', () => {
    expect(filesUnder(index, 'docs')).toEqual(['docs/b.md', 'docs/deep/c.png']);
  });

  it('turns off a folder’s writes for a separate repository, one inside it, and a cut listing', () => {
    expect(folderProblem(index, 'docs')).toBeNull();
    expect(folderProblem(index, 'ext')).toMatch(/separate repository/);
    expect(folderProblem(index, 'vendor')).toMatch(/holds a separate repository/);
    expect(folderProblem(indexListing(nodes, true), 'docs')).toMatch(/too large to list/);
  });
});

describe('the path check', () => {
  it.each([
    ['', 'Enter a path.'],
    ['/abs.md', 'Start the path inside the served folder, without a leading slash.'],
    ['docs/../x.md', 'A path cannot have a “..” segment.'],
    ['..', 'A path cannot have a “..” segment.'],
    ['docs/', 'Enter a name after the last slash.'],
    ['a.md', 'There is already a file at a.md.'],
    ['docs', 'There is already a folder at docs.'],
    ['docs/deep', 'There is already a folder at docs/deep.'],
    ['a.md/inner.md', 'a.md is a file, so it cannot hold another.'],
  ])('refuses %j', (path, message) => {
    expect(pathProblem(index, path)).toBe(message);
  });

  it('lets by a new path, a name with dots in it, and what only the server refuses', () => {
    for (const path of ['new.md', 'docs/new/n.md', 'a..b.md', 'docs/./x.md', 'x\\y.md']) {
      expect(pathProblem(index, path)).toBeNull();
    }
  });

  it('refuses a folder moved inside itself, but not into a sibling with its name as a prefix', () => {
    const renaming = { from: 'docs', kind: 'folder' as const };
    expect(pathProblem(index, 'docs/inner', renaming)).toBe('A folder cannot move inside itself.');
    expect(pathProblem(index, 'docs-new', renaming)).toBeNull();
    // Onto a folder that is there already: no merge.
    expect(pathProblem(index, 'ext', renaming)).toBe('There is already a folder at ext.');
  });

  it('lets a rename that changes only the case of a name by', () => {
    expect(pathProblem(index, 'A.md', { from: 'a.md', kind: 'file' })).toBeNull();
  });
});

describe('the changes', () => {
  it('renames a file with one move, carrying the base the page holds', () => {
    expect(
      renameChanges(index, { from: 'a.md', kind: 'file' }, 'notes/a.md', (path) =>
        path === 'a.md' ? 'v1' : null
      )
    ).toEqual([{ kind: 'move', from: 'a.md', path: 'notes/a.md', base: 'v1' }]);
  });

  it('renames a folder with one move per file under it, and no content', () => {
    const changes = renameChanges(index, { from: 'docs', kind: 'folder' }, 'guide', (path) =>
      path === 'docs/b.md' ? 'v2' : null
    );
    expect(changes).toEqual([
      { kind: 'move', from: 'docs/b.md', path: 'guide/b.md', base: 'v2' },
      { kind: 'move', from: 'docs/deep/c.png', path: 'guide/deep/c.png' },
    ]);
    expect(changes.every((change) => !('content' in change))).toBe(true);
  });

  it('deletes a file, or every file under a folder', () => {
    expect(deleteChanges(index, 'a.md', 'file', none)).toEqual([{ kind: 'delete', path: 'a.md' }]);
    expect(
      deleteChanges(index, 'docs', 'folder', (path) => (path === 'docs/b.md' ? 'v2' : null))
    ).toEqual([
      { kind: 'delete', path: 'docs/b.md', base: 'v2' },
      { kind: 'delete', path: 'docs/deep/c.png' },
    ]);
  });

  it('says where a path went', () => {
    expect(movedTo('docs/deep/c.png', 'docs', 'guide')).toBe('guide/deep/c.png');
    expect(movedTo('docs', 'docs', 'guide')).toBe('guide');
    expect(movedTo('docs-old.md', 'docs', 'guide')).toBeUndefined();
  });

  it('selects the name in a rename’s field', () => {
    expect(nameRange('docs/deep/c.png')).toEqual([10, 15]);
    expect(nameRange('a.md')).toEqual([0, 4]);
  });
});
