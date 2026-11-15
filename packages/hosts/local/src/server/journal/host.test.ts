// Undo and redo through the host's routes, over temporary folders and
// repositories: what `PUT /api/files` journals and what it does not, an image's
// delete and rename, a file changed since a step, the event, git's index put
// back as it was, and an app's op and create as one step each.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHost } from '../host';
import { eventReader, git, gitEnv, makeRepository, tempFolder, writeFiles } from '../test-support';

import type { LocalHost } from '../host';

const origin = 'http://127.0.0.1:5199';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 7, 0, 1]);

let folder: ReturnType<typeof tempFolder>;
let root: string;
let env: NodeJS.ProcessEnv;
let host: LocalHost;

beforeEach(() => {
  folder = tempFolder();
  root = join(folder.path, 'served');
  env = gitEnv(folder.path);
});
afterEach(async () => {
  await host?.close();
  folder.cleanup();
});

async function start(
  files: Record<string, string | Uint8Array>,
  repository = false
): Promise<LocalHost> {
  if (repository) makeRepository(root, env, files as Record<string, string>);
  else writeFiles(root, files);
  host = createHost({ root, origin, env, warn: () => undefined });
  await host.ready();
  return host;
}

function request(path: string, init: RequestInit = {}): Promise<Response> {
  return host.fetch(new Request(`${origin}${path}`, init));
}

async function send(
  path: string,
  method: string,
  body?: unknown
): Promise<{ status: number } & Record<string, unknown>> {
  const response = await request(path, {
    method,
    headers: { 'content-type': 'application/json', origin },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, ...((await response.json()) as Record<string, unknown>) };
}

const put = (changes: unknown[], unjournaled?: true) =>
  send('/api/files', 'PUT', unjournaled ? { changes, unjournaled } : { changes });
const undo = () => send('/api/undo', 'POST');
const redo = () => send('/api/redo', 'POST');
const labels = () => send('/api/journal', 'GET');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const there = (path: string) => existsSync(join(root, path));

describe('the routes', () => {
  it('journals the explorer’s writes, labelled, and answers what undo and redo did', async () => {
    await start({ 'docs/a.md': 'a', 'docs/b.md': 'b', 'notes.md': 'n' });
    expect(await labels()).toEqual({ status: 200, ok: true, undo: null, redo: null });
    expect(await undo()).toMatchObject({ status: 409, ok: false, code: 'HOST_NOTHING_TO_UNDO' });
    expect(await redo()).toMatchObject({ status: 409, ok: false, code: 'HOST_NOTHING_TO_REDO' });

    expect(
      await put([
        { kind: 'move', from: 'docs/a.md', path: 'notes/a.md' },
        { kind: 'move', from: 'docs/b.md', path: 'notes/b.md' },
      ])
    ).toMatchObject({ status: 200, ok: true });
    expect(await labels()).toMatchObject({ undo: 'Rename docs to notes', redo: null });
    expect(await undo()).toEqual({
      status: 200,
      ok: true,
      label: 'Rename docs to notes',
      moved: [
        { from: 'notes/b.md', path: 'docs/b.md' },
        { from: 'notes/a.md', path: 'docs/a.md' },
      ],
      deleted: [],
    });
    expect(read('docs/a.md')).toBe('a');
    expect(there('notes')).toBe(false);
    expect(await labels()).toMatchObject({ undo: null, redo: 'Rename docs to notes' });
    expect(await redo()).toMatchObject({ status: 200, label: 'Rename docs to notes' });
    expect(read('notes/b.md')).toBe('b');
  });

  it('does not journal an editor’s save, and the save leaves the steps alone', async () => {
    await start({ 'a.md': 'a', 'b.md': 'b' });
    await put([{ kind: 'create', path: 'c.md', content: '' }]);
    expect((await put([{ kind: 'write', path: 'a.md', content: 'A' }])).status).toBe(200);
    expect(await labels()).toMatchObject({ undo: 'Create c.md' });
    expect((await undo()).status).toBe(200);
    expect(read('a.md')).toBe('A');
    expect(there('c.md')).toBe(false);
  });

  it('sends the journal event when the steps change', async () => {
    await start({ 'a.md': 'a' });
    const stream = eventReader(await request('/api/events'));
    await stream.opened;
    await put([{ kind: 'delete', path: 'a.md' }]);
    await stream.next((event) => (event as { type: string }).type === 'journal');
    await undo();
    await stream.next((event) => (event as { type: string }).type === 'journal');
    await stream.close();
  });

  it('refuses a body whose unjournaled is not true', async () => {
    await start({ 'a.md': 'a' });
    expect(await send('/api/files', 'PUT', { changes: [], unjournaled: 'yes' })).toMatchObject({
      status: 400,
      code: 'HOST_BAD_REQUEST',
    });
  });
});

describe('a file that is not text', () => {
  it('a delete of an image is refused with HOST_CANNOT_UNDO, and written when asked again', async () => {
    await start({ 'pics/dot.png': PNG, 'pics/a.md': 'a', 'b.md': 'b' });
    await put([{ kind: 'create', path: 'c.md', content: 'c' }]);
    const changes = [
      { kind: 'delete', path: 'pics/dot.png' },
      { kind: 'delete', path: 'pics/a.md' },
    ];
    expect(await put(changes)).toMatchObject({
      status: 409,
      ok: false,
      code: 'HOST_CANNOT_UNDO',
      reason: 'not-text',
    });
    expect(there('pics/dot.png')).toBe(true);
    expect(there('pics/a.md')).toBe(true);
    expect(await labels()).toMatchObject({ undo: 'Create c.md' });

    expect(await put(changes, true)).toMatchObject({ status: 200, ok: true });
    expect(there('pics')).toBe(false);
    // Written with no step, and the older step goes with it.
    expect(await labels()).toMatchObject({ undo: null, redo: null });
  });

  it('a rename of an image is undone and redone, its bytes as they were', async () => {
    await start({ 'pics/dot.png': PNG });
    expect(await put([{ kind: 'move', from: 'pics/dot.png', path: 'dot.png' }])).toMatchObject({
      status: 200,
    });
    expect(await undo()).toMatchObject({
      status: 200,
      moved: [{ from: 'dot.png', path: 'pics/dot.png' }],
    });
    expect(new Uint8Array(readFileSync(join(root, 'pics/dot.png')))).toEqual(PNG);
    expect(there('dot.png')).toBe(false);
    expect((await redo()).status).toBe(200);
    expect(new Uint8Array(readFileSync(join(root, 'dot.png')))).toEqual(PNG);
  });
});

describe('a file changed since the step', () => {
  it('refuses the undo with the file named, keeps the step, and writes nothing', async () => {
    await start({ 'a.md': 'a', 'b.md': 'b' });
    await put([
      { kind: 'move', from: 'a.md', path: 'moved/a.md' },
      { kind: 'delete', path: 'b.md' },
    ]);
    writeFileSync(join(root, 'moved/a.md'), 'edited in a terminal');
    const answer = await undo();
    expect(answer).toMatchObject({
      status: 409,
      ok: false,
      code: 'HOST_UNDO_CONFLICT',
      path: 'moved/a.md',
    });
    expect(answer.message).toContain('moved/a.md');
    expect(there('a.md')).toBe(false);
    expect(there('b.md')).toBe(false);
    expect(read('moved/a.md')).toBe('edited in a terminal');
    expect(await labels()).toMatchObject({ undo: 'Change 2 files' });
  });

  it('refuses the undo of a delete when the path holds a file again', async () => {
    await start({ 'a.md': 'a' });
    await put([{ kind: 'delete', path: 'a.md' }]);
    writeFileSync(join(root, 'a.md'), 'new');
    expect(await undo()).toMatchObject({ status: 409, code: 'HOST_UNDO_CONFLICT', path: 'a.md' });
    expect(read('a.md')).toBe('new');
  });
});

describe('git’s index', () => {
  const status = () => git(root, env, 'status', '--porcelain');

  it('comes back as it was: a moved file with an unstaged edit, deletes of a staged edit and a staged new file', async () => {
    await start(
      { 'moved.md': 'moved\n'.repeat(20), 'staged.md': 'staged\n', 'other.md': 'o\n' },
      true
    );
    // The person's own work, before the host touches anything.
    writeFileSync(join(root, 'moved.md'), `${'moved\n'.repeat(20)}an unstaged edit\n`);
    writeFileSync(join(root, 'staged.md'), 'staged\nand a staged edit\n');
    writeFileSync(join(root, 'new.md'), 'a staged new file\n');
    git(root, env, 'add', '--', 'staged.md', 'new.md');
    const before = status();
    expect(before).toBe(' M moved.md\nA  new.md\nM  staged.md\n');

    expect((await put([{ kind: 'move', from: 'moved.md', path: 'docs/moved.md' }])).status).toBe(
      200
    );
    expect(
      (
        await put([
          { kind: 'delete', path: 'staged.md' },
          { kind: 'delete', path: 'new.md' },
        ])
      ).status
    ).toBe(200);
    expect(status()).not.toBe(before);

    expect((await undo()).status).toBe(200);
    expect((await undo()).status).toBe(200);
    expect(status()).toBe(before);

    // And again after a redo of both, and their undo.
    expect((await redo()).status).toBe(200);
    expect((await redo()).status).toBe(200);
    expect((await undo()).status).toBe(200);
    expect((await undo()).status).toBe(200);
    expect(status()).toBe(before);
  });

  it('a commit between a step and its undo: the undo makes a new change', async () => {
    await start({ 'a.md': 'a\n' }, true);
    await put([{ kind: 'delete', path: 'a.md' }]);
    git(root, env, 'commit', '-q', '-m', 'delete a');
    expect(status()).toBe('');
    expect((await undo()).status).toBe(200);
    expect(read('a.md')).toBe('a\n');
    // The entry the step kept is the committed file's: a new file, staged.
    expect(status()).toBe('A  a.md\n');
  });
});

describe('an app', () => {
  const MANIFEST = 'docs/tasks/tasks.yaml';
  const PHASE1 = 'docs/tasks/stage1/phase1';
  const PHASE2 = 'docs/tasks/stage1/phase2';
  const CARD = `${PHASE1}/specs/login.md`;
  const TASKS = [
    'version: 1',
    'columns:',
    '  - id: todo',
    '    label: Todo',
    '  - id: done',
    '    label: Done',
    'kinds:',
    '  - id: spec',
    'current:',
    '  stage: 1',
    '  phase: 1',
    '',
  ].join('\n');
  const FILES = {
    [MANIFEST]: TASKS,
    [CARD]: '---\ncolumn: todo\ntitle: Login\n---\n\n# Login\n',
    [`${PHASE2}/specs/.gitkeep`]: '',
  };
  const op = (body: object) => send('/api/apps/op', 'POST', { manifestPath: MANIFEST, ...body });

  it('an op with several changes is one step, undone and redone whole', async () => {
    await start(FILES, true);
    const closed = await op({ op: { type: 'close', kind: 'phase', paths: [CARD] } });
    expect(closed).toMatchObject({ status: 200, ok: true });
    expect(closed).not.toHaveProperty('notice');
    const moved = `${PHASE2}/specs/login.md`;
    expect(there(moved)).toBe(true);
    const after = read(MANIFEST);
    expect(after).not.toBe(TASKS);
    const [step] = host.journal.steps().undo;
    expect(step.label).toBe('Tasks: close');
    expect(step.forward.map((change) => change.kind).sort()).toEqual(['move', 'write']);

    expect(await undo()).toMatchObject({
      status: 200,
      label: 'Tasks: close',
      moved: [{ from: moved, path: CARD }],
    });
    expect(read(MANIFEST)).toBe(TASKS);
    expect(there(CARD)).toBe(true);
    expect(there(moved)).toBe(false);
    expect(git(root, env, 'status', '--porcelain')).toBe('');

    expect((await redo()).status).toBe(200);
    expect(read(MANIFEST)).toBe(after);
    expect(there(moved)).toBe(true);
  });

  it('an undo is not refused by the lock: it is the server’s own write', async () => {
    await start(FILES, true);
    await op({ op: { type: 'move', path: CARD, column: 'done' } });
    // The instance's files are locked: the explorer could not write this one.
    expect(await put([{ kind: 'delete', path: CARD }])).toMatchObject({
      code: 'HOST_SCOPE_LOCKED',
    });
    expect(await undo()).toMatchObject({ status: 200, label: 'Tasks: move' });
    expect(read(CARD)).toContain('column: todo');
  });

  it('a create is one step, and its undo deletes what it made', async () => {
    await start({ 'README.md': 'r\n' });
    const made = await send('/api/apps/create', 'POST', {
      app: 'tasks',
      folder: 'plans',
      input: { columns: [{ id: 'todo', label: 'Todo' }], kinds: [{ id: 'spec' }] },
    });
    expect(made).toMatchObject({ status: 200, ok: true, manifestPath: 'plans/tasks.yaml' });
    expect(await labels()).toMatchObject({ undo: 'Tasks: create' });
    expect((await undo()).status).toBe(200);
    expect(there('plans')).toBe(false);
    expect((await send('/api/apps', 'GET')).apps).toEqual([]);
  });
});
