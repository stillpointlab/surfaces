import { describe, expect, it } from 'vitest';

import { metadataDelta, metadataOnlyCheck, rebaseMetadata, trackedCardKeys } from './rebase.js';

// Draft rebasing's rules (phase 7, tasks-rules): the decisions Context
// Manager's auto-rebase-on-read and explicit rebase-metadata tests pinned —
// what heals, what stays diverged as metadata, what is content.

const KEYS = trackedCardKeys({ frontmatterKey: 'column' });
const doc = (front: string, body = '# Body\n'): string => `---\n${front}---\n\n${body}`;

describe('trackedCardKeys', () => {
  it('is the column key and the card surface’s own keys', () => {
    expect(trackedCardKeys({ frontmatterKey: 'status' })).toEqual([
      'status',
      'title',
      'tags',
      'blocked',
      'completed',
      'pr',
    ]);
  });
});

describe('metadataDelta', () => {
  it('patches my changes and removals over the keys, and flags what it cannot carry', () => {
    expect(
      metadataDelta(
        { column: 'done', tags: ['a'], owner: 'me' },
        { column: 'todo', title: 'T', owner: 'you' },
        KEYS
      )
    ).toEqual({
      patch: { column: 'done', tags: ['a'], title: null },
      changedKeys: ['column', 'tags', 'title'],
      untrackedChange: true,
    });
  });

  it('a value the rewriter cannot write is a change it cannot carry', () => {
    expect(metadataDelta({ blocked: { why: 1 } }, {}, KEYS)).toMatchObject({
      changedKeys: ['blocked'],
      untrackedChange: true,
    });
  });
});

describe('metadataOnlyCheck', () => {
  it('equal bodies are metadata-only', () => {
    expect(metadataOnlyCheck(doc('column: done\n'), doc('column: todo\n'))).toEqual({
      sameBody: true,
    });
  });

  it('otherwise answers the base with all my frontmatter changes, for the host to format and compare', () => {
    const base = '# No frontmatter\n';
    const draft = '---\ncolumn: done\n---\n\n# No frontmatter\n';
    const check = metadataOnlyCheck(draft, base);
    expect(check).toMatchObject({ sameBody: false });
    expect(check.sameBody === false && check.reconstructed).toContain('column: done');
  });

  it('answers no reconstruction when a change cannot be carried', () => {
    const check = metadataOnlyCheck(doc('x: {a: 1}\n', 'new body\n'), doc('x: 1\n'));
    expect(check).toEqual({ sameBody: false, reconstructed: null });
  });
});

describe('rebaseMetadata', () => {
  const base = doc('column: todo\ntitle: Old\n');
  const rebase = (draft: string, latest: string, mineWins = false, metadataOnly = true) =>
    rebaseMetadata({ draft, base, latest, keys: KEYS, mineWins, metadataOnly });

  it('a frontmatter-only, collision-free divergence heals onto the latest', () => {
    const latest = doc('column: todo\ntitle: New upstream\n', '# Edited upstream\n');
    expect(rebase(doc('column: done\ntitle: Old\n'), latest)).toEqual({
      outcome: 'rebased',
      content: doc('column: done\ntitle: New upstream\n', '# Edited upstream\n'),
    });
  });

  it('both sides changing a key to the same value is no collision', () => {
    const latest = doc('column: done\ntitle: Old\n');
    expect(rebase(doc('column: done\ntitle: Old\n'), latest)).toMatchObject({
      outcome: 'rebased',
    });
  });

  it('a key both sides changed differently stays diverged as metadata', () => {
    const latest = doc('column: in-progress\ntitle: Old\n');
    expect(rebase(doc('column: done\ntitle: Old\n'), latest)).toEqual({ outcome: 'metadata' });
  });

  it('a change to a key outside the patch stays diverged as metadata', () => {
    const latest = doc('column: todo\ntitle: Old\n');
    expect(rebase(doc('column: done\ntitle: Old\nowner: me\n'), latest)).toEqual({
      outcome: 'metadata',
    });
  });

  it('parse-equal frontmatter has nothing to reapply: metadata', () => {
    expect(rebase(doc('title: Old\ncolumn: todo\n'), doc('column: todo\n'))).toEqual({
      outcome: 'metadata',
    });
  });

  it('a body edit is content, whoever wins', () => {
    const latest = doc('column: todo\n');
    expect(rebase(doc('column: done\n'), latest, false, false)).toEqual({ outcome: 'content' });
    expect(rebase(doc('column: done\n'), latest, true, false)).toEqual({ outcome: 'content' });
  });

  it('mine wins: my tracked keys over a collision, my other changes dropped', () => {
    const latest = doc('column: in-progress\ntitle: Old\n');
    expect(rebase(doc('column: done\ntitle: Old\nowner: me\n'), latest, true)).toEqual({
      outcome: 'rebased',
      content: doc('column: done\ntitle: Old\n'),
    });
  });
});
