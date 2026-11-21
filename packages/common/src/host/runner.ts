// One runner for any app over the storage port: what every host does to run an
// app's op, read one of its views or create an instance, written against
// `StoragePort` and the app's module and nothing else. The harness runs it over
// the memory port, the local host over a folder.
//
// What a host knows beyond the files (the module's facts, the plain data an
// app's snapshot carries beyond them) is the host's `know`; the runner asks
// for it and does not look inside. Nothing here links, drafts or deletes:
// those are a host's own steps, and `FileChange` has no delete.
//
// The runner refuses with its own codes beside the app's and the port's;
// `hostRefusalClass` classes them.

import { fail, ok } from '../app';

import { digest } from './digest';

import type { AnyAppModule, AppSnapshot, Failure, FileChange, RefusalClass, Result } from '../app';
import type { PortChange, StoragePort } from './index';

/** One instance as the runner read it from the port. */
export interface LoadedInstance<S extends AppSnapshot = AppSnapshot> {
  /**
   * What the core reads: every file path the port lists, and the content of
   * each path in the scope (`null` for one the port could not read).
   */
  snapshot: S;
  /** The paths the app owns, from the lifecycle: the manifest alone when the lifecycle refused it. */
  scope: ReadonlySet<string>;
  /** The version each file in the snapshot was read at. */
  versions: Readonly<Record<string, string>>;
  /** One string for the files as loaded: equal for two loads of the same paths at the same versions. */
  revision: string;
  /** The lifecycle's warnings, or why it refused the manifest, or why the manifest could not be read. */
  warnings: string[];
}

/** What a host gives the runner. */
export interface RunnerHost {
  port: StoragePort;
  /**
   * What only this host knows about the instance: the module's facts, and the
   * plain data the app's snapshot carries beyond its files (tasks' pending
   * moves and created cards), laid over the loaded snapshot before the core
   * sees it.
   */
  know(
    module: AnyAppModule,
    loaded: LoadedInstance
  ): Promise<{ facts: unknown; snapshot?: object }>;
  /** The time a new file is stamped with. */
  now(): string;
}

/** The codes the runner itself refuses with, beside the app's and the port's. */
export type RunnerRefusalCode =
  'APP_OP_UNKNOWN' | 'APP_MANIFEST_NOT_FOUND' | 'APP_PATH_OUT_OF_SCOPE' | 'APP_CHANGES_INVALID';

const RUNNER_CLASS: Readonly<Record<string, RefusalClass>> = {
  APP_OP_UNKNOWN: 'invalid',
  APP_OP_INVALID: 'invalid',
  APP_VIEW_INVALID: 'invalid',
  APP_CREATE_INVALID: 'invalid',
  APP_MANIFEST_NOT_FOUND: 'not-found',
  // The app's changes, not the caller's request, are wrong: Context Manager sends 400.
  APP_PATH_OUT_OF_SCOPE: 'invalid',
  APP_CHANGES_INVALID: 'invalid',
  // The files moved on under the op: read again and retry.
  HOST_FILE_CHANGED: 'conflict',
  HOST_PATH_EXISTS: 'conflict',
  HOST_FILE_NOT_FOUND: 'conflict',
  HOST_NOT_TEXT: 'invalid',
  HOST_FILE_TOO_LARGE: 'invalid',
  HOST_PATH_OUTSIDE_ROOT: 'invalid',
  HOST_PATH_INVALID: 'invalid',
  HOST_BAD_REQUEST: 'invalid',
};

/**
 * How a caller treats one of the runner's refusals or a port's, by code; any
 * other code (`undefined` here) is the app's, for `module.refusalClass`. A
 * port's failure to write (`HOST_WRITE_FAILED`) is the host's own error, not a
 * refusal, and is not classed.
 */
export function hostRefusalClass(code: string): RefusalClass | undefined {
  return RUNNER_CLASS[code];
}

/** The folder the manifest sits in: `''` at the root. */
function folderOf(manifestPath: string): string {
  const cut = manifestPath.lastIndexOf('/');
  return cut === -1 ? '' : manifestPath.slice(0, cut);
}

const under = (folder: string, path: string): boolean =>
  folder === '' || path.startsWith(`${folder}/`);

const manifestNotFound = (manifestPath: string): Failure =>
  fail('APP_MANIFEST_NOT_FOUND', `There is no manifest at ${JSON.stringify(manifestPath)}.`);

/**
 * Read an instance: list the port, read the manifest, ask the lifecycle for its
 * scope and read every file in it. A manifest the lifecycle refuses, or one
 * the port cannot read, loads alone, so the core answers it as it answers a
 * broken manifest (Context Manager's generic loader does the same).
 */
export async function loadInstance(
  port: StoragePort,
  module: AnyAppModule,
  manifestPath: string
): Promise<Result<LoadedInstance>> {
  const nodes = await port.list();
  const paths = nodes.filter((node) => node.type === 'blob').map((node) => node.path);
  if (!paths.includes(manifestPath)) return manifestNotFound(manifestPath);
  const manifest = await port.get(manifestPath);
  if (!manifest.ok && manifest.code === 'HOST_FILE_NOT_FOUND') {
    return manifestNotFound(manifestPath);
  }

  const warnings: string[] = [];
  const scope = new Set<string>([manifestPath]);
  if (!manifest.ok) warnings.push(manifest.message);
  else {
    const scoped = module.lifecycle.validateAndScope(manifest.text, nodes, manifestPath);
    if (scoped.ok) {
      for (const path of scoped.scope) scope.add(path);
      warnings.push(...scoped.warnings);
    } else warnings.push(scoped.message);
  }

  const files: Record<string, string | null> = {};
  const versions: Record<string, string> = {};
  const rest = [...scope].filter((path) => path !== manifestPath);
  const read = await Promise.all(rest.map((path) => port.get(path)));
  for (const [path, answer] of [
    [manifestPath, manifest] as const,
    ...rest.map((path, i) => [path, read[i]] as const),
  ]) {
    files[path] = answer.ok ? answer.text : null;
    if (answer.ok) versions[path] = answer.version;
  }

  const entries = [...scope].sort().map((path) => [path, versions[path] ?? null]);
  return ok({
    snapshot: { manifestPath, paths, files },
    scope,
    versions,
    revision: digest(JSON.stringify([manifestPath, entries])),
    warnings,
  });
}

/** The loaded snapshot with what the host knows laid over, and the facts. */
async function known(
  host: RunnerHost,
  module: AnyAppModule,
  loaded: LoadedInstance
): Promise<{ snapshot: AppSnapshot; facts: unknown }> {
  const told = await host.know(module, loaded);
  return { snapshot: { ...loaded.snapshot, ...told.snapshot }, facts: told.facts };
}

/** The first change that is not the instance's, or `null`: Context Manager's scope check. */
function outOfScope(
  manifestPath: string,
  loaded: LoadedInstance,
  changes: readonly FileChange[]
): Failure | null {
  const folder = folderOf(manifestPath);
  const read = (path: string): boolean => Object.hasOwn(loaded.snapshot.files, path);
  for (const change of changes) {
    const outside =
      change.kind === 'create'
        ? !under(folder, change.path)
        : change.kind === 'move'
          ? !read(change.from) || !under(folder, change.path)
          : !read(change.path);
    if (outside) {
      const path = change.kind === 'move' && !read(change.from) ? change.from : change.path;
      return fail('APP_PATH_OUT_OF_SCOPE', `${path} is outside this instance's files.`);
    }
  }
  return null;
}

/** The first path the changes name twice (as a path or a move's source), or `null`. */
function namedTwice(changes: readonly FileChange[]): string | null {
  const named = new Set<string>();
  for (const change of changes) {
    for (const path of change.kind === 'move' ? [change.from, change.path] : [change.path]) {
      if (named.has(path)) return path;
      named.add(path);
    }
  }
  return null;
}

/** The changes as the port writes them: each rewrite and move at the version it was read at. */
function withBases(loaded: LoadedInstance, changes: readonly FileChange[]): PortChange[] {
  return changes.map((change) => {
    if (change.kind === 'create') return change;
    const base = loaded.versions[change.kind === 'move' ? change.from : change.path];
    return base === undefined ? change : { ...change, base };
  });
}

/**
 * Run one core op on the instance at `manifestPath`, in seven steps: the op is
 * one of the module's core ops; it and the view are inside the module's
 * bounds; the instance is loaded and the host's knowledge laid over; the core
 * applies it; every change is the instance's; the changes are written in one
 * `put`, each rewrite and move at the version it was read at; and the module's
 * reply is read from the instance loaded again, with that load's revision.
 * An op that changes nothing writes nothing and replies from the first load.
 */
export async function runOp(
  host: RunnerHost,
  module: AnyAppModule,
  manifestPath: string,
  request: { op: unknown; view?: unknown }
): Promise<Result<{ reply: object; revision: string }>> {
  const type = (request.op as { type?: unknown } | null)?.type;
  if (typeof type !== 'string' || !(module.coreOps as readonly string[]).includes(type)) {
    return fail(
      'APP_OP_UNKNOWN',
      `${typeof type === 'string' ? `"${type}"` : 'The op'} is not a ${module.id} op.`
    );
  }

  const bounded = module.bounds.op(request.op);
  if (!bounded.ok) return bounded;
  const { op } = bounded;
  let view: unknown;
  if (request.view !== undefined) {
    const checked = module.bounds.view(request.view);
    if (!checked.ok) return checked;
    view = checked.view;
  }

  const loaded = await loadInstance(host.port, module, manifestPath);
  if (!loaded.ok) return loaded;
  const before = await known(host, module, loaded);

  const applied = module.core.apply(before.snapshot, module.toCoreOp(op, { now: host.now() }));
  if (!applied.ok) return applied;
  const changes = applied.changes as FileChange[];

  let after: LoadedInstance = loaded;
  let afterKnown = before;
  if (changes.length > 0) {
    const outside = outOfScope(manifestPath, loaded, changes);
    if (outside) return outside;
    const twice = namedTwice(changes);
    if (twice !== null) {
      return fail(
        'APP_CHANGES_INVALID',
        `The op's changes name ${JSON.stringify(twice)} twice; a write names each path once.`
      );
    }
    const written = await host.port.put(withBases(loaded, changes));
    if (!written.ok) return written;

    const reloaded = await loadInstance(host.port, module, manifestPath);
    if (!reloaded.ok) return reloaded;
    after = reloaded;
    afterKnown = await known(host, module, reloaded);
  }

  const reply = module.reply(op, applied as { ok: true; changes: FileChange[] }, {
    snapshot: afterKnown.snapshot,
    facts: afterKnown.facts,
    view,
  });
  if (!reply.ok) return reply;
  const { ok: _ok, ...body } = reply as { ok: true } & Record<string, unknown>;
  return ok({ reply: body, revision: after.revision });
}

/**
 * Read one view of the instance: inside the module's bounds, projected over
 * the instance with the host's knowledge laid on. `state` is `null` when the
 * view's subject is gone.
 */
export async function projectView(
  host: RunnerHost,
  module: AnyAppModule,
  manifestPath: string,
  view: unknown
): Promise<Result<{ state: object | null; revision: string }>> {
  const checked = module.bounds.view(view);
  if (!checked.ok) return checked;
  const loaded = await loadInstance(host.port, module, manifestPath);
  if (!loaded.ok) return loaded;
  const { snapshot, facts } = await known(host, module, loaded);
  const state = module.core.project(snapshot, checked.view, facts) as object | null;
  return ok({ state, revision: loaded.revision });
}

/**
 * Create an instance from nothing: the input inside the module's create
 * bound, the core's seed for it in `folder`, the seeded files fitted among the
 * port's files by `module.placeCreate`, and the files written as `create`
 * changes in one `put`.
 */
export async function createInstance(
  host: RunnerHost,
  module: AnyAppModule,
  request: { folder: string; confirmRoot?: boolean; input: unknown }
): Promise<Result<{ manifestPath: string }>> {
  const bounded = module.bounds.create(request.input);
  if (!bounded.ok) return bounded;
  const plan = module.core.seed({
    ...(bounded.input as object),
    folder: request.folder,
    ...(request.confirmRoot !== undefined ? { confirmRoot: request.confirmRoot } : {}),
  }) as Result<{ manifestPath: string; files: FileChange[] }>;
  if (!plan.ok) return plan;

  const nodes = await host.port.list();
  const taken = nodes.filter((node) => node.type === 'blob').map((node) => node.path);
  // The whole plan, as the seed made it: an app's plan may carry more than its files.
  const placed = module.placeCreate(plan, { taken });
  if (!placed.ok) return placed;
  const files = placed.files as FileChange[];
  const other = files.find((file) => file.kind !== 'create');
  if (other) {
    return fail(
      'APP_CHANGES_INVALID',
      `A create writes new files only; the seed ${other.kind}s ${JSON.stringify(other.path)}.`
    );
  }
  const twice = namedTwice(files);
  if (twice !== null) {
    return fail('APP_CHANGES_INVALID', `The seed creates ${JSON.stringify(twice)} twice.`);
  }
  const written = await host.port.put(files);
  if (!written.ok) return written;
  return ok({ manifestPath: plan.manifestPath });
}
