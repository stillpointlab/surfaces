// The apps in the local host's server: discovery, the lock, and the routes that
// run an app over the folder with common's runner.
//
// - **Discovery** runs over the port's whole listing (`discovery.ts`) whenever a
//   route needs the instances, so it is never stale; and again when the watcher
//   reports a change to the listing or to a manifest, and when a lock changes,
//   to send `{ type: 'apps' }` when the answer differs.
// - **The lock** is the server's, in memory: the set of unlocked manifest paths.
//   Every run starts with none. `checkWrite` refuses a `PUT /api/files` in which
//   any change's path, or a move's `from`, is in a locked region
//   (`HOST_SCOPE_LOCKED`), before the port sees it. The runner writes through the
//   port itself, so its writes are the server's own and are not refused.
// - **The routes** answer an instance by its manifest path. One discovery marks
//   invalid (a manifest the lifecycle refuses, an overlap) is refused with
//   `HOST_APP_INVALID`: the page shows discovery's errors instead. A host op an
//   app's registration names (`host-ops.ts`) is answered before the runner, with
//   no `revision`.
// - **Create** (`POST /api/apps/create`) refuses a folder whose region would
//   share a path with a found instance's (`HOST_APP_OVERLAP`), which the runner's
//   `createInstance` does not check, and then runs it. The new instance is
//   locked, as every instance starts.
// - **The journal:** an op's runner host, and a create's, write through
//   `journal.port(label)`, so each is one step ("Inventory: add-item",
//   "Inventory: create"). A step the journal cannot keep is written with no step,
//   and the answer carries `notice` beside it. A host op writes nothing.

import { matchAppPage } from '@stillpointlab/common-format/app';
import {
  createInstance,
  hostRefusalClass,
  loadInstance,
  projectView,
  runOp,
} from '@stillpointlab/common-format/host';

import { appBase, inRegion } from '../../shared/apps';
import { pathRefusal } from '../paths';
import { json, readJson, refusal, refuse, statusFor } from '../respond';

import { discover } from './discovery';
import { createFacts, hostRevision } from './facts';

import type {
  AppLockAnswer,
  AppPageAnswer,
  FoundInstance,
  LocalHostEvent,
} from '../../shared/apps';
import type { CannotUndoNotice } from '../../shared/journal';
import type { Journal, JournalPort } from '../journal/journal';
import type { NodePort } from '../port';
import type { ServerHostOps } from './host-ops';
import type {
  AnyAppModule,
  Failure,
  FileChange,
  RefusalClass,
  Result,
} from '@stillpointlab/common-format/app';
import type { HostEvent } from '@stillpointlab/common-format/host';

export type Handler = (request: Request, url: URL) => Promise<Response>;

export interface AppHostOptions {
  port: NodePort;
  /** What an op and a create write through, one step each: undo takes them back. */
  journal: Journal;
  modules: readonly AnyAppModule[];
  /** The host ops the server answers, by app id, then op type. */
  hostOps?: Readonly<Record<string, ServerHostOps>>;
  /** Send an event on the host's stream. */
  send(event: LocalHostEvent): void;
  warn(message: string): void;
}

export interface AppHost {
  /** The app routes, by path and method. */
  readonly routes: Record<string, Partial<Record<string, Handler>>>;
  /** The refusal for a write into a locked region, or `null`. */
  checkWrite(changes: readonly unknown[]): Promise<Failure | null>;
  /** The watcher sent `event`: find the instances again if it may have changed them. */
  watched(event: HostEvent): void;
  /** git's `HEAD` or index moved: the kept bases are stale. */
  statusMoved(): void;
  /** Take the first answer, which later ones are compared with. */
  start(): Promise<void>;
  close(): void;
}

const CLASS_STATUS: Record<RefusalClass, number> = {
  'not-found': 404,
  conflict: 409,
  invalid: 400,
};

/** A refusal's status on an app route: the runner's class, the host's own, or the module's. */
function appStatus(module: AnyAppModule, code: string, op = ''): number {
  const runner = hostRefusalClass(code);
  if (runner) return CLASS_STATUS[runner];
  if (code.startsWith('HOST_')) return statusFor(code);
  return CLASS_STATUS[module.refusalClass(code, op)] ?? 400;
}

const pageNotFound = (manifestPath: string, path: string): Failure => ({
  ok: false,
  code: 'HOST_APP_PAGE_NOT_FOUND',
  message: `The app at ${manifestPath} has no page at ${JSON.stringify(path === '' ? '/' : path)}.`,
});

const isWithin = (path: string, folder: string): boolean =>
  path === folder || path.startsWith(`${folder}/`);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** The notice beside an answer whose write the journal could not keep. */
function noticeOf(writes: JournalPort): { notice: CannotUndoNotice } | Record<string, never> {
  return writes.unkept === null ? {} : { notice: { kind: 'cannot-undo', reason: writes.unkept } };
}

export function createAppHost(options: AppHostOptions): AppHost {
  const { port, modules } = options;
  const unlocked = new Set<string>();
  const facts = createFacts(port);
  let last: string | null = null;
  let finding: Promise<void> | null = null;
  let findAgain = false;
  let closed = false;

  const moduleOf = (instance: FoundInstance): AnyAppModule =>
    modules.find((module) => module.id === instance.app)!;

  const manifestNames = new Set(modules.map((module) => module.lifecycle.manifestName));
  const isManifest = (path: string): boolean =>
    manifestNames.has(path.slice(path.lastIndexOf('/') + 1));

  /** The instances now; an unlocked manifest that is gone is forgotten. */
  async function instances(): Promise<FoundInstance[]> {
    const found = await discover(port, modules, unlocked);
    const present = new Set(found.map((instance) => instance.manifestPath));
    for (const path of unlocked) if (!present.has(path)) unlocked.delete(path);
    return found;
  }

  /** Find the instances again, and say so when the answer changed. One at a time. */
  function findAgainSoon(): Promise<void> {
    if (finding) {
      findAgain = true;
      return finding;
    }
    finding = (async () => {
      do {
        findAgain = false;
        try {
          const answer = JSON.stringify(await instances());
          if (closed) return;
          if (last !== null && answer !== last) options.send({ type: 'apps' });
          last = answer;
        } catch (error) {
          options.warn(`the apps could not be found again: ${String(error)}`);
        }
      } while (findAgain && !closed);
    })().finally(() => (finding = null));
    return finding;
  }

  async function checkWrite(changes: readonly unknown[]): Promise<Failure | null> {
    const locked = (await instances()).filter((instance) => !instance.unlocked);
    if (locked.length === 0) return null;
    for (const change of changes) {
      if (!isObject(change)) continue;
      const paths = [change.path, change.kind === 'move' ? change.from : undefined].filter(
        (path): path is string => typeof path === 'string'
      );
      for (const path of paths) {
        const holder = locked.find((instance) => inRegion(instance, path));
        if (holder) {
          return {
            ok: false,
            code: 'HOST_SCOPE_LOCKED',
            message: `${JSON.stringify(path)} belongs to ${holder.label} (the ${holder.app} app at ${holder.manifestPath}), whose files are locked. Show its files to change them here.`,
          };
        }
      }
    }
    return null;
  }

  /** The instance at a manifest path, valid, with its module; or the refusal. */
  async function opened(
    manifestPath: unknown
  ): Promise<{ instance: FoundInstance; module: AnyAppModule } | Response> {
    if (typeof manifestPath !== 'string' || manifestPath === '') {
      return refuse('HOST_BAD_REQUEST', 'Name the instance by its manifestPath.', 400);
    }
    const instance = (await instances()).find((found) => found.manifestPath === manifestPath);
    if (!instance) {
      return refuse(
        'HOST_APP_NOT_FOUND',
        `There is no app at ${JSON.stringify(manifestPath)}.`,
        404
      );
    }
    if (!instance.valid) {
      return refuse(
        'HOST_APP_INVALID',
        `The ${instance.app} app at ${manifestPath} cannot open: ${instance.errors.join('; ')}`,
        409
      );
    }
    return { instance, module: moduleOf(instance) };
  }

  async function page(url: URL): Promise<Response> {
    const manifestPath = url.searchParams.get('manifestPath');
    const at = await opened(manifestPath);
    if (at instanceof Response) return at;
    const { module, instance } = at;
    const subPath = url.searchParams.get('path') ?? '';
    const query = Object.fromEntries(new URLSearchParams(url.searchParams.get('query') ?? ''));
    const notFound = () => refusal(pageNotFound(instance.manifestPath, subPath));
    const matched = matchAppPage(module.pages, subPath);
    if (!matched) return notFound();

    const runner = facts.runner();
    const resolution = await matched.page.resolve({
      params: matched.params,
      query,
      base: appBase(instance.manifestPath),
      manifestPath: instance.manifestPath,
      project: async (view) => {
        const read = await projectView(runner, module, instance.manifestPath, view);
        return read.ok ? read.state : null;
      },
    });
    if ('redirect' in resolution) {
      const answer: AppPageAnswer = {
        redirect: resolution.redirect,
        ...(resolution.permanent !== undefined ? { permanent: resolution.permanent } : {}),
      };
      return json({ ok: true, ...answer });
    }
    if ('notFound' in resolution) return notFound();

    let state: object | null = null;
    let runnerRevision: string;
    if (resolution.view) {
      const projected = await projectView(runner, module, instance.manifestPath, resolution.view);
      if (!projected.ok) return refusal(projected, appStatus(module, projected.code));
      if (projected.state === null && !matched.page.emptyWhenMissing) return notFound();
      state = projected.state;
      runnerRevision = projected.revision;
    } else {
      // No view: the app's empty state. The revision still covers the files and the facts.
      const loaded = await loadInstance(port, module, instance.manifestPath);
      if (!loaded.ok) return refusal(loaded, appStatus(module, loaded.code));
      await runner.know(module, loaded);
      runnerRevision = loaded.revision;
    }
    const answer: AppPageAnswer = {
      view: resolution.view,
      state,
      ...(resolution.extras ? { extras: resolution.extras } : {}),
      title: matched.page.title(state),
      revision: hostRevision(runnerRevision, runner.changesDigest()),
    };
    return json({ ok: true, ...answer });
  }

  async function project(url: URL): Promise<Response> {
    const at = await opened(url.searchParams.get('manifestPath'));
    if (at instanceof Response) return at;
    let view: unknown;
    try {
      view = JSON.parse(url.searchParams.get('view') ?? '');
    } catch {
      return refuse('HOST_BAD_REQUEST', 'The view must be JSON, in the view query.', 400);
    }
    const runner = facts.runner();
    const read = await projectView(runner, at.module, at.instance.manifestPath, view);
    if (!read.ok) return refusal(read, appStatus(at.module, read.code));
    return json({
      ok: true,
      state: read.state,
      revision: hostRevision(read.revision, runner.changesDigest()),
    });
  }

  async function op(request: Request): Promise<Response> {
    const read = await readJson(request);
    if (read instanceof Response) return read;
    if (!isObject(read.body)) {
      return refuse('HOST_BAD_REQUEST', 'The body must be { "manifestPath", "op", "view"? }.', 400);
    }
    const { manifestPath, op: asked, view } = read.body;
    const at = await opened(manifestPath);
    if (at instanceof Response) return at;
    const runner = facts.runner();
    const type0 = isObject(asked) && typeof asked.type === 'string' ? asked.type : '';
    const hostOps = options.hostOps?.[at.module.id];
    const hostOp = hostOps && Object.hasOwn(hostOps, type0) ? hostOps[type0] : undefined;
    if (hostOp) {
      const manifestPath = at.instance.manifestPath;
      const answered = await hostOp(asked as { type: string } & Record<string, unknown>, {
        port,
        module: at.module,
        manifestPath,
        snapshot: async () => {
          const loaded = await loadInstance(port, at.module, manifestPath);
          if (!loaded.ok) return loaded;
          const told = await runner.know(at.module, loaded);
          return { ok: true, snapshot: { ...loaded.snapshot, ...told.snapshot } };
        },
      });
      if (!answered.ok) return refusal(answered, appStatus(at.module, answered.code, type0));
      const { ok: _ok, ...reply } = answered as { ok: true } & Record<string, unknown>;
      return json({ ok: true, reply });
    }
    // One op is one step, labelled with the app's name and the op's type.
    const writes = options.journal.port(`${at.module.meta.label}: ${type0}`);
    const writer = facts.runner(writes);
    const answer = await runOp(
      writer,
      at.module,
      at.instance.manifestPath,
      view === undefined ? { op: asked } : { op: asked, view }
    );
    if (!answer.ok) return refusal(answer, appStatus(at.module, answer.code, type0));
    return json({
      ok: true,
      reply: answer.reply,
      revision: hostRevision(answer.revision, writer.changesDigest()),
      ...noticeOf(writes),
    });
  }

  /** The paths a new instance at the root would hold: its seed, and its lifecycle's scope. */
  async function rootScope(
    module: AnyAppModule,
    input: unknown,
    confirmRoot: boolean | undefined
  ): Promise<string[]> {
    const bounded = module.bounds.create(input);
    if (!bounded.ok) return [];
    const plan = module.core.seed({
      ...(bounded.input as object),
      folder: '',
      ...(confirmRoot !== undefined ? { confirmRoot } : {}),
    }) as Result<{ manifestPath: string; files: FileChange[] }>;
    if (!plan.ok) return [];
    const nodes = await port.list();
    const listed = new Set(nodes.map((node) => node.path));
    const withSeed = [
      ...nodes,
      ...plan.files
        .filter((file) => !listed.has(file.path))
        .map((file) => ({ path: file.path, type: 'blob' as const })),
    ];
    const manifest = plan.files.find((file) => file.path === plan.manifestPath);
    const scoped = manifest
      ? module.lifecycle.validateAndScope(manifest.content, withSeed, plan.manifestPath)
      : null;
    return [...plan.files.map((file) => file.path), ...(scoped?.ok ? [...scoped.scope] : [])];
  }

  async function create(request: Request): Promise<Response> {
    const read = await readJson(request);
    if (read instanceof Response) return read;
    const body = isObject(read.body) ? read.body : {};
    const { app, folder, confirmRoot, input } = body;
    if (
      typeof app !== 'string' ||
      typeof folder !== 'string' ||
      (confirmRoot !== undefined && typeof confirmRoot !== 'boolean')
    ) {
      return refuse(
        'HOST_BAD_REQUEST',
        'The body must be { "app", "folder", "confirmRoot"?, "input" }.',
        400
      );
    }
    const module = modules.find((candidate) => candidate.id === app);
    if (!module)
      return refuse('HOST_APP_NOT_FOUND', `No app is called ${JSON.stringify(app)}.`, 404);
    if (folder !== '') {
      const refused = pathRefusal(folder);
      if (refused !== null) return refusal(refused);
    }
    const found = await instances();
    // The region the new instance would have: its folder, or at the root the
    // scope its lifecycle would give the seeded manifest over the listing, as
    // discovery will read it (a seed the app refuses is refused below, by the runner).
    let seeded: string[] = [];
    if (folder === '') seeded = await rootScope(module, input, confirmRoot);
    const clash = found.find((instance) =>
      folder === ''
        ? seeded.some((path) => inRegion(instance, path))
        : instance.folder !== ''
          ? isWithin(instance.folder, folder) || isWithin(folder, instance.folder)
          : (instance.scope ?? []).some((path) => isWithin(path, folder))
    );
    if (clash) {
      return refuse(
        'HOST_APP_OVERLAP',
        `${folder === '' ? 'The served folder’s root' : JSON.stringify(folder)} would share files with ${clash.label}, the ${clash.app} app at ${clash.manifestPath}. Choose a folder outside it.`,
        409
      );
    }
    // A create is one step: undo deletes the files it made.
    const writes = options.journal.port(`${module.meta.label}: create`);
    const made = await createInstance(facts.runner(writes), module, {
      folder,
      ...(confirmRoot !== undefined ? { confirmRoot } : {}),
      input,
    });
    if (!made.ok) return refusal(made, appStatus(module, made.code, 'create'));
    void findAgainSoon();
    return json({ ok: true, manifestPath: made.manifestPath, ...noticeOf(writes) });
  }

  async function lock(request: Request): Promise<Response> {
    const read = await readJson(request);
    if (read instanceof Response) return read;
    const body = isObject(read.body) ? read.body : {};
    const { manifestPath, locked } = body;
    if (typeof manifestPath !== 'string' || typeof locked !== 'boolean') {
      return refuse(
        'HOST_BAD_REQUEST',
        'The body must be { "manifestPath": string, "locked": boolean }.',
        400
      );
    }
    const instance = (await instances()).find((found) => found.manifestPath === manifestPath);
    if (!instance) {
      return refuse(
        'HOST_APP_NOT_FOUND',
        `There is no app at ${JSON.stringify(manifestPath)}.`,
        404
      );
    }
    const answer: AppLockAnswer = { errors: [], warnings: [] };
    if (locked) {
      unlocked.delete(manifestPath);
      // The lifecycle reads the manifest again; the lock holds whatever it says.
      const module = moduleOf(instance);
      const [nodes, manifest] = await Promise.all([port.list(), port.get(manifestPath)]);
      if (!manifest.ok) answer.errors.push(manifest.message);
      else {
        const scoped = module.lifecycle.validateAndScope(manifest.text, nodes, manifestPath);
        if (scoped.ok) answer.warnings.push(...scoped.warnings);
        else answer.errors.push(...(scoped.details.length > 0 ? scoped.details : [scoped.message]));
      }
    } else {
      unlocked.add(manifestPath);
    }
    void findAgainSoon();
    return json({ ok: true, ...answer });
  }

  return {
    routes: {
      '/api/apps': {
        GET: async () => json({ apps: await instances() }),
      },
      '/api/apps/page': {
        GET: async (_request, url) => page(url),
      },
      '/api/apps/project': {
        GET: async (_request, url) => project(url),
      },
      '/api/apps/op': {
        POST: async (request) => op(request),
      },
      '/api/apps/lock': {
        POST: async (request) => lock(request),
      },
      '/api/apps/create': {
        POST: async (request) => create(request),
      },
    },
    checkWrite,
    watched(event) {
      if (event.type === 'listed' || (event.type === 'changed' && event.paths.some(isManifest))) {
        void findAgainSoon();
      }
    },
    statusMoved: () => facts.forget(),
    start: () => findAgainSoon(),
    close() {
      closed = true;
    },
  };
}
