import { describe, expect, it } from 'vitest';

import { describeStoragePort } from '../testing/host';

import { createMemoryPort } from './memory-port';

describeStoragePort('the memory port', (files) => createMemoryPort(files));

describe('the memory port: changes and commit', () => {
  it('has no changes over the files it was made with', () => {
    const port = createMemoryPort({ 'a.md': 'a' });
    expect(port.changes()).toEqual([]);
  });

  it('answers each change with the text it had at the last commit, sorted by path', async () => {
    const port = createMemoryPort({ 'a.md': 'a', 'b.md': 'b', 'c.md': 'c', 'd.md': 'd' });
    await port.put([
      { kind: 'write', path: 'a.md', content: 'A' },
      { kind: 'move', from: 'b.md', path: 'docs/b.md', content: 'B' },
      { kind: 'delete', path: 'c.md' },
      { kind: 'create', path: 'n.md', content: 'n' },
    ]);
    expect(port.changes()).toEqual([
      { path: 'a.md', status: 'changed', base: 'a' },
      { path: 'c.md', status: 'deleted', base: 'c' },
      { path: 'docs/b.md', status: 'moved', from: 'b.md', base: 'b' },
      { path: 'n.md', status: 'new' },
    ]);
    expect(await port.status()).toEqual({
      'a.md': 'changed',
      'c.md': 'deleted',
      'docs/b.md': 'moved',
      'n.md': 'new',
    });
  });

  it('keeps a moved file anchored where it was committed, through every hop', async () => {
    const port = createMemoryPort({ 'one/card.md': 'x' });
    await port.put([{ kind: 'move', from: 'one/card.md', path: 'two/card.md' }]);
    await port.put([{ kind: 'move', from: 'two/card.md', path: 'three/card.md' }]);
    expect(port.changes()).toEqual([
      { path: 'three/card.md', status: 'moved', from: 'one/card.md', base: 'x' },
    ]);
    // Back where it was, as it was: nothing to report.
    await port.put([{ kind: 'move', from: 'three/card.md', path: 'one/card.md' }]);
    expect(port.changes()).toEqual([]);
  });

  it('a new file moved is still new; a write back to the committed text is no change', async () => {
    const port = createMemoryPort({ 'a.md': 'a' });
    await port.put([{ kind: 'create', path: 'n.md', content: 'n' }]);
    await port.put([{ kind: 'move', from: 'n.md', path: 'docs/n.md' }]);
    await port.put([{ kind: 'write', path: 'a.md', content: 'A' }]);
    await port.put([{ kind: 'write', path: 'a.md', content: 'a' }]);
    expect(port.changes()).toEqual([{ path: 'docs/n.md', status: 'new' }]);
  });

  it('a file made where a moved one was is a change there, beside the move', async () => {
    const port = createMemoryPort({ 'a.md': 'a' });
    await port.put([{ kind: 'move', from: 'a.md', path: 'b.md' }]);
    await port.put([{ kind: 'create', path: 'a.md', content: 'another' }]);
    expect(port.changes()).toEqual([
      { path: 'a.md', status: 'changed', base: 'a' },
      { path: 'b.md', status: 'moved', from: 'a.md', base: 'a' },
    ]);
  });

  it('starts from committed files of its own when given them', () => {
    const port = createMemoryPort(
      { 'a.md': 'A', 'n.md': 'n' },
      { committed: { 'a.md': 'a', 'gone.md': 'g' } }
    );
    expect(port.changes()).toEqual([
      { path: 'a.md', status: 'changed', base: 'a' },
      { path: 'gone.md', status: 'deleted', base: 'g' },
      { path: 'n.md', status: 'new' },
    ]);
  });

  it('commits everything: the files as they are become the ones compared against', async () => {
    const port = createMemoryPort({ 'a.md': 'a', 'b.md': 'b' });
    await port.put([
      { kind: 'write', path: 'a.md', content: 'A' },
      { kind: 'move', from: 'b.md', path: 'c.md' },
    ]);
    port.commit();
    expect(port.changes()).toEqual([]);
    await port.put([{ kind: 'move', from: 'c.md', path: 'd.md' }]);
    expect(port.changes()).toEqual([{ path: 'd.md', status: 'moved', from: 'c.md', base: 'b' }]);
  });

  it('commits chosen files: either path of a move commits both halves', async () => {
    const port = createMemoryPort({ 'a.md': 'a', 'b.md': 'b', 'c.md': 'c' });
    await port.put([
      { kind: 'write', path: 'a.md', content: 'A' },
      { kind: 'move', from: 'b.md', path: 'moved/b.md' },
      { kind: 'delete', path: 'c.md' },
      { kind: 'create', path: 'n.md', content: 'n' },
    ]);
    port.commit(['b.md', 'n.md']);
    expect(port.changes()).toEqual([
      { path: 'a.md', status: 'changed', base: 'a' },
      { path: 'c.md', status: 'deleted', base: 'c' },
    ]);
    port.commit(['c.md']);
    expect(port.changes()).toEqual([{ path: 'a.md', status: 'changed', base: 'a' }]);
    port.commit(['moved/b.md', 'not-a-change.md']);
    expect(port.changes()).toEqual([{ path: 'a.md', status: 'changed', base: 'a' }]);
  });

  it('answers its files as they are now, as a copy', async () => {
    const port = createMemoryPort({ 'a.md': 'a' });
    await port.put([{ kind: 'create', path: 'b.md', content: 'b' }]);
    const files = port.files();
    expect(files).toEqual({ 'a.md': 'a', 'b.md': 'b' });
    files['a.md'] = 'changed here';
    expect(await port.get('a.md')).toMatchObject({ text: 'a' });
  });

  it('refuses to be made over a path it would not answer', () => {
    expect(() => createMemoryPort({ '../a.md': 'a' })).toThrow(/outside|segment/);
    expect(() => createMemoryPort({}, { committed: { '/a.md': 'a' } })).toThrow(/absolute/);
  });
});
