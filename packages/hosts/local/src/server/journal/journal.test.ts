// The journal over the memory port: each inverse, undo and redo, the limits, a
// step that cannot be kept, and a file that moved on, all without a folder.

import { createMemoryPort } from '@stillpointlab/common-format/host';
import { describe, expect, it } from 'vitest';

import { createJournal } from './journal';
import { labelFor } from './labels';

import type { IndexEntry, JournalIndex } from './journal';
import type { MemoryPort } from '@stillpointlab/common-format/host';

function setUp(
  files: Record<string, string>,
  options: { maxSteps?: number; maxBytes?: number; index?: JournalIndex } = {}
) {
  const port = createMemoryPort(files);
  let changes = 0;
  const journal = createJournal({ port, ...options, onChange: () => (changes += 1) });
  return { port, journal, changes: () => changes };
}

async function version(port: MemoryPort, path: string): Promise<string> {
  const read = await port.get(path);
  if (!read.ok) throw new Error(read.message);
  return read.version;
}

describe('the journal', () => {
  it.each([
    ['a write', { 'a.md': 'a' }, [{ kind: 'write', path: 'a.md', content: 'A' }], { 'a.md': 'A' }],
    [
      'a create',
      { 'a.md': 'a' },
      [{ kind: 'create', path: 'n/new.md', content: 'n' }],
      { 'a.md': 'a', 'n/new.md': 'n' },
    ],
    [
      'a move without content',
      { 'a.md': 'a' },
      [{ kind: 'move', from: 'a.md', path: 'd/b.md' }],
      { 'd/b.md': 'a' },
    ],
    [
      'a move with content',
      { 'a.md': 'a' },
      [{ kind: 'move', from: 'a.md', path: 'b.md', content: 'B' }],
      { 'b.md': 'B' },
    ],
    [
      'a delete',
      { 'a.md': 'a', 'd/c.md': 'c' },
      [{ kind: 'delete', path: 'd/c.md' }],
      { 'a.md': 'a' },
    ],
  ] as const)('undoes and redoes %s', async (_what, files, changes, after) => {
    const { port, journal } = setUp(files);
    const answer = await journal.port('Step').put(changes);
    expect(answer.ok).toBe(true);
    expect(port.files()).toEqual(after);
    expect(journal.labels()).toEqual({ undo: 'Step', redo: null });

    expect(await journal.undo()).toMatchObject({ ok: true, label: 'Step' });
    expect(port.files()).toEqual(files);
    expect(journal.labels()).toEqual({ undo: null, redo: 'Step' });

    expect(await journal.redo()).toMatchObject({ ok: true, label: 'Step' });
    expect(port.files()).toEqual(after);
    expect(journal.labels()).toEqual({ undo: 'Step', redo: null });

    // And back again: the versions the redo left are the next undo's bases.
    expect((await journal.undo()).ok).toBe(true);
    expect(port.files()).toEqual(files);
  });

  it('keeps what the step needs: its inverse, its forward, the versions after, its size', async () => {
    const { port, journal } = setUp({ 'a.md': 'old', 'gone.md': 'gone' });
    const answer = await journal.port('Many').put([
      { kind: 'write', path: 'a.md', content: 'new' },
      { kind: 'delete', path: 'gone.md' },
      { kind: 'create', path: 'é.md', content: 'é' },
    ]);
    if (!answer.ok) throw new Error(answer.message);
    const [step] = journal.steps().undo;
    expect(step).toEqual({
      label: 'Many',
      inverse: [
        { kind: 'delete', path: 'é.md' },
        { kind: 'create', path: 'gone.md', content: 'gone' },
        { kind: 'write', path: 'a.md', content: 'old' },
      ],
      forward: [
        { kind: 'write', path: 'a.md', content: 'new' },
        { kind: 'delete', path: 'gone.md' },
        { kind: 'create', path: 'é.md', content: 'é' },
      ],
      after: {
        'a.md': await version(port, 'a.md'),
        'gone.md': null,
        'é.md': answer.versions['é.md'],
      },
      bytes: 'gone'.length + 'old'.length + 'new'.length + 2,
    });
  });

  it('answers what the undo moved and deleted, for the page to follow', async () => {
    const { journal } = setUp({ 'a.md': 'a', 'b.md': 'b' });
    await journal.port('Two').put([
      { kind: 'move', from: 'a.md', path: 'x/a.md' },
      { kind: 'create', path: 'n.md', content: '' },
      { kind: 'delete', path: 'b.md' },
    ]);
    expect(await journal.undo()).toEqual({
      ok: true,
      label: 'Two',
      moved: [{ from: 'x/a.md', path: 'a.md' }],
      deleted: ['n.md'],
    });
    expect(await journal.redo()).toEqual({
      ok: true,
      label: 'Two',
      moved: [{ from: 'a.md', path: 'x/a.md' }],
      deleted: ['b.md'],
    });
  });

  it('undoes the newest step first, and a new step clears the redo side', async () => {
    const { port, journal, changes } = setUp({ 'a.md': '0' });
    const write = (label: string, content: string) =>
      journal.port(label).put([{ kind: 'write', path: 'a.md', content }]);
    await write('One', '1');
    await write('Two', '2');
    expect(journal.labels()).toEqual({ undo: 'Two', redo: null });
    await journal.undo();
    expect(port.files()).toEqual({ 'a.md': '1' });
    expect(journal.labels()).toEqual({ undo: 'One', redo: 'Two' });

    const before = changes();
    await write('Three', '3');
    expect(changes()).toBeGreaterThan(before);
    expect(journal.labels()).toEqual({ undo: 'Three', redo: null });
    expect(await journal.redo()).toMatchObject({ ok: false, code: 'HOST_NOTHING_TO_REDO' });
    await journal.undo();
    await journal.undo();
    expect(port.files()).toEqual({ 'a.md': '0' });
    expect(await journal.undo()).toMatchObject({ ok: false, code: 'HOST_NOTHING_TO_UNDO' });
  });

  it('keeps no step for a refused write, nor for an empty one', async () => {
    const { journal } = setUp({ 'a.md': 'a' });
    const writes = journal.port('No');
    expect(await writes.put([{ kind: 'create', path: 'a.md', content: '' }])).toMatchObject({
      ok: false,
      code: 'HOST_PATH_EXISTS',
    });
    expect(await writes.put([{ kind: 'delete', path: 'none.md' }])).toMatchObject({
      ok: false,
      code: 'HOST_FILE_NOT_FOUND',
    });
    expect(await writes.put([])).toEqual({ ok: true, versions: {} });
    expect(journal.labels()).toEqual({ undo: null, redo: null });
  });

  it('drops the oldest steps past the limit on steps', async () => {
    const { port, journal } = setUp({ 'a.md': '0' }, { maxSteps: 2 });
    for (const n of ['1', '2', '3']) {
      await journal.port(`Write ${n}`).put([{ kind: 'write', path: 'a.md', content: n }]);
    }
    expect(journal.steps().undo.map((step) => step.label)).toEqual(['Write 2', 'Write 3']);
    await journal.undo();
    await journal.undo();
    expect(port.files()).toEqual({ 'a.md': '1' });
    expect(await journal.undo()).toMatchObject({ code: 'HOST_NOTHING_TO_UNDO' });
  });

  it('drops the oldest steps past the limit on size', async () => {
    // Each write keeps 4 bytes: 2 of the old text and 2 of the new.
    const { journal } = setUp({ 'a.md': '00' }, { maxBytes: 10 });
    for (const n of ['11', '22', '33']) {
      await journal.port(`Write ${n}`).put([{ kind: 'write', path: 'a.md', content: n }]);
    }
    expect(journal.steps().undo.map((step) => [step.label, step.bytes])).toEqual([
      ['Write 22', 4],
      ['Write 33', 4],
    ]);
  });

  it('a step over the size limit: refused to the explorer, written with no step for an op', async () => {
    const { port, journal } = setUp({ 'a.md': 'a', 'big.md': 'x'.repeat(20) }, { maxBytes: 10 });
    await journal.port('Small').put([{ kind: 'write', path: 'a.md', content: 'A' }]);
    expect(journal.labels().undo).toBe('Small');

    const refusing = journal.port('Delete big.md', { unkept: 'refuse' });
    expect(await refusing.put([{ kind: 'delete', path: 'big.md' }])).toMatchObject({
      ok: false,
      code: 'HOST_CANNOT_UNDO',
      reason: 'too-large',
    });
    expect(port.files()).toHaveProperty('big.md');
    expect(journal.labels().undo).toBe('Small');

    const writing = journal.port('App: op');
    expect((await writing.put([{ kind: 'delete', path: 'big.md' }])).ok).toBe(true);
    expect(writing.unkept).toBe('too-large');
    expect(port.files()).not.toHaveProperty('big.md');
    // The older step could no longer be undone in order: the journal is empty.
    expect(journal.labels()).toEqual({ undo: null, redo: null });

    // The next kept step says it was kept.
    await writing.put([{ kind: 'write', path: 'a.md', content: 'B' }]);
    expect(writing.unkept).toBeNull();
  });

  it('a delete of a file the port cannot read as text cannot be kept; its rename can', async () => {
    const { port, journal } = setUp({ 'pic.png': 'PNG\0', 'a.md': 'a' });
    await journal.port('Small').put([{ kind: 'write', path: 'a.md', content: 'A' }]);
    const refusing = journal.port('Delete pic.png', { unkept: 'refuse' });
    expect(await refusing.put([{ kind: 'delete', path: 'pic.png' }])).toMatchObject({
      ok: false,
      code: 'HOST_CANNOT_UNDO',
      reason: 'not-text',
    });
    expect(port.files()).toHaveProperty('pic.png');

    expect(
      (await journal.port('Rename').put([{ kind: 'move', from: 'pic.png', path: 'p.png' }])).ok
    ).toBe(true);
    await journal.undo();
    expect(port.files()).toEqual({ 'pic.png': 'PNG\0', 'a.md': 'A' });

    // Asked again and agreed: written with no step, and the journal empties.
    expect((await journal.write([{ kind: 'delete', path: 'pic.png' }])).ok).toBe(true);
    expect(port.files()).toEqual({ 'a.md': 'A' });
    expect(journal.labels()).toEqual({ undo: null, redo: null });
  });

  it('a file changed between the read and the write refuses the step', async () => {
    const port = createMemoryPort({ 'a.md': 'a' });
    // A port whose first read lets another writer in before the step's write.
    const racing = {
      ...port,
      async get(path: string) {
        const read = await port.get(path);
        await port.put([{ kind: 'write', path: 'a.md', content: 'someone else' }]);
        return read;
      },
    };
    const journal = createJournal({ port: racing });
    expect(await journal.port('Delete a.md').put([{ kind: 'delete', path: 'a.md' }])).toMatchObject(
      { ok: false, code: 'HOST_FILE_CHANGED' }
    );
    expect(port.files()).toEqual({ 'a.md': 'someone else' });
    expect(journal.labels().undo).toBeNull();
  });

  it("keeps the writer's own base", async () => {
    const { port, journal } = setUp({ 'a.md': 'a' });
    expect(
      await journal.port('W').put([{ kind: 'write', path: 'a.md', content: 'A', base: 'stale' }])
    ).toMatchObject({ ok: false, code: 'HOST_FILE_CHANGED' });
    expect(port.files()).toEqual({ 'a.md': 'a' });
  });

  it('runs one step at a time', async () => {
    const { port, journal } = setUp({ 'a.md': 'a' });
    const base = await version(port, 'a.md');
    const [first, second] = await Promise.all([
      journal.port('1').put([{ kind: 'write', path: 'a.md', content: '1', base }]),
      journal.port('2').put([{ kind: 'write', path: 'a.md', content: '2', base }]),
    ]);
    expect([first.ok, second.ok]).toEqual([true, false]);
    expect(journal.steps().undo.map((step) => step.label)).toEqual(['1']);
  });
});

describe('a file changed since the step', () => {
  it.each([
    [
      'written over',
      (port: MemoryPort) => port.put([{ kind: 'write', path: 'd/a.md', content: 'x' }]),
      'd/a.md',
    ],
    ['deleted', (port: MemoryPort) => port.put([{ kind: 'delete', path: 'd/a.md' }]), 'd/a.md'],
  ])('refuses the undo when its file was %s, and writes nothing', async (_what, change, path) => {
    const { port, journal } = setUp({ 'd/a.md': 'a', 'b.md': 'b' });
    await journal.port('Two').put([
      { kind: 'write', path: 'd/a.md', content: 'A' },
      { kind: 'delete', path: 'b.md' },
    ]);
    await change(port);
    const before = port.files();
    const answer = await journal.undo();
    expect(answer).toMatchObject({ ok: false, code: 'HOST_UNDO_CONFLICT', path });
    expect(answer.ok || answer.message).toContain(path);
    expect(port.files()).toEqual(before);
    // The step stays.
    expect(journal.labels()).toEqual({ undo: 'Two', redo: null });
  });

  it('refuses the undo of a delete when a file is at its path again', async () => {
    const { port, journal } = setUp({ 'a.md': 'a' });
    await journal.port('Delete a.md').put([{ kind: 'delete', path: 'a.md' }]);
    await port.put([{ kind: 'create', path: 'a.md', content: 'new' }]);
    expect(await journal.undo()).toMatchObject({
      ok: false,
      code: 'HOST_UNDO_CONFLICT',
      path: 'a.md',
    });
    expect(port.files()).toEqual({ 'a.md': 'new' });
  });

  it('refuses the redo when the undone file changed, and keeps it', async () => {
    const { port, journal } = setUp({ 'a.md': 'a' });
    await journal.port('W').put([{ kind: 'write', path: 'a.md', content: 'A' }]);
    await journal.undo();
    await port.put([{ kind: 'write', path: 'a.md', content: 'edited' }]);
    expect(await journal.redo()).toMatchObject({
      ok: false,
      code: 'HOST_UNDO_CONFLICT',
      path: 'a.md',
    });
    expect(port.files()).toEqual({ 'a.md': 'edited' });
    expect(journal.labels()).toEqual({ undo: null, redo: 'W' });
  });

  it('an undo of a committed step makes a new change', async () => {
    const { port, journal } = setUp({ 'a.md': 'a' });
    await journal.port('W').put([{ kind: 'write', path: 'a.md', content: 'A' }]);
    port.commit();
    expect(port.changes()).toEqual([]);
    expect((await journal.undo()).ok).toBe(true);
    expect(port.changes()).toEqual([{ path: 'a.md', status: 'changed', base: 'A' }]);
  });
});

describe('the index', () => {
  /** An index in memory: the entries of tracked paths. */
  function fakeIndex(tracked: Record<string, string>) {
    const entries = new Map(
      Object.entries(tracked).map(([path, oid]) => [
        path,
        { mode: '100644', oid, stage: '0', path },
      ])
    );
    const restored: IndexEntry[][] = [];
    const index: JournalIndex = {
      entries: async (paths) =>
        paths.flatMap((path) => (entries.has(path) ? [entries.get(path)!] : [])),
      restore: async (back) => {
        restored.push([...back]);
        for (const entry of back) entries.set(entry.path, entry);
      },
    };
    return { index, entries, restored };
  }

  it('keeps the entries a delete removes, and puts them back on undo', async () => {
    const { index, restored } = fakeIndex({ 'a.md': 'aaa', 'b.md': 'bbb' });
    const { journal } = setUp({ 'a.md': 'a', 'b.md': 'b', 'u.md': 'u' }, { index });
    await journal.port('D').put([
      { kind: 'delete', path: 'a.md' },
      { kind: 'delete', path: 'u.md' },
    ]);
    expect(journal.steps().undo[0].index).toEqual([
      { mode: '100644', oid: 'aaa', stage: '0', path: 'a.md' },
    ]);
    await journal.undo();
    expect(restored).toEqual([[{ mode: '100644', oid: 'aaa', stage: '0', path: 'a.md' }]]);
  });

  it('a move keeps no entries: the port moves them', async () => {
    const { index, restored } = fakeIndex({ 'a.md': 'aaa' });
    const { journal } = setUp({ 'a.md': 'a' }, { index });
    await journal.port('M').put([{ kind: 'move', from: 'a.md', path: 'b.md' }]);
    expect(journal.steps().undo[0].index).toBeUndefined();
    await journal.undo();
    expect(restored).toEqual([]);
  });

  it('an undone create that had been staged gets its entry back on redo', async () => {
    const { index, entries, restored } = fakeIndex({});
    const { journal } = setUp({}, { index });
    await journal.port('C').put([{ kind: 'create', path: 'n.md', content: 'n' }]);
    entries.set('n.md', { mode: '100644', oid: 'nnn', stage: '0', path: 'n.md' });
    await journal.undo();
    entries.delete('n.md');
    await journal.redo();
    expect(restored).toEqual([[{ mode: '100644', oid: 'nnn', stage: '0', path: 'n.md' }]]);
  });
});

describe('labelFor', () => {
  it.each<[string, Parameters<typeof labelFor>[0]]>([
    ['Create notes.md', [{ kind: 'create', path: 'docs/notes.md', content: '' }]],
    ['Delete notes.md', [{ kind: 'delete', path: 'docs/notes.md' }]],
    ['Rename a.md to b.md', [{ kind: 'move', from: 'docs/a.md', path: 'docs/b.md' }]],
    ['Move a.md to other', [{ kind: 'move', from: 'docs/a.md', path: 'other/a.md' }]],
    ['Move a.md to the top folder', [{ kind: 'move', from: 'docs/a.md', path: 'a.md' }]],
    [
      'Delete 2 files in docs',
      [
        { kind: 'delete', path: 'docs/a.md' },
        { kind: 'delete', path: 'docs/deep/b.md' },
      ],
    ],
    [
      'Rename docs to notes',
      [
        { kind: 'move', from: 'docs/a.md', path: 'notes/a.md' },
        { kind: 'move', from: 'docs/deep/b.md', path: 'notes/deep/b.md' },
      ],
    ],
    [
      'Move docs to old',
      [
        { kind: 'move', from: 'docs/a.md', path: 'old/docs/a.md' },
        { kind: 'move', from: 'docs/b.md', path: 'old/docs/b.md' },
      ],
    ],
    [
      'Delete 2 files',
      [
        { kind: 'delete', path: 'a.md' },
        { kind: 'delete', path: 'b/c.md' },
      ],
    ],
  ])('%s', (label, changes) => {
    expect(labelFor(changes)).toBe(label);
  });
});
