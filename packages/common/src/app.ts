// The app contract, as far as the apps use it: what a host and an app agree on.
//
// Three parts. The lifecycle: a manifest marks an instance of an app, and the
// app says which paths it owns and how the instance is described. The core: given
// a snapshot of the instance's files, the app projects the state an element
// renders, applies an op as file changes or a refusal, and seeds a new
// instance's files (the August design's `project` and `apply`, named against
// the inventory core). The element: the host sets state, and the element asks
// the host for ops, each with its own reply.
//
// A light entry (`@stillpointlab/common-format/app`): an app element and a host
// page import it without pulling in the formats' runtime. The helpers touch the
// DOM only when called.

import type { ReadyElement } from './contracts';

export { createReadyGate, READY_ATTRIBUTE, READY_EVENT } from './ready';
export type { ReadyGate, ReadyHost } from './ready';
export { report, reportError, setErrorHandler, setReporter } from './log';
export type { ErrorHandler, Level, Reporter } from './log';

/** A refusal: a stable, machine-readable `code`, a `message` for a person. */
export interface Failure {
  ok: false;
  code: string;
  message: string;
  /** Structured causes, where the refusing function had them (zod issues, say). */
  details?: unknown[];
}

/** Success with the answer's fields beside `ok`, or a failure. Nothing throws for a rule. */
export type Result<T extends object = object> = ({ ok: true } & T) | Failure;

/**
 * A manifest that does not validate: every error in `details` (a manifest can
 * be wrong in several ways at once), and all of them joined as the `message`.
 */
export type ManifestFailure = Omit<Failure, 'details'> & { details: string[] };

/** A manifest refusal from its errors: `Invalid <file>: <errors>`. */
export function manifestFailure(code: string, file: string, errors: string[]): ManifestFailure {
  return { ok: false, code, message: `Invalid ${file}: ${errors.join('; ')}`, details: errors };
}

/** Build a success. `ok()` for one with no fields. */
export function ok<T extends object = Record<never, never>>(value?: T): { ok: true } & T {
  return { ...(value as T), ok: true };
}

/** Build a failure. */
export function fail(code: string, message: string, details?: unknown[]): Failure {
  return details === undefined
    ? { ok: false, code, message }
    : { ok: false, code, message, details };
}

// ---- The lifecycle half -----------------------------------------------------

/** One node of a folder's tree. Structural, so a host's own tree type fits it. */
export interface FolderNode {
  path: string;
  type: 'blob' | 'tree';
  sha?: string;
  size?: number;
}

/**
 * What an app tells its host about one instance. Pure: tree and bytes in, paths
 * and a description out. The host keeps its own policy beside it (the view's
 * name, error codes, adoption budgets).
 */
export interface AppLifecycle<Detail extends { label: string } = { label: string }> {
  /** The manifest filename that marks a candidate instance (`tasks.yaml`). */
  manifestName: string;
  /**
   * Validate one manifest and derive the instance's scope: every path it owns,
   * anchored at `manifestPath`. A refusal lists every error in `details`.
   */
  validateAndScope(
    content: string,
    nodes: FolderNode[],
    manifestPath: string
  ): { ok: true; scope: Set<string>; warnings: string[] } | ManifestFailure;
  /**
   * What one instance shows in the host's tree: its label and anything else the
   * app draws there. Called whether or not the manifest parses (`content` is
   * null when the file is missing).
   */
  describeInstance(
    content: string | null,
    nodes: FolderNode[],
    manifestPath: string,
    appOnlyPaths: string[]
  ): Detail;
}

// ---- The core half ----------------------------------------------------------

/**
 * What a host hands an app core: plain data, no callbacks. The host reads the
 * files its own way (drafts first, caches) before calling the core. An app may
 * extend it with plain data of its own.
 */
export interface AppSnapshot {
  /** The manifest the instance is anchored at. */
  manifestPath: string;
  /** Every path the host can see: its tree and the files it created that have no upstream yet. */
  paths: readonly string[];
  /** Contents by path, the host's drafts laid over. `null` or absent: the host could not read it. */
  files: Readonly<Record<string, string | null>>;
  /** Paths a new file may not use beyond `paths` (files the host knows that its tree does not show). */
  taken?: readonly string[];
}

/**
 * One file an op changes, with its whole new content, so a host never
 * re-derives it. A `move` is one file under a new path; its content may change
 * with it. There is no `delete` until an app needs one.
 */
export type FileChange =
  | { kind: 'write'; path: string; content: string }
  | { kind: 'create'; path: string; content: string }
  | { kind: 'move'; from: string; path: string; content: string };

/** An app's views, by type: each names its parameters and the state it projects. */
export type AppViewMap = Record<string, { params: object; state: object }>;

/** An app's core ops, by type: each names its fields and what `apply` answers beside the changes. */
export type AppCoreOpMap = Record<string, { op: object; result: object }>;

/** One view of a map, as asked for: its `type` and its parameters. */
export type AppView<V extends AppViewMap> = {
  [K in keyof V & string]: { type: K } & V[K]['params'];
}[keyof V & string];

/** One core op of a map, as applied: its `type` and its fields. */
export type AppCoreOp<O extends AppCoreOpMap> = {
  [K in keyof O & string]: { type: K } & O[K]['op'];
}[keyof O & string];

/** What `apply` answers for one op type: the changes and the op's own result. */
export type AppApplyResult<O extends AppCoreOpMap, K extends keyof O> = Result<
  { changes: FileChange[] } & O[K]['result']
>;

/**
 * An app core: pure, DOM-free and host-free. `Facts` are what only the host
 * knows that the state shows (whether an instance is enabled, which files have
 * local changes), as plain data a second host could supply; a host's own ids
 * are never facts, and it lays them over the state afterwards.
 */
export interface AppCore<
  V extends AppViewMap,
  O extends AppCoreOpMap,
  Facts,
  Seed,
  S extends AppSnapshot = AppSnapshot,
> {
  /** The state one view renders, or `null` when its subject is gone. A broken file is part of the state. */
  project<K extends keyof V & string>(
    snapshot: S,
    view: { type: K } & V[K]['params'],
    facts: Facts
  ): V[K]['state'] | null;
  /** One op as the changes it makes, or a refusal. An op that changes nothing answers no changes. */
  apply<K extends keyof O & string>(
    snapshot: S,
    op: { type: K } & O[K]['op']
  ): AppApplyResult<O, K>;
  /** A new instance's files (`create` changes), or a refusal. Where they fit is `placeNewFiles`'s question. */
  seed(input: Seed): Result<{ manifestPath: string; files: FileChange[] }>;
}

// ---- The module ------------------------------------------------------------

/**
 * How a host treats a refusal: its subject is gone (`not-found`), it clashes
 * with what is there (`conflict`), or the op itself is wrong (`invalid`). A
 * host maps the three onto its own answers; Context Manager sends 404, 409
 * and 400.
 */
export type RefusalClass = 'not-found' | 'conflict' | 'invalid';

/** What only a host knows that an op needs: the time a new file is stamped with. */
export interface AppHostInput {
  now: string;
}

/** What a host shows for the app before any instance is open: its name, its icon, its create copy. */
export interface AppMeta {
  /** The app's name in a host's tree and menus: `Inventory`. */
  label: string;
  /** Its icon there: an `<spl-icon>` name. */
  icon: string;
  /** How a host offers to create one. Absent: the app is not created from nothing. */
  create?: {
    /** The app as a sentence names one: "This repository already has an inventory at …". */
    noun: string;
    /** The folder a create form fills in. */
    defaultFolder: string;
    /** The folder rule's example: `“inventory” or “home/inventory”`. */
    folderExample?: string;
    /** Under the folder field: where the app's files live. Plain text. */
    folderHelp?: string;
    /** Asked before creating at the root of a folder: the warning, and the checkbox that consents. */
    rootConsent?: { warning: string; confirm: string };
  };
}

/**
 * The app's bounds on what reaches its core from outside: untyped input in, the
 * typed thing (trimmed, defaults applied) or a refusal out. A refusal's `code` is
 * `APP_OP_INVALID`, `APP_VIEW_INVALID` or `APP_CREATE_INVALID`, with the schema's
 * causes in `details`. Each app builds them from its own schemas, so `common`
 * carries no schema library.
 */
export interface AppBounds<V extends AppViewMap, E extends AppOpMap, CreateInput> {
  /** One of the module's core ops, as an element raised it. */
  op(input: unknown): Result<{ op: AppOp<E> }>;
  /** One view, as a page or a read asks for it. */
  view(input: unknown): Result<{ view: AppView<V> }>;
  /** A create form's input: the seed, less what the host adds (the folder). */
  create(input: unknown): Result<{ input: CreateInput }>;
}

/**
 * What a bound reads of a schema: its `safeParse`, shaped as zod's, so an app
 * passes its own schema and `common` imports no schema library.
 */
export interface BoundSchema {
  safeParse(input: unknown):
    | { success: true; data: unknown }
    | {
        success: false;
        error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
      };
}

/**
 * One bound: `input` as `schema` parses it, answered under `key`, or a refusal
 * with `code` that reads "<what> is not valid: <field>: <message>; …", the
 * schema's issues in `details`. `T` is what the parsed input is to the app.
 */
export function bounded<K extends string, T>(
  key: K,
  schema: BoundSchema,
  input: unknown,
  code: string,
  what: string
): Result<{ [P in K]: T }> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return ok({ [key]: parsed.data } as { [P in K]: T });
  const { issues } = parsed.error;
  const causes = issues
    .map(
      (issue) =>
        (issue.path.length > 0 ? `${issue.path.map(String).join('.')}: ` : '') + issue.message
    )
    .join('; ');
  return fail(code, `${what} is not valid: ${causes}`, [...issues]);
}

/** What a page resolves from. */
export interface AppPageInput {
  /** The sub-path's parameters, by name, as `matchAppPage` read them (decoded, not yet checked). */
  params: Record<string, string>;
  /** The query's parameters, decoded. */
  query: Record<string, string>;
  /**
   * Where the app's pages hang, for a redirect: a path (`/apps/x`) or a fragment
   * (`#/app/docs/tasks/tasks.yaml`). A page joins it as text, never as a `URL`.
   */
  base: string;
  /** The instance's manifest. */
  manifestPath: string;
  /** Project any view of the instance (null: nothing to project), for a page that chooses its view from another. */
  project(view: { type: string } & Record<string, unknown>): Promise<object | null>;
}

/**
 * What a page shows: a view (null: none, and the app renders its empty state)
 * with what it embeds beside the state, a redirect to the page that shows it,
 * or nothing (a parameter the page refuses, or a subject it cannot find).
 */
export type AppPageResolution =
  | { view: ({ type: string } & Record<string, unknown>) | null; extras?: Record<string, unknown> }
  | { redirect: string; permanent?: boolean }
  | { notFound: true };

/** One of an app's pages: a sub-path under the app's base, and what it shows. */
export interface AppPage {
  /** The path under the app's base: `''`, `/room/:roomSlug`. A `:name` segment is a parameter. */
  path: string;
  /** What the page shows. It checks its own parameters, and answers `{ notFound: true }` for a bad one. */
  resolve(input: AppPageInput): Promise<AppPageResolution>;
  /** The document title, from the projected state (null: the app's empty state). */
  title(state: object | null): string;
  /** Whether a missing subject renders an empty page instead of not found. */
  emptyWhenMissing: boolean;
}

/** One file that differs from the last check-in, as a host that knows only files reports it. */
export interface AppFileChange {
  path: string;
  status: 'changed' | 'new' | 'moved' | 'deleted';
  /** For a moved file, the path it had. */
  from?: string;
}

/** What a module tells its core from file changes alone. */
export interface AppKnown<Facts, S extends AppSnapshot> {
  facts: Facts;
  /** The snapshot's host parts: plain data the core reads beyond the files (tasks' pending moves). */
  snapshot?: Partial<S>;
}

/**
 * What a module's reply reads: the instance after the op's changes are
 * written, the host's facts about it, and the view the page shows (an op whose
 * reply depends on it, a pool, says so).
 */
export interface AppReplyContext<S extends AppSnapshot, Facts, V extends AppViewMap> {
  snapshot: S;
  facts: Facts;
  view?: AppView<V>;
}

/**
 * Everything a host needs to run one app without knowing which app it is: the
 * lifecycle and the core, which element ops are the core's and which the host
 * answers itself, how an element op becomes a core op and how the core's
 * answer becomes the element's reply, and how to treat each refusal; and what
 * is the app's own beyond its core: its copy, its bounds, its pages, where a
 * create's files fit, and what file changes mean to it. DOM-free: a host finds
 * the element through its own registration. `CreateInput` is what the create
 * bound answers: the seed, less what a host adds to it.
 */
export interface AppModule<
  V extends AppViewMap,
  O extends AppCoreOpMap,
  Facts,
  Seed,
  S extends AppSnapshot,
  E extends AppOpMap,
  CreateInput = Seed,
> {
  /** The app's name: `inventory`, `tasks`. */
  id: string;
  lifecycle: AppLifecycle;
  core: AppCore<V, O, Facts, Seed, S>;
  /** The element ops the core applies. */
  coreOps: readonly (keyof E & keyof O & string)[];
  /** The element ops a host answers itself (a divergence resolved, an editor linked). */
  hostOps: readonly (keyof E & string)[];
  /** One of `coreOps` as the core applies it, with what only the host knows added. */
  toCoreOp(op: AppOp<E>, host: AppHostInput): AppCoreOp<O>;
  /**
   * The element's reply to a core op the host applied and wrote: what the
   * element shows next, read from the instance after the changes.
   */
  reply(
    op: AppOp<E>,
    applied: { ok: true; changes: FileChange[] } & Record<string, unknown>,
    context: AppReplyContext<S, Facts, V>
  ): Result<object>;
  /** How a host treats the core's refusal of one op. */
  refusalClass(code: string, op: string): RefusalClass;
  // The five below keep a host from holding a file per app. Optional until
  // every app supplies them (app-module-grows, step 2).
  /** The app's name, icon and create copy. */
  meta?: AppMeta;
  /** The app's bounds on an op, a view and a create input. */
  bounds?: AppBounds<V, E, CreateInput>;
  /** The app's pages under its base. */
  pages?: readonly AppPage[];
  /**
   * Whether a seeded plan's files fit among a host's paths: the files still to
   * create, or the app's refusal for the first path in the way. `reusable` are
   * files an earlier, unfinished attempt at the same create left.
   */
  placeCreate?(
    plan: { manifestPath: string; files: FileChange[] },
    paths: { taken: readonly string[]; reusable?: readonly string[] }
  ): Result<{ files: FileChange[] }>;
  /**
   * The facts, and the snapshot's host parts, for a host that knows nothing but
   * which files changed since the last check-in: the app's counterpart of a
   * format descriptor's `apply`. A host that knows more builds its facts itself.
   */
  fromChanges?(changes: readonly AppFileChange[], snapshot: S): AppKnown<Facts, S>;
}

/**
 * The page a sub-path names, with its parameters, or `null`. The sub-path is
 * what follows the app's base, without its query: `''` or `/room/kitchen`; one
 * trailing slash is ignored. A parameter is one non-empty segment, decoded; a
 * segment that does not decode matches nothing. The first page that matches wins.
 */
export function matchAppPage(
  pages: readonly AppPage[],
  subPath: string
): { page: AppPage; params: Record<string, string> } | null {
  const segments = segmentsOf(subPath);
  if (segments === null) return null;
  for (const page of pages) {
    const pattern = segmentsOf(page.path);
    if (pattern === null || pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    const matched = pattern.every((part, i) => {
      const segment = segments[i];
      if (!part.startsWith(':')) return part === segment;
      if (segment === '') return false;
      try {
        params[part.slice(1)] = decodeURIComponent(segment);
        return true;
      } catch {
        return false;
      }
    });
    if (matched) return { page, params };
  }
  return null;
}

/** A sub-path's segments: `''` and `/` have none; anything else starts with `/`. */
function segmentsOf(path: string): string[] | null {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  if (trimmed === '') return [];
  if (!trimmed.startsWith('/')) return null;
  return trimmed.slice(1).split('/');
}

/** Any app's module, for a host that runs whichever it is given. */

export type AnyAppModule = AppModule<any, any, any, any, any, any>;

/** Whether an element op is one the module's core applies. */
export function isCoreOp(module: AnyAppModule, type: string): boolean {
  return (module.coreOps as readonly string[]).includes(type);
}

/**
 * Whether new files fit among a host's paths: none of them, and no folder above
 * one, may already be a file. `reusable` files (left by an earlier, unfinished
 * attempt at the same create) are skipped instead of refused. Answers the files
 * still to create, in order, or the first path in the way; each app turns that
 * path into its own refusal.
 */
export function placeNewFiles<F extends { path: string }>(
  files: readonly F[],
  paths: { taken: readonly string[]; reusable?: readonly string[] }
): { ok: true; files: F[] } | { ok: false; path: string } {
  const taken = new Set(paths.taken);
  const reusable = new Set(paths.reusable ?? []);
  // Git cannot create `a/b` while `a` is a file.
  const ancestors = new Set<string>();
  for (const { path } of files) {
    const segments = path.split('/');
    for (let i = 1; i < segments.length; i++) ancestors.add(segments.slice(0, i).join('/'));
  }
  for (const ancestor of ancestors) {
    if (taken.has(ancestor)) return { ok: false, path: ancestor };
  }
  const placed: F[] = [];
  for (const file of files) {
    if (!taken.has(file.path)) placed.push(file);
    else if (!reusable.has(file.path)) return { ok: false, path: file.path };
  }
  return { ok: true, files: placed };
}

// ---- The element half -------------------------------------------------------

/** An app element: the host sets its state; it settles like every surface. */
export interface AppElement<State> extends ReadyElement {
  setState(state: State): void;
}

/** The event an app element raises to ask its host for an op. */
export const APP_OP_EVENT = 'app-op';

/**
 * An app's ops, by type: each names its fields (`op`) and the fields of its
 * successful reply (`reply`). Ops name things by path, never by a host's ids.
 */
export type AppOpMap = Record<string, { op: object; reply: object }>;

/** One op of a map, as raised: its `type` and its fields. */
export type AppOp<M extends AppOpMap> = {
  [K in keyof M & string]: { type: K } & M[K]['op'];
}[keyof M & string];

/** The reply to one op type. */
export type AppOpReply<M extends AppOpMap, K extends keyof M> = Result<M[K]['reply']>;

/** The `app-op` event's detail. */
export interface AppOpDetail<Op = unknown, Reply extends object = object> {
  op: Op;
  /** Answer the op. Only the first call counts. */
  respond(result: Result<Reply> | Promise<Result<Reply>>): void;
}

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : typeof err === 'string' ? err : 'The host failed the op';

/**
 * Ask the host for one op. Dispatches a bubbling, composed, cancelable `app-op`
 * event; a host claims it with `preventDefault()` and answers through
 * `respond`. Nothing claiming it resolves to `OP_UNHANDLED` straight away, so an
 * element never waits on a host that is not there. A rejected answer resolves to
 * `OP_FAILED`. A host that claims an op must answer it.
 */
export function requestOp<M extends AppOpMap, K extends keyof M & string>(
  element: EventTarget,
  op: { type: K } & M[K]['op']
): Promise<AppOpReply<M, K>> {
  return new Promise((resolve) => {
    let answered = false;
    const detail: AppOpDetail<typeof op, M[K]['reply']> = {
      op,
      respond(result) {
        if (answered) return;
        answered = true;
        Promise.resolve(result).then(resolve, (err: unknown) =>
          resolve(fail('OP_FAILED', messageOf(err)))
        );
      },
    };
    const event = new CustomEvent(APP_OP_EVENT, {
      detail,
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    if (!event.defaultPrevented && !answered) {
      answered = true;
      resolve(fail('OP_UNHANDLED', `Nothing answered the "${op.type}" op`));
    }
  });
}

/**
 * The host's side: claim every op `element` raises (and any raised inside it)
 * and answer each with `handler`. A handler that throws or rejects answers
 * `OP_FAILED`. Returns a function that stops answering.
 */
export function answerOps<M extends AppOpMap>(
  element: EventTarget,
  handler: (op: AppOp<M>) => Result<object> | Promise<Result<object>>
): () => void {
  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<AppOpDetail<AppOp<M>>>).detail;
    if (!detail || typeof detail.respond !== 'function') return;
    event.preventDefault();
    let answer: Promise<Result<object>>;
    try {
      answer = Promise.resolve(handler(detail.op));
    } catch (err) {
      answer = Promise.resolve(fail('OP_FAILED', messageOf(err)));
    }
    detail.respond(answer.catch((err: unknown) => fail('OP_FAILED', messageOf(err))));
  };
  element.addEventListener(APP_OP_EVENT, listener);
  return () => element.removeEventListener(APP_OP_EVENT, listener);
}
