import { describe, expect, it } from 'vitest';

import { fail, manifestFailure, ok, placeNewFiles } from '../app';

import { createMemoryPort } from './memory-port';
import { createInstance, hostRefusalClass, loadInstance, projectView, runOp } from './runner';

import type { AnyAppModule, AppCoreOp, AppModule, AppSnapshot, AppView, FileChange } from '../app';
import type { PortChange, StoragePort } from './index';
import type { MemoryPort } from './memory-port';
import type { LoadedInstance, RunnerHost } from './runner';

// A sample app: a `notes.app` manifest whose first line is `notes`, and every
// `.note` file under its folder. The ops cover each step: `append` rewrites a
// note, `add` creates one stamped with the host's time, `raw` makes whatever
// changes it is given (for the scope checks), `refuse` is the core's refusal,
// `nothing` changes nothing and `bad-reply` is refused by the reply.

type NotesSnapshot = AppSnapshot & { extra?: string };
type NotesFacts = { changed: string[] };
type NotesViews = {
  note: { params: { path: string }; state: object };
  all: { params: Record<never, never>; state: object };
};
type NotesOps = {
  append: { op: { path: string; text: string }; result: object };
  add: { op: { name: string; now: string }; result: { path: string } };
  raw: { op: { changes: FileChange[] }; result: object };
  refuse: { op: object; result: object };
  nothing: { op: object; result: object };
  'bad-reply': { op: object; result: object };
};
type NotesElementOps = {
  append: { op: { path: string; text: string }; reply: object };
  add: { op: { name: string }; reply: object };
  raw: { op: { changes: FileChange[] }; reply: object };
  refuse: { op: object; reply: object };
  nothing: { op: object; reply: object };
  'bad-reply': { op: object; reply: object };
  'link-editor': { op: { path: string }; reply: object };
};
type NotesSeed = { title: string; folder: string; confirmRoot?: boolean };

const folderOf = (manifestPath: string): string =>
  manifestPath.includes('/') ? manifestPath.slice(0, manifestPath.lastIndexOf('/')) : '';
const under = (folder: string, path: string): boolean =>
  folder === '' || path.startsWith(`${folder}/`);
const notesOf = (snapshot: AppSnapshot): string[] =>
  Object.keys(snapshot.files)
    .filter((path) => path.endsWith('.note'))
    .sort();

const seeds: NotesSeed[] = [];

const notesModule: AppModule<
  NotesViews,
  NotesOps,
  NotesFacts,
  NotesSeed,
  NotesSnapshot,
  NotesElementOps,
  { title: string }
> = {
  id: 'notes',
  lifecycle: {
    manifestName: 'notes.app',
    validateAndScope: (content, nodes, manifestPath) => {
      if (!content.startsWith('notes')) {
        return manifestFailure('NOTES_MANIFEST_INVALID', 'notes.app', ['it does not say notes']);
      }
      const folder = folderOf(manifestPath);
      const scope = new Set([manifestPath]);
      for (const node of nodes) {
        if (node.type === 'blob' && node.path.endsWith('.note') && under(folder, node.path)) {
          scope.add(node.path);
        }
      }
      return { ok: true, scope, warnings: content.includes('old') ? ['an old manifest'] : [] };
    },
    describeInstance: () => ({ label: 'Notes' }),
  },
  // Typed by hand: the core's generic signatures do not narrow on a switch.
  core: {
    project: (snapshot: NotesSnapshot, view: AppView<NotesViews>, facts: NotesFacts) => {
      if (view.type === 'all') return { notes: notesOf(snapshot), facts, extra: snapshot.extra };
      const text = snapshot.files[view.path];
      return typeof text === 'string' ? { text, facts, extra: snapshot.extra } : null;
    },
    apply: (snapshot: NotesSnapshot, op: AppCoreOp<NotesOps>) => {
      switch (op.type) {
        case 'append': {
          const text = snapshot.files[op.path];
          if (typeof text !== 'string') return fail('NOTES_NOT_FOUND', `No note at ${op.path}`);
          return ok({ changes: [{ kind: 'write', path: op.path, content: text + op.text }] });
        }
        case 'add': {
          const folder = folderOf(snapshot.manifestPath);
          const path = `${folder === '' ? '' : `${folder}/`}${op.name}.note`;
          return ok({ changes: [{ kind: 'create', path, content: `${op.now}\n` }], path });
        }
        case 'raw':
          return ok({ changes: op.changes });
        case 'refuse':
          return fail('NOTES_REFUSED', 'The core refused');
        default:
          return ok({ changes: [] });
      }
    },
    seed: (input: NotesSeed) => {
      seeds.push(input);
      if (input.title === 'refuse') return fail('NOTES_SEED_REFUSED', 'No');
      const prefix = input.folder === '' ? '' : `${input.folder}/`;
      const files: FileChange[] = [
        { kind: 'create', path: `${prefix}notes.app`, content: `notes: ${input.title}\n` },
        { kind: 'create', path: `${prefix}first.note`, content: 'first\n' },
      ];
      if (input.title === 'rewrite') files.push({ kind: 'write', path: 'a.note', content: '' });
      return ok({ manifestPath: `${prefix}notes.app`, files });
    },
  } as never,
  coreOps: ['append', 'add', 'raw', 'refuse', 'nothing', 'bad-reply'],
  hostOps: ['link-editor'],
  toCoreOp: (op, host) => (op.type === 'add' ? { ...op, now: host.now } : op) as never,
  reply: (op, applied, { snapshot, facts, view }) =>
    op.type === 'bad-reply'
      ? fail('NOTES_REPLY_REFUSED', 'The reply refused')
      : ok({
          notes: notesOf(snapshot),
          facts,
          extra: snapshot.extra,
          ...(view ? { view } : {}),
          ...('path' in applied ? { path: applied.path } : {}),
        }),
  refusalClass: (code) => (code === 'NOTES_NOT_FOUND' ? 'not-found' : 'invalid'),
  meta: { label: 'Notes', icon: 'file' },
  bounds: {
    op: (input) => {
      const op = input as Record<string, unknown>;
      if (op.type === 'append' && (typeof op.path !== 'string' || typeof op.text !== 'string')) {
        return fail('APP_OP_INVALID', 'The op is not valid: path', [{ path: ['path'] }]);
      }
      // The bound trims, so the core sees the op as bounded.
      if (op.type === 'add') return ok({ op: { ...op, name: String(op.name).trim() } as never });
      return ok({ op: op as never });
    },
    view: (input) => {
      const view = input as Record<string, unknown>;
      if (view.type === 'all') return ok({ view: { type: 'all' } });
      return view.type === 'note' && typeof view.path === 'string'
        ? ok({ view: { type: 'note', path: view.path } })
        : fail('APP_VIEW_INVALID', 'The view is not valid', [{ path: ['type'] }]);
    },
    create: (input) => {
      const title = (input as { title?: unknown }).title;
      return typeof title === 'string' && title !== ''
        ? ok({ input: { title } })
        : fail('APP_CREATE_INVALID', 'The input is not valid: title', [{ path: ['title'] }]);
    },
  },
  pages: [],
  placeCreate: (plan, paths) => {
    const placed = placeNewFiles(plan.files, paths);
    return placed.ok
      ? ok({ files: placed.files })
      : fail('NOTES_PATH_EXISTS', `Something is at ${placed.path}`);
  },
  fromChanges: (changes) => ({ facts: { changed: changes.map((change) => change.path) } }),
};

const module = notesModule as AnyAppModule;
const MANIFEST = 'notes/notes.app';
const NOW = '2026-11-14T12:00:00.000Z';
const FILES = {
  [MANIFEST]: 'notes\n',
  'notes/a.note': 'a',
  'notes/deep/b.note': 'b',
  'notes/readme.md': 'not a note',
  'README.md': 'the repository',
};

/** A port that records each `put` it is given. */
function recording(port: MemoryPort): MemoryPort & { puts: PortChange[][] } {
  const puts: PortChange[][] = [];
  return {
    ...port,
    puts,
    put: (changes) => {
      puts.push([...changes]);
      return port.put(changes);
    },
  };
}

/** A host over a memory port: the module's facts from its changes, and one snapshot part. */
function hostOver(
  files: Record<string, string> = FILES,
  before?: (port: MemoryPort, loaded: LoadedInstance) => Promise<void>
): RunnerHost & { port: MemoryPort & { puts: PortChange[][] }; told: number } {
  const port = recording(createMemoryPort(files));
  const host = {
    port,
    told: 0,
    async know(m: AnyAppModule, loaded: LoadedInstance) {
      host.told += 1;
      if (before) await before(port, loaded);
      return {
        facts: m.fromChanges(port.changes(), loaded.snapshot).facts,
        snapshot: { extra: 'known' },
      };
    },
    now: () => NOW,
  };
  return host;
}

describe('loadInstance', () => {
  it('reads the manifest and its scope, with every path the port lists', async () => {
    const loaded = await loadInstance(createMemoryPort(FILES), module, MANIFEST);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.snapshot).toEqual({
      manifestPath: MANIFEST,
      paths: [
        'README.md',
        'notes/a.note',
        'notes/deep/b.note',
        'notes/notes.app',
        'notes/readme.md',
      ],
      files: { [MANIFEST]: 'notes\n', 'notes/a.note': 'a', 'notes/deep/b.note': 'b' },
    });
    expect([...loaded.scope].sort()).toEqual(['notes/a.note', 'notes/deep/b.note', MANIFEST]);
    expect(Object.keys(loaded.versions).sort()).toEqual([
      'notes/a.note',
      'notes/deep/b.note',
      MANIFEST,
    ]);
    expect(loaded.warnings).toEqual([]);
  });

  it('answers the lifecycle’s warnings', async () => {
    const loaded = await loadInstance(
      createMemoryPort({ ...FILES, [MANIFEST]: 'notes, old\n' }),
      module,
      MANIFEST
    );
    expect(loaded.ok && loaded.warnings).toEqual(['an old manifest']);
  });

  it('refuses a manifest that is not there', async () => {
    const answer = await loadInstance(createMemoryPort(FILES), module, 'elsewhere/notes.app');
    expect(answer).toMatchObject({ ok: false, code: 'APP_MANIFEST_NOT_FOUND' });
  });

  it('loads a manifest the lifecycle refuses alone, with the refusal as a warning', async () => {
    const loaded = await loadInstance(
      createMemoryPort({ ...FILES, [MANIFEST]: 'something else\n' }),
      module,
      MANIFEST
    );
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.snapshot.files).toEqual({ [MANIFEST]: 'something else\n' });
    expect([...loaded.scope]).toEqual([MANIFEST]);
    expect(loaded.warnings).toEqual(['Invalid notes.app: it does not say notes']);
  });

  it('gives a file the port cannot read as null, with no version', async () => {
    const loaded = await loadInstance(
      createMemoryPort({ ...FILES, 'notes/binary.note': 'PNG\0' }),
      module,
      MANIFEST
    );
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.snapshot.files['notes/binary.note']).toBeNull();
    expect(loaded.versions['notes/binary.note']).toBeUndefined();
  });

  it('answers one revision for the same files, and another once one of them changes', async () => {
    const port = createMemoryPort(FILES);
    const first = await loadInstance(port, module, MANIFEST);
    const again = await loadInstance(port, module, MANIFEST);
    expect(first.ok && again.ok && first.revision === again.revision).toBe(true);

    await port.put([{ kind: 'write', path: 'README.md', content: 'not the instance’s' }]);
    const outside = await loadInstance(port, module, MANIFEST);
    expect(outside.ok && first.ok && outside.revision).toBe(first.ok && first.revision);

    await port.put([{ kind: 'write', path: 'notes/a.note', content: 'A' }]);
    const changed = await loadInstance(port, module, MANIFEST);
    expect(changed.ok && first.ok && changed.revision !== first.revision).toBe(true);

    await port.put([{ kind: 'create', path: 'notes/c.note', content: 'c' }]);
    const added = await loadInstance(port, module, MANIFEST);
    expect(added.ok && changed.ok && added.revision !== changed.revision).toBe(true);
  });
});

describe('runOp', () => {
  it('runs an op: written at its bases, replied from the instance loaded again', async () => {
    const host = hostOver();
    const loaded = await loadInstance(host.port, module, MANIFEST);
    if (!loaded.ok) throw new Error(loaded.message);

    const answer = await runOp(host, module, MANIFEST, {
      op: { type: 'append', path: 'notes/a.note', text: '+' },
    });
    if (!answer.ok) throw new Error(answer.message);
    expect(host.port.puts).toEqual([
      [
        {
          kind: 'write',
          path: 'notes/a.note',
          content: 'a+',
          base: loaded.versions['notes/a.note'],
        },
      ],
    ]);
    expect(answer.reply).toEqual({
      notes: ['notes/a.note', 'notes/deep/b.note'],
      // The facts are the second load's: the write is among the changes.
      facts: { changed: ['notes/a.note'] },
      extra: 'known',
    });
    const after = await loadInstance(host.port, module, MANIFEST);
    expect(after.ok && answer.revision).toBe(after.ok && after.revision);
    expect(answer.revision).not.toBe(loaded.revision);
    expect(host.told).toBe(2);
  });

  it('gives the core the bounded op with the host’s time, and the reply the bounded view', async () => {
    const host = hostOver();
    const answer = await runOp(host, module, MANIFEST, {
      op: { type: 'add', name: '  c  ' },
      view: { type: 'note', path: 'notes/a.note', ignored: true },
    });
    if (!answer.ok) throw new Error(answer.message);
    expect(host.port.puts).toEqual([
      [{ kind: 'create', path: 'notes/c.note', content: `${NOW}\n` }],
    ]);
    expect(answer.reply).toMatchObject({
      path: 'notes/c.note',
      view: { type: 'note', path: 'notes/a.note' },
    });
  });

  it('writes nothing for an op that changes nothing, and replies from the one load', async () => {
    const host = hostOver();
    const loaded = await loadInstance(host.port, module, MANIFEST);
    const answer = await runOp(host, module, MANIFEST, { op: { type: 'nothing' } });
    expect(answer).toMatchObject({ ok: true, revision: loaded.ok && loaded.revision });
    expect(host.port.puts).toEqual([]);
    expect(host.told).toBe(1);
  });

  describe('step 1: the op is one of the module’s core ops', () => {
    it.each([
      ['an unknown type', { type: 'shred' }],
      ['a host op', { type: 'link-editor', path: 'notes/a.note' }],
      ['an op with no type', { path: 'notes/a.note' }],
      ['no op at all', null],
    ])('refuses %s', async (_what, op) => {
      const host = hostOver();
      expect(await runOp(host, module, MANIFEST, { op })).toMatchObject({
        ok: false,
        code: 'APP_OP_UNKNOWN',
      });
      expect(host.told).toBe(0);
    });
  });

  describe('step 2: the op and the view are inside the module’s bounds', () => {
    it('refuses an op outside them', async () => {
      const host = hostOver();
      const answer = await runOp(host, module, MANIFEST, { op: { type: 'append', path: 1 } });
      expect(answer).toMatchObject({
        ok: false,
        code: 'APP_OP_INVALID',
        details: [{ path: ['path'] }],
      });
      expect(host.told).toBe(0);
    });

    it('refuses a view outside them', async () => {
      const host = hostOver();
      const answer = await runOp(host, module, MANIFEST, {
        op: { type: 'nothing' },
        view: { type: 'elsewhere' },
      });
      expect(answer).toMatchObject({ ok: false, code: 'APP_VIEW_INVALID' });
      expect(host.told).toBe(0);
    });
  });

  describe('step 3: the instance is loaded, and the host’s knowledge laid over', () => {
    it('refuses an instance whose manifest is gone', async () => {
      const host = hostOver();
      expect(
        await runOp(host, module, 'gone/notes.app', { op: { type: 'nothing' } })
      ).toMatchObject({ ok: false, code: 'APP_MANIFEST_NOT_FOUND' });
    });

    it('lays the host’s snapshot parts over the loaded snapshot before the core sees it', async () => {
      const seen: AppSnapshot[] = [];
      const spying = {
        ...module,
        core: {
          ...module.core,
          apply: (snapshot: AppSnapshot, op: never) => {
            seen.push(snapshot);
            return module.core.apply(snapshot, op);
          },
        },
      } as AnyAppModule;
      const answer = await runOp(hostOver(), spying, MANIFEST, { op: { type: 'nothing' } });
      expect(answer.ok).toBe(true);
      expect(seen[0]).toMatchObject({ manifestPath: MANIFEST, extra: 'known' });
    });
  });

  describe('step 4: the core applies the op', () => {
    it('answers the core’s refusal as it is', async () => {
      const host = hostOver();
      expect(await runOp(host, module, MANIFEST, { op: { type: 'refuse' } })).toEqual({
        ok: false,
        code: 'NOTES_REFUSED',
        message: 'The core refused',
      });
      expect(host.port.puts).toEqual([]);
    });
  });

  describe('step 5: every change is the instance’s', () => {
    it.each<[string, FileChange[]]>([
      ['a create outside its folder', [{ kind: 'create', path: 'elsewhere.note', content: '' }]],
      [
        'a create in a folder that only starts like its own',
        [{ kind: 'create', path: 'notes-old/x.note', content: '' }],
      ],
      [
        'a write of a file it did not load',
        [{ kind: 'write', path: 'notes/readme.md', content: '' }],
      ],
      ['a write of a file outside it', [{ kind: 'write', path: 'README.md', content: '' }]],
      [
        'a move of a file it did not load',
        [{ kind: 'move', from: 'notes/readme.md', path: 'notes/readme.note', content: '' }],
      ],
      [
        'a move out of its folder',
        [{ kind: 'move', from: 'notes/a.note', path: 'a.note', content: 'a' }],
      ],
      [
        'one change out of scope among good ones',
        [
          { kind: 'write', path: 'notes/a.note', content: 'A' },
          { kind: 'write', path: 'README.md', content: '' },
        ],
      ],
    ])('refuses %s, and writes nothing', async (_what, changes) => {
      const host = hostOver();
      const answer = await runOp(host, module, MANIFEST, { op: { type: 'raw', changes } });
      expect(answer).toMatchObject({ ok: false, code: 'APP_PATH_OUT_OF_SCOPE' });
      expect(host.port.puts).toEqual([]);
      expect(host.port.changes()).toEqual([]);
    });

    it('takes a create, a write and a move that are the instance’s', async () => {
      const host = hostOver();
      const answer = await runOp(host, module, MANIFEST, {
        op: {
          type: 'raw',
          changes: [
            { kind: 'create', path: 'notes/new/c.note', content: 'c' },
            { kind: 'write', path: 'notes/a.note', content: 'A' },
            { kind: 'move', from: 'notes/deep/b.note', path: 'notes/b.note', content: 'b' },
          ],
        },
      });
      expect(answer.ok).toBe(true);
      expect(host.port.changes().map((change) => [change.path, change.status])).toEqual([
        ['notes/a.note', 'changed'],
        ['notes/b.note', 'moved'],
        ['notes/new/c.note', 'new'],
      ]);
    });

    it('lets an instance at the root create anywhere', async () => {
      const host = hostOver({ 'notes.app': 'notes\n' });
      const answer = await runOp(host, module, 'notes.app', {
        op: { type: 'raw', changes: [{ kind: 'create', path: 'far/away.note', content: '' }] },
      });
      expect(answer.ok).toBe(true);
    });
  });

  describe('step 6: the changes are written in one put, at their bases', () => {
    it('writes a move at its source’s version, and a create with none', async () => {
      const host = hostOver();
      const loaded = await loadInstance(host.port, module, MANIFEST);
      if (!loaded.ok) throw new Error(loaded.message);
      await runOp(host, module, MANIFEST, {
        op: {
          type: 'raw',
          changes: [
            { kind: 'move', from: 'notes/a.note', path: 'notes/z.note', content: 'a' },
            { kind: 'create', path: 'notes/n.note', content: 'n' },
          ],
        },
      });
      expect(host.port.puts).toEqual([
        [
          {
            kind: 'move',
            from: 'notes/a.note',
            path: 'notes/z.note',
            content: 'a',
            base: loaded.versions['notes/a.note'],
          },
          { kind: 'create', path: 'notes/n.note', content: 'n' },
        ],
      ]);
    });

    it.each<[string, FileChange[]]>([
      [
        'one path written twice',
        [
          { kind: 'write', path: 'notes/a.note', content: '1' },
          { kind: 'write', path: 'notes/a.note', content: '2' },
        ],
      ],
      [
        'a move’s source written as well',
        [
          { kind: 'move', from: 'notes/a.note', path: 'notes/z.note', content: 'a' },
          { kind: 'write', path: 'notes/a.note', content: 'again' },
        ],
      ],
      [
        'two files created at one path',
        [
          { kind: 'create', path: 'notes/n.note', content: '1' },
          { kind: 'create', path: 'notes/n.note', content: '2' },
        ],
      ],
    ])(
      'refuses changes that name a path twice (%s) before the port sees them',
      async (_w, changes) => {
        const host = hostOver();
        const answer = await runOp(host, module, MANIFEST, { op: { type: 'raw', changes } });
        expect(answer).toMatchObject({ ok: false, code: 'APP_CHANGES_INVALID' });
        expect(host.port.puts).toEqual([]);
      }
    );

    it('answers a file changed under the op with the port’s conflict, and writes nothing', async () => {
      // The file moves on after the runner read it, before it writes.
      let once = false;
      const host = hostOver(FILES, async (port) => {
        if (once) return;
        once = true;
        await port.put([{ kind: 'write', path: 'notes/a.note', content: 'theirs' }]);
      });
      const answer = await runOp(host, module, MANIFEST, {
        op: { type: 'append', path: 'notes/a.note', text: '+' },
      });
      expect(answer).toMatchObject({ ok: false, code: 'HOST_FILE_CHANGED' });
      expect(hostRefusalClass((answer as { code: string }).code)).toBe('conflict');
      expect(host.port.files()['notes/a.note']).toBe('theirs');
    });

    it.each<[string, FileChange]>([
      ['rewrites', { kind: 'write', path: 'notes/binary.note', content: 'text now' }],
      [
        'moves',
        { kind: 'move', from: 'notes/binary.note', path: 'notes/text.note', content: 'text now' },
      ],
    ])(
      'refuses a change that %s a file the load could not read, with the port’s reason',
      async (_w, change) => {
        const host = hostOver({ ...FILES, 'notes/binary.note': 'PNG\0' });
        const answer = await runOp(host, module, MANIFEST, {
          op: { type: 'raw', changes: [change] },
        });
        expect(answer).toMatchObject({ ok: false, code: 'HOST_NOT_TEXT' });
        expect(hostRefusalClass('HOST_NOT_TEXT')).toBe('invalid');
        expect(host.port.puts).toEqual([]);
        expect(host.port.files()['notes/binary.note']).toBe('PNG\0');
      }
    );

    it('answers a create onto a file that is there with the port’s conflict', async () => {
      const host = hostOver();
      const answer = await runOp(host, module, MANIFEST, {
        op: { type: 'raw', changes: [{ kind: 'create', path: 'notes/a.note', content: 'x' }] },
      });
      expect(answer).toMatchObject({ ok: false, code: 'HOST_PATH_EXISTS' });
      expect(hostRefusalClass('HOST_PATH_EXISTS')).toBe('conflict');
    });
  });

  describe('step 7: the reply is read from the instance loaded again', () => {
    it('answers the reply’s refusal as it is, after the write', async () => {
      const host = hostOver();
      const answer = await runOp(host, module, MANIFEST, { op: { type: 'bad-reply' } });
      expect(answer).toEqual({
        ok: false,
        code: 'NOTES_REPLY_REFUSED',
        message: 'The reply refused',
      });
    });

    it('sees a moved file at its new path', async () => {
      const host = hostOver();
      const answer = await runOp(host, module, MANIFEST, {
        op: {
          type: 'raw',
          changes: [
            { kind: 'move', from: 'notes/a.note', path: 'notes/moved/a.note', content: 'a' },
          ],
        },
      });
      expect(answer.ok && answer.reply).toMatchObject({
        notes: ['notes/deep/b.note', 'notes/moved/a.note'],
        facts: { changed: ['notes/moved/a.note'] },
      });
    });
  });
});

describe('projectView', () => {
  it('projects a view with the host’s knowledge, and the load’s revision', async () => {
    const host = hostOver();
    await host.port.put([{ kind: 'write', path: 'notes/a.note', content: 'A' }]);
    const loaded = await loadInstance(host.port, module, MANIFEST);
    const answer = await projectView(host, module, MANIFEST, {
      type: 'note',
      path: 'notes/a.note',
    });
    expect(answer).toEqual({
      ok: true,
      state: { text: 'A', facts: { changed: ['notes/a.note'] }, extra: 'known' },
      revision: loaded.ok && loaded.revision,
    });
  });

  it('answers null when the view’s subject is gone', async () => {
    const answer = await projectView(hostOver(), module, MANIFEST, {
      type: 'note',
      path: 'notes/gone.note',
    });
    expect(answer).toMatchObject({ ok: true, state: null });
  });

  it('refuses a view outside the bounds, and an instance that is gone', async () => {
    expect(await projectView(hostOver(), module, MANIFEST, { type: 'x' })).toMatchObject({
      code: 'APP_VIEW_INVALID',
    });
    expect(await projectView(hostOver(), module, 'gone/notes.app', { type: 'all' })).toMatchObject({
      code: 'APP_MANIFEST_NOT_FOUND',
    });
  });
});

describe('createInstance', () => {
  it('seeds the files in the folder and writes them as creates in one put', async () => {
    const host = hostOver({ 'README.md': 'r' });
    seeds.length = 0;
    const answer = await createInstance(host, module, { folder: 'mine', input: { title: 'Mine' } });
    expect(answer).toEqual({ ok: true, manifestPath: 'mine/notes.app' });
    expect(seeds).toEqual([{ title: 'Mine', folder: 'mine' }]);
    expect(host.port.puts).toEqual([
      [
        { kind: 'create', path: 'mine/notes.app', content: 'notes: Mine\n' },
        { kind: 'create', path: 'mine/first.note', content: 'first\n' },
      ],
    ]);
    expect((await loadInstance(host.port, module, 'mine/notes.app')).ok).toBe(true);
  });

  it('passes consent to create at the root only when it is given', async () => {
    seeds.length = 0;
    await createInstance(hostOver({}), module, {
      folder: '',
      confirmRoot: true,
      input: { title: 'Root' },
    });
    expect(seeds).toEqual([{ title: 'Root', folder: '', confirmRoot: true }]);
  });

  it('refuses input outside the bound, and the seed’s refusal, as they are', async () => {
    expect(await createInstance(hostOver(), module, { folder: 'x', input: {} })).toMatchObject({
      code: 'APP_CREATE_INVALID',
    });
    expect(
      await createInstance(hostOver(), module, { folder: 'x', input: { title: 'refuse' } })
    ).toMatchObject({ code: 'NOTES_SEED_REFUSED' });
  });

  it.each([
    ['a file where the manifest goes', { 'mine/notes.app': 'there' }, 'mine/notes.app'],
    ['a file where the folder goes', { mine: 'a file' }, 'mine'],
  ])('refuses a create that does not fit (%s), and writes nothing', async (_what, files, path) => {
    const host = hostOver(files);
    const answer = await createInstance(host, module, { folder: 'mine', input: { title: 'M' } });
    expect(answer).toEqual({
      ok: false,
      code: 'NOTES_PATH_EXISTS',
      message: `Something is at ${path}`,
    });
    expect(host.port.puts).toEqual([]);
  });

  it('refuses a seed that writes anything but new files', async () => {
    const host = hostOver({});
    const answer = await createInstance(host, module, { folder: 'x', input: { title: 'rewrite' } });
    expect(answer).toMatchObject({ ok: false, code: 'APP_CHANGES_INVALID' });
    expect(host.port.puts).toEqual([]);
  });
});

describe('hostRefusalClass', () => {
  it.each([
    ['APP_OP_UNKNOWN', 'invalid'],
    ['APP_OP_INVALID', 'invalid'],
    ['APP_VIEW_INVALID', 'invalid'],
    ['APP_CREATE_INVALID', 'invalid'],
    ['APP_MANIFEST_NOT_FOUND', 'not-found'],
    ['APP_PATH_OUT_OF_SCOPE', 'invalid'],
    ['APP_CHANGES_INVALID', 'invalid'],
    ['HOST_FILE_CHANGED', 'conflict'],
    ['HOST_PATH_EXISTS', 'conflict'],
    ['HOST_FILE_NOT_FOUND', 'conflict'],
    ['HOST_NOT_TEXT', 'invalid'],
    ['HOST_FILE_TOO_LARGE', 'invalid'],
    ['HOST_PATH_OUTSIDE_ROOT', 'invalid'],
    ['HOST_PATH_INVALID', 'invalid'],
    ['HOST_BAD_REQUEST', 'invalid'],
  ])('classes %s as %s', (code, refusal) => {
    expect(hostRefusalClass(code)).toBe(refusal);
  });

  it('leaves the app’s codes, and a write that failed, to the caller', () => {
    expect(hostRefusalClass('NOTES_NOT_FOUND')).toBeUndefined();
    expect(hostRefusalClass('HOST_WRITE_FAILED')).toBeUndefined();
  });
});

/** The port's type is all the runner needs: a plain object with the four methods runs too. */
it('runs over any StoragePort', async () => {
  const memory = createMemoryPort(FILES);
  const port: StoragePort = {
    list: () => memory.list(),
    get: (path) => memory.get(path),
    put: (changes) => memory.put(changes),
    status: () => memory.status(),
  };
  const answer = await runOp(
    { port, know: async () => ({ facts: { changed: [] } }), now: () => NOW },
    module,
    MANIFEST,
    { op: { type: 'append', path: 'notes/a.note', text: '!' } }
  );
  expect(answer.ok).toBe(true);
  expect(memory.files()['notes/a.note']).toBe('a!');
});
