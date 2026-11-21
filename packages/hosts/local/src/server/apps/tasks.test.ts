// Tasks in the local host's server, and creating either app: tasks' pages
// through the page route (the landing's redirect included), its three host ops,
// its facts from a real repository, and `POST /api/apps/create`.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHost } from '../host';
import { git, gitEnv, makeRepository, tempFolder, writeFiles } from '../test-support';

import type { FoundInstance } from '../../shared/apps';
import type { LocalHost } from '../host';

const origin = 'http://127.0.0.1:5199';

const MANIFEST = 'docs/tasks/tasks.yaml';
const PHASE1 = 'docs/tasks/stage1/phase1';
const PHASE2 = 'docs/tasks/stage1/phase2';
const CARD = `${PHASE1}/specs/login.md`;
const LOGIN = '---\ncolumn: todo\ntitle: Login\n---\n\n# Login\n';

const FILES: Record<string, string> = {
  [MANIFEST]: [
    'version: 1',
    'columns:',
    '  - id: todo',
    '    label: Todo',
    '  - id: in-progress',
    '    label: In progress',
    '  - id: done',
    '    label: Done',
    'kinds:',
    '  - id: spec',
    'current:',
    '  stage: 1',
    '  phase: 1',
    '',
  ].join('\n'),
  [CARD]: LOGIN,
  [`${PHASE1}/specs/other.md`]: `---\ncolumn: done\n---\n\n# Other\n\nSee [login](login.md).\n`,
  [`${PHASE2}/specs/.gitkeep`]: '',
  'README.md': 'The repository.\n',
};

const CREATE_TASKS = {
  columns: [
    { id: 'todo', label: 'Todo' },
    { id: 'done', label: 'Done' },
  ],
  kinds: [{ id: 'spec' }],
};

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

async function start(files: Record<string, string> = FILES, repository = true): Promise<void> {
  if (repository) makeRepository(root, env, files);
  else writeFiles(root, files);
  host = createHost({ root, origin, env, warn: () => undefined });
  await host.ready();
}

function request(path: string, init: RequestInit = {}): Promise<Response> {
  return host.fetch(new Request(`${origin}${path}`, init));
}

function post(path: string, body: unknown): Promise<Response> {
  return request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}

async function page(path = '', query = ''): Promise<Record<string, unknown> & { status: number }> {
  const params = new URLSearchParams({ manifestPath: MANIFEST, path, query });
  const response = await request(`/api/apps/page?${params}`);
  return { status: response.status, ...((await response.json()) as Record<string, unknown>) };
}

async function op(body: object): Promise<Record<string, unknown> & { status: number }> {
  const response = await post('/api/apps/op', { manifestPath: MANIFEST, ...body });
  return { status: response.status, ...((await response.json()) as Record<string, unknown>) };
}

async function apps(): Promise<FoundInstance[]> {
  return ((await (await request('/api/apps')).json()) as { apps: FoundInstance[] }).apps;
}

type Card = {
  path: string;
  column: string;
  dirty?: boolean;
  versionColumn?: string;
  movedFrom?: string;
};
const cardOf = (answer: Record<string, unknown>): Card => (answer.reply as { card: Card }).card;

describe('tasks’ pages through the page route', () => {
  beforeEach(() => start());

  it('finds the task project and its label', async () => {
    expect(await apps()).toMatchObject([
      { app: 'tasks', manifestPath: MANIFEST, folder: 'docs/tasks', icon: 'task', valid: true },
    ]);
  });

  it('redirects the landing to the current phase’s board, under the app’s base', async () => {
    expect(await page()).toEqual({
      status: 200,
      ok: true,
      redirect: '#/app/docs/tasks/tasks.yaml/stage/1/phase/1',
    });
  });

  it('answers a phase’s board, a stage, and a board by its old ?path= link', async () => {
    const phase = await page('/stage/1/phase/1');
    expect(phase).toMatchObject({ status: 200, view: { type: 'board', path: PHASE1 } });
    expect(phase.extras).toMatchObject({ docsRoot: 'docs/tasks' });
    const stage = await page('/stage/1');
    expect(stage).toMatchObject({
      status: 200,
      view: { type: 'stage', stage: 1 },
      title: 'Stage 1 — Tasks',
    });
    expect(await page('', `path=${encodeURIComponent(PHASE2)}`)).toMatchObject({
      redirect: '#/app/docs/tasks/tasks.yaml/stage/1/phase/2',
      permanent: true,
    });
    expect((await page('/stage/9')).status).toBe(404);
  });
});

describe('tasks’ host ops, answered before the runner', () => {
  beforeEach(() => start());

  it('read-file answers a file’s text, with no revision', async () => {
    expect(await op({ op: { type: 'read-file', path: CARD } })).toEqual({
      status: 200,
      ok: true,
      reply: { content: LOGIN },
    });
    const missing = await op({ op: { type: 'read-file', path: 'nowhere.md' } });
    expect(missing).toMatchObject({ status: 409, ok: false, code: 'HOST_FILE_NOT_FOUND' });
  });

  it('scan-references answers the files that link to a card at a path it left', async () => {
    const moved = await op({
      op: { type: 'move-file', path: CARD, target: { boardPath: PHASE2, column: 'todo' } },
    });
    expect(moved.status).toBe(200);
    const path = cardOf(moved).path;
    expect(await op({ op: { type: 'scan-references', path } })).toEqual({
      status: 200,
      ok: true,
      reply: { references: [`${PHASE1}/specs/other.md`] },
    });
  });

  it('refuses resolve: there is nothing to resolve without a remote', async () => {
    expect(await op({ op: { type: 'resolve', path: CARD, mode: 'take-latest' } })).toMatchObject({
      status: 409,
      ok: false,
      code: 'HOST_NOTHING_TO_RESOLVE',
    });
    expect(await op({ op: { type: 'read-file' } })).toMatchObject({
      status: 400,
      code: 'APP_OP_INVALID',
    });
  });
});

describe('tasks’ facts on a real repository', () => {
  beforeEach(() => start());

  it('marks a card moved to another column with the column it had', async () => {
    const moved = await op({
      op: { type: 'move', path: CARD, column: 'in-progress' },
      view: { type: 'board', path: PHASE1 },
    });
    expect(cardOf(moved)).toMatchObject({
      column: 'in-progress',
      dirty: true,
      versionColumn: 'todo',
    });
    expect(readFileSync(join(root, CARD), 'utf8')).toContain('column: in-progress');
  });

  it('says where a card moved to another phase came from, and git sees a rename', async () => {
    const moved = await op({
      op: { type: 'move-file', path: CARD, target: { boardPath: PHASE2, column: 'todo' } },
    });
    const card = cardOf(moved);
    expect(card).toMatchObject({ movedFrom: CARD });
    expect(card.path.startsWith(`${PHASE2}/`)).toBe(true);
    expect(git(root, env, 'status', '--porcelain').trim()).toBe(`R  ${CARD} -> ${card.path}`);
    // Read again through the page, the mark is still there.
    const board = await page('/stage/1/phase/2');
    const cards = (board.state as { cards: Card[] }).cards;
    expect(cards.find((candidate) => candidate.path === card.path)).toMatchObject({
      movedFrom: CARD,
    });
  });
});

describe('creating an instance', () => {
  const create = (body: object) => post('/api/apps/create', body);

  it('creates a task project in a folder: the files, the new row, locked', async () => {
    await start({ 'README.md': 'r\n' }, false);
    const response = await create({ app: 'tasks', folder: 'plans', input: CREATE_TASKS });
    expect(await response.json()).toEqual({ ok: true, manifestPath: 'plans/tasks.yaml' });
    expect(existsSync(join(root, 'plans/tasks.yaml'))).toBe(true);
    expect(await apps()).toMatchObject([
      { app: 'tasks', manifestPath: 'plans/tasks.yaml', valid: true, unlocked: false },
    ]);
  });

  it('creates an inventory with its first zone', async () => {
    await start({ 'README.md': 'r\n' }, false);
    const response = await create({
      app: 'inventory',
      folder: 'home',
      input: { label: 'Home', zones: ['Kitchen'] },
    });
    const answer = (await response.json()) as {
      ok: boolean;
      manifestPath?: string;
      message?: string;
    };
    expect(answer).toMatchObject({ ok: true, manifestPath: 'home/inventory.yaml' });
  });

  it('refuses a folder whose region would share a path with a found instance’s', async () => {
    await start({ 'README.md': 'r\n' }, false);
    await create({ app: 'tasks', folder: 'plans', input: CREATE_TASKS });
    for (const inside of ['plans/inventory', 'plans']) {
      const response = await create({ app: 'inventory', folder: inside, input: { label: 'Home' } });
      expect(response.status).toBe(409);
      expect(((await response.json()) as { code: string }).code).toBe('HOST_APP_OVERLAP');
    }
    // Above an instance is an overlap too.
    await create({ app: 'inventory', folder: 'a/b', input: { label: 'Home' } });
    const above = await create({ app: 'tasks', folder: 'a', input: CREATE_TASKS });
    expect(above.status).toBe(409);
    expect(await apps()).toHaveLength(2);
  });

  it('refuses a project at the root whose seeded files land in another instance’s folder', async () => {
    // A card the root project would own, in a folder an inventory holds.
    await start({ 'README.md': 'r\n', 'stage1/phase1/specs/a.md': '# A\n' }, false);
    await create({ app: 'inventory', folder: 'stage1', input: { label: 'Home' } });
    const root = await create({ app: 'tasks', folder: '', confirmRoot: true, input: CREATE_TASKS });
    expect(root.status).toBe(409);
    expect(((await root.json()) as { message: string }).message).toContain('stage1/inventory.yaml');
  });

  it('asks consent for a task project at the root, and creates it given', async () => {
    await start({ 'README.md': 'r\n' }, false);
    const refused = await create({ app: 'tasks', folder: '', input: CREATE_TASKS });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { code: string }).code).toBe('ROOT_CONFIRM_REQUIRED');
    const made = await create({ app: 'tasks', folder: '', confirmRoot: true, input: CREATE_TASKS });
    expect(await made.json()).toEqual({ ok: true, manifestPath: 'tasks.yaml' });
    expect((await apps())[0]).toMatchObject({ folder: '', manifestPath: 'tasks.yaml' });
  });

  it('refuses an app it does not know, a folder outside the root, and a bad input', async () => {
    await start({ 'README.md': 'r\n' }, false);
    expect((await create({ app: 'nope', folder: 'x', input: {} })).status).toBe(404);
    const outside = await create({ app: 'tasks', folder: '../x', input: CREATE_TASKS });
    expect(((await outside.json()) as { code: string }).code).toBe('HOST_PATH_OUTSIDE_ROOT');
    const unusable = await create({ app: 'tasks', folder: 'a//b', input: CREATE_TASKS });
    expect(unusable.status).toBe(400);
    expect(((await unusable.json()) as { code: string }).code).toBe('HOST_PATH_INVALID');
    const bad = await create({ app: 'tasks', folder: 'x', input: { columns: [] } });
    expect(bad.status).toBe(400);
    expect((await create({ app: 'tasks' })).status).toBe(400);
  });
});
