// The apps in the local host's server, over temporary folders and repositories:
// discovery, the lock and its check on `PUT /api/files`, the `apps` event, and the
// page, project and op routes over inventory's real module.

import { chmodSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { loadInstance } from '@stillpointlab/common-format/host';
import { inventoryModule } from '@stillpointlab/inventory-app';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHost } from '../host';
import { eventReader, git, gitEnv, makeRepository, tempFolder, writeFiles } from '../test-support';

import type { FoundInstance } from '../../shared/apps';
import type { LocalHost } from '../host';
import type { AnyAppModule, AppFileChange } from '@stillpointlab/common-format/app';

const origin = 'http://127.0.0.1:5199';

const MANIFEST = 'version: 1\nlabel: Maple St House\ncurrency: USD\n';
const KITCHEN =
  'label: Kitchen\nitems:\n  - id: mugs\n    title: Diner mugs\n    quantity: 6\n    value: 8\n';
const ATTIC = 'label: Attic\nitems: []\n';
const BROKEN = 'version: 99\n';

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
  files: Record<string, string>,
  repository = false,
  modules?: AnyAppModule[]
): Promise<LocalHost> {
  if (repository) makeRepository(root, env, files);
  else writeFiles(root, files);
  host = createHost({ root, origin, token: null, env, warn: () => undefined, apps: modules });
  await host.ready();
  return host;
}

function request(path: string, init: RequestInit = {}): Promise<Response> {
  return host.fetch(new Request(`${origin}${path}`, init));
}

function send(path: string, method: string, body: unknown): Promise<Response> {
  return request(path, {
    method,
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}

async function apps(): Promise<FoundInstance[]> {
  const response = await request('/api/apps');
  expect(response.status).toBe(200);
  return ((await response.json()) as { apps: FoundInstance[] }).apps;
}

const put = (changes: unknown[]) => send('/api/files', 'PUT', { changes });
const lock = (manifestPath: string, locked: boolean) =>
  send('/api/apps/lock', 'POST', { manifestPath, locked });
const op = (manifestPath: string, body: object) =>
  send('/api/apps/op', 'POST', { manifestPath, ...body });

function page(manifestPath: string, path = '', query = ''): Promise<Response> {
  const params = new URLSearchParams({ manifestPath, path, query });
  return request(`/api/apps/page?${params}`);
}

const house = {
  'home/inventory.yaml': MANIFEST,
  'home/rooms/kitchen.yaml': KITCHEN,
  'notes.md': '# Notes\n',
};

describe('discovery', () => {
  it('finds an instance in a folder: its label, icon, region and lock', async () => {
    await start(house);
    expect(await apps()).toEqual([
      {
        app: 'inventory',
        manifestPath: 'home/inventory.yaml',
        folder: 'home',
        label: 'Maple St House',
        icon: 'inventory',
        valid: true,
        errors: [],
        unlocked: false,
      },
    ]);
  });

  it('finds an instance at the root, whose region is its scope', async () => {
    await start({
      'inventory.yaml': MANIFEST,
      'rooms/kitchen.yaml': KITCHEN,
      'rooms/notes.txt': 'not a zone',
      'readme.md': 'x',
    });
    const [found] = await apps();
    expect(found).toMatchObject({ folder: '', valid: true, label: 'Maple St House' });
    expect(found.scope).toEqual(['inventory.yaml', 'rooms/kitchen.yaml']);
  });

  it('reports an invalid manifest with the lifecycle’s errors and the generic label', async () => {
    await start({ 'broken/inventory.yaml': BROKEN });
    const [found] = await apps();
    expect(found).toMatchObject({ valid: false, label: 'Inventory', unlocked: false });
    expect(found.errors.length).toBeGreaterThan(0);
  });

  it('reports two instances whose regions overlap, each naming the other', async () => {
    await start({ ...house, 'home/rooms/inventory.yaml': MANIFEST });
    const found = await apps();
    expect(found.map((instance) => [instance.manifestPath, instance.valid])).toEqual([
      ['home/inventory.yaml', false],
      ['home/rooms/inventory.yaml', false],
    ]);
    expect(found[0].errors).toEqual([
      'Its files overlap the inventory app at home/rooms/inventory.yaml, so neither opens.',
    ]);
    expect(found[1].errors[0]).toContain('home/inventory.yaml');
  });

  it('reports a root instance whose scope reaches into another instance’s folder', async () => {
    await start({
      'inventory.yaml': MANIFEST,
      'rooms/kitchen.yaml': KITCHEN,
      'rooms/inventory.yaml': MANIFEST,
    });
    const found = await apps();
    expect(found.every((instance) => !instance.valid)).toBe(true);
  });

  it('keeps a root instance and a folder instance apart when the scope stays out', async () => {
    await start({ 'inventory.yaml': MANIFEST, 'rooms/kitchen.yaml': KITCHEN, ...house });
    expect((await apps()).map((instance) => instance.valid)).toEqual([true, true]);
  });
});

describe('the lock', () => {
  it('refuses a write to a locked file, and a move out of the region, before the port', async () => {
    await start(house);
    const write = await put([{ kind: 'write', path: 'home/rooms/kitchen.yaml', content: 'x' }]);
    expect(write.status).toBe(409);
    expect(await write.json()).toEqual({
      ok: false,
      code: 'HOST_SCOPE_LOCKED',
      message: expect.stringContaining('home/rooms/kitchen.yaml'),
    });
    const move = await put([
      { kind: 'move', from: 'home/rooms/kitchen.yaml', path: 'kitchen.yaml' },
    ]);
    expect(move.status).toBe(409);
    expect(((await move.json()) as { code: string }).code).toBe('HOST_SCOPE_LOCKED');
    const into = await put([{ kind: 'create', path: 'home/new.md', content: '' }]);
    expect(into.status).toBe(409);
    expect(readFileSync(join(root, 'home/rooms/kitchen.yaml'), 'utf8')).toBe(KITCHEN);
  });

  it('refuses a write that reaches a locked file through a link in the folder', async () => {
    await start(house);
    // Another name for the app's folder, as git would check one out.
    symlinkSync('home', join(root, 'h2'));
    const write = await put([{ kind: 'write', path: 'h2/rooms/kitchen.yaml', content: 'x' }]);
    expect(write.status).toBe(409);
    expect(await write.json()).toMatchObject({
      code: 'HOST_SCOPE_LOCKED',
      message: expect.stringContaining('"h2/rooms/kitchen.yaml" belongs to'),
    });
    const create = await put([{ kind: 'create', path: 'h2/new.md', content: '' }]);
    expect(create.status).toBe(409);
    expect(existsSync(join(root, 'home/new.md'))).toBe(false);
    expect(readFileSync(join(root, 'home/rooms/kitchen.yaml'), 'utf8')).toBe(KITCHEN);
  });

  it.skipIf(process.getuid?.() === 0)(
    'a manifest that cannot be read is that instance’s error, and other writes still land',
    async () => {
      await start({ ...house, 'vendor/thing/inventory.yaml': MANIFEST, 'notes.md': 'n' });
      chmodSync(join(root, 'vendor/thing/inventory.yaml'), 0o000);
      try {
        const found = await apps();
        expect(found.map((instance) => [instance.manifestPath, instance.valid])).toEqual([
          ['home/inventory.yaml', true],
          ['vendor/thing/inventory.yaml', false],
        ]);
        expect(found[1].errors).toEqual(['The manifest could not be read: EACCES.']);
        const write = await put([{ kind: 'create', path: 'other.md', content: 'o' }]);
        expect(write.status).toBe(200);
        expect(readFileSync(join(root, 'other.md'), 'utf8')).toBe('o');
      } finally {
        chmodSync(join(root, 'vendor/thing/inventory.yaml'), 0o644);
      }
    }
  );

  it('takes a write outside every region', async () => {
    await start(house);
    expect((await put([{ kind: 'write', path: 'notes.md', content: 'y' }])).status).toBe(200);
  });

  it('refuses a write to a root instance’s scope and takes one beside it', async () => {
    await start({ 'inventory.yaml': MANIFEST, 'rooms/kitchen.yaml': KITCHEN, 'readme.md': 'x' });
    expect((await put([{ kind: 'write', path: 'rooms/kitchen.yaml', content: 'x' }])).status).toBe(
      409
    );
    expect((await put([{ kind: 'create', path: 'rooms/notes.md', content: 'x' }])).status).toBe(
      200
    );
    expect((await put([{ kind: 'write', path: 'readme.md', content: 'y' }])).status).toBe(200);
  });

  it('unlocks and locks again, answering the lifecycle’s problems on lock', async () => {
    await start(house);
    const unlocked = await lock('home/inventory.yaml', false);
    expect(await unlocked.json()).toEqual({ ok: true, errors: [], warnings: [] });
    expect((await apps())[0].unlocked).toBe(true);
    expect(
      (await put([{ kind: 'write', path: 'home/inventory.yaml', content: BROKEN }])).status
    ).toBe(200);
    const locked = await lock('home/inventory.yaml', true);
    const answer = (await locked.json()) as { ok: boolean; errors: string[] };
    expect(answer.ok).toBe(true);
    expect(answer.errors.length).toBeGreaterThan(0);
    // Locked either way.
    expect((await apps())[0].unlocked).toBe(false);
    expect(
      (await put([{ kind: 'write', path: 'home/inventory.yaml', content: MANIFEST }])).status
    ).toBe(409);
  });

  it('refuses a lock for no instance, and a body of the wrong shape', async () => {
    await start(house);
    expect((await lock('nowhere/inventory.yaml', false)).status).toBe(404);
    expect((await send('/api/apps/lock', 'POST', { manifestPath: 'x' })).status).toBe(400);
  });
});

describe('the apps event', () => {
  it('is sent when a manifest appears, and when a lock changes', async () => {
    await start(house);
    const events = eventReader(await request('/api/events'));
    await events.opened;
    await lock('home/inventory.yaml', false);
    await events.next((event) => event.type === ('apps' as string));
    expect(
      (await put([{ kind: 'create', path: 'garage/inventory.yaml', content: MANIFEST }])).status
    ).toBe(200);
    await events.next((event) => event.type === ('apps' as string));
    expect((await apps()).map((instance) => instance.manifestPath)).toEqual([
      'garage/inventory.yaml',
      'home/inventory.yaml',
    ]);
    await events.close();
  });
});

describe('the app routes', () => {
  it('answers the overview page: its view, state, title and revision', async () => {
    await start(house);
    const response = await page('home/inventory.yaml');
    expect(response.status).toBe(200);
    const answer = (await response.json()) as {
      ok: boolean;
      view: { type: string };
      state: { label: string; zones: { path: string }[] };
      title: string;
      revision: string;
    };
    expect(answer).toMatchObject({
      ok: true,
      view: { type: 'space' },
      title: 'Maple St House — Inventory',
    });
    expect(answer.state.zones.map((zone) => zone.path)).toEqual(['home/rooms/kitchen.yaml']);
    expect(answer.revision).toMatch(/^[0-9a-f]{64}$/);
  });

  it('answers a zone’s page by its sub-path, and not found for one it does not have', async () => {
    await start(house);
    const zone = (await (await page('home/inventory.yaml', '/room/kitchen')).json()) as {
      title: string;
    };
    expect(zone.title).toBe('Kitchen — Inventory');
    const missing = await page('home/inventory.yaml', '/room/cellar');
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { code: string }).code).toBe('HOST_APP_PAGE_NOT_FOUND');
    expect((await page('home/inventory.yaml', '/nothing/here')).status).toBe(404);
  });

  it('refuses an instance that is not there, and one discovery marks invalid', async () => {
    await start({ ...house, 'broken/inventory.yaml': BROKEN });
    const none = await page('elsewhere/inventory.yaml');
    expect(none.status).toBe(404);
    expect(((await none.json()) as { code: string }).code).toBe('HOST_APP_NOT_FOUND');
    const broken = await page('broken/inventory.yaml');
    expect(broken.status).toBe(409);
    expect(((await broken.json()) as { code: string }).code).toBe('HOST_APP_INVALID');
  });

  it('projects a view as JSON, and refuses one outside the bounds', async () => {
    await start(house);
    const view = encodeURIComponent(JSON.stringify({ type: 'zone', slug: 'kitchen' }));
    const read = await request(`/api/apps/project?manifestPath=home/inventory.yaml&view=${view}`);
    const answer = (await read.json()) as { ok: boolean; state: { zone: { label: string } } };
    expect(answer.ok).toBe(true);
    expect(answer.state.zone.label).toBe('Kitchen');
    const bad = await request(
      `/api/apps/project?manifestPath=home/inventory.yaml&view=${encodeURIComponent('{"type":"nope"}')}`
    );
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { code: string }).code).toBe('APP_VIEW_INVALID');
  });

  it('runs a core op through the runner, written while the files are locked', async () => {
    await start(house);
    const response = await op('home/inventory.yaml', { op: { type: 'add-zone', title: 'Attic' } });
    expect(response.status).toBe(200);
    const answer = (await response.json()) as {
      ok: boolean;
      reply: { space: { zones: { path: string }[] } };
      revision: string;
    };
    expect(answer.reply.space.zones.map((zone) => zone.path)).toContain('home/rooms/attic.yaml');
    expect(readFileSync(join(root, 'home/rooms/attic.yaml'), 'utf8')).toContain('Attic');
    // The op's revision is the page's, read after it.
    const after = (await (await page('home/inventory.yaml')).json()) as { revision: string };
    expect(after.revision).toBe(answer.revision);
  });

  it('answers a refusal with its class: the module’s, the runner’s', async () => {
    await start(house);
    const missing = await op('home/inventory.yaml', {
      op: { type: 'add-item', path: 'home/rooms/cellar.yaml', item: { title: 'Jar' } },
    });
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { code: string }).code).toBe('INVENTORY_ZONE_NOT_FOUND');
    const unknown = await op('home/inventory.yaml', { op: { type: 'link-editor', path: 'x' } });
    expect(unknown.status).toBe(400);
    expect(((await unknown.json()) as { code: string }).code).toBe('APP_OP_UNKNOWN');
  });

  it('moves the revision when only the changes do: a commit', async () => {
    await start(house, true);
    writeFiles(root, { 'home/rooms/kitchen.yaml': `${KITCHEN}  - id: jar\n    title: Jar\n` });
    const before = (await (await page('home/inventory.yaml')).json()) as {
      revision: string;
      state: { dirty: { path: string }[] };
    };
    expect(before.state.dirty.map((file) => file.path)).toEqual(['home/rooms/kitchen.yaml']);
    const runnerBefore = await runnerRevision();
    git(root, env, 'commit', '-q', '-am', 'kitchen');
    const after = (await (await page('home/inventory.yaml')).json()) as {
      revision: string;
      state: { dirty: unknown[] };
    };
    expect(after.state.dirty).toEqual([]);
    expect(after.revision).not.toBe(before.revision);
    // The files are as they were: the runner's revision did not move, the host's did.
    expect(await runnerRevision()).toBe(runnerBefore);
  });

  it('hands the module the changes in the region, each changed or moved file with its base', async () => {
    const seen: AppFileChange[][] = [];
    const spy: AnyAppModule = {
      ...inventoryModule,
      fromChanges: (changes, snapshot) => {
        seen.push([...changes]);
        return inventoryModule.fromChanges(changes, snapshot);
      },
    };
    await start({ ...house, 'home/rooms/attic.yaml': ATTIC }, true, [spy]);
    writeFiles(root, {
      'home/rooms/kitchen.yaml': 'label: Kitchen\nitems: []\n',
      'home/rooms/cellar.yaml': 'label: Cellar\nitems: []\n',
      'notes.md': 'changed outside',
    });
    git(root, env, 'mv', 'home/rooms/attic.yaml', 'home/rooms/loft.yaml');
    expect((await page('home/inventory.yaml')).status).toBe(200);
    const changes = seen.at(-1)!;
    expect([...changes].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: 'home/rooms/cellar.yaml', status: 'new' },
      { path: 'home/rooms/kitchen.yaml', status: 'changed', base: KITCHEN },
      { path: 'home/rooms/loft.yaml', status: 'moved', from: 'home/rooms/attic.yaml', base: ATTIC },
    ]);
  });

  it('knows nothing changed in a folder that is not a repository', async () => {
    const seen: AppFileChange[][] = [];
    const spy: AnyAppModule = {
      ...inventoryModule,
      fromChanges: (changes, snapshot) => {
        seen.push([...changes]);
        return inventoryModule.fromChanges(changes, snapshot);
      },
    };
    await start(house, false, [spy]);
    expect((await page('home/inventory.yaml')).status).toBe(200);
    expect(seen.at(-1)).toEqual([]);
  });
});

/** The runner's own revision for the instance: the scope's files alone. */
async function runnerRevision(): Promise<string> {
  const loaded = await loadInstance(host.port, inventoryModule, 'home/inventory.yaml');
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.revision;
}
