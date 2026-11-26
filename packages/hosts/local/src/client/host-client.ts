// The page's one way to its host. Everything the page knows about the served
// folder comes through a `HostClient`: the HTTP implementation below talks to the
// local server, a test hands the page a fake, and a desktop shell could hand it
// one over its own bridge. This is the only module in the client that calls
// `fetch` or `EventSource` (an ESLint rule in the root config fails any other).
// A later spec adds a method here, never a second way to reach the server.

import type {
  AppLockAnswer,
  AppOpAnswer,
  AppPageAnswer,
  AppsAnswer,
  FoundInstance,
  LocalHostEvent,
} from '../shared/apps';
import type { CannotUndoNotice, JournalLabels, JournalMove } from '../shared/journal';
import type { FolderNode, Result } from '@stillpointlab/common-format/app';
import type {
  FileStatus,
  HostChange,
  HostCommit,
  HostCommitRequest,
  HostGit,
  PortChange,
} from '@stillpointlab/common-format/host';

export type {
  HostChange,
  HostCommit,
  HostCommitRequest,
  HostEvent,
  HostGit,
} from '@stillpointlab/common-format/host';
export type {
  AppLockAnswer,
  AppOpAnswer,
  AppPageAnswer,
  FoundInstance,
  LocalHostEvent,
} from '../shared/apps';
export type { CannotUndoNotice, JournalLabels, JournalMove, UnkeptReason } from '../shared/journal';

/**
 * What a watcher hears: the host's events, and the client's own words: that the
 * stream came back after it dropped, when anything may have changed unheard; and
 * that the server was started again (`restarted`), once, after which the stream
 * is closed for good.
 */
export type WatchedEvent = LocalHostEvent | { type: 'reconnected' } | { type: 'restarted' };

/** How a write goes: `unjournaled` when the person agreed it cannot be undone. */
export interface PutOptions {
  unjournaled?: boolean;
}

export interface HostClient {
  /** The served folder: its name, and the id the page keys stored state by. */
  root(): Promise<{ name: string; id: string }>;
  list(): Promise<{ nodes: FolderNode[]; truncated: boolean }>;
  get(path: string): Promise<Result<{ text: string; version: string }>>;
  /**
   * Whether a file is at `path`, whatever its bytes, with none of it read: `get`
   * reads text, and refuses an image. A refusal is the server's, as `get`'s is.
   * A success carries the file's `validator` (the raw route's `ETag`, its size
   * and time), which changes when the file does; `null` from a host that sends
   * none.
   */
  probe(path: string): Promise<Result<{ validator: string | null }>>;
  /**
   * A URL an element can load the file from, in ranges; an address relative to
   * it resolves to the file's neighbour. Given the `validator` `probe` answered,
   * the address names it, so it changes when the file does and only then: the
   * browser's copy of the file it has serves an address it has seen, and a
   * changed file, at a new address, is loaded anew by every cache on the way.
   */
  urlFor(path: string, validator?: string | null): string;
  /**
   * Write all the changes or none. The explorer's creates, moves and deletes are
   * a step undo takes back; one the host cannot keep is refused with
   * `HOST_CANNOT_UNDO` (and its `reason`), and written with `{ unjournaled: true }`.
   */
  put(
    changes: readonly PortChange[],
    options?: PutOptions
  ): Promise<Result<{ versions: Record<string, string> }>>;
  /** The labels of the steps undo and redo would take next. */
  journal(): Promise<Result<JournalLabels>>;
  /**
   * Take back the newest step: what it moved and deleted, or a refusal
   * (`HOST_NOTHING_TO_UNDO`; `HOST_UNDO_CONFLICT` with the `path` that moved on).
   */
  undo(): Promise<Result<JournalMove>>;
  /** Do the step last undone again, as `undo` answers. */
  redo(): Promise<Result<JournalMove>>;
  status(): Promise<Record<string, FileStatus>>;
  /** Whether the folder is under git (decided when the host started), and the branch. */
  git(): Promise<HostGit>;
  /** What differs from the last commit, deleted and moved files included. Only in `repository`. */
  changes(): Promise<Result<{ changes: HostChange[] }>>;
  /** A file's text at `HEAD` (a moved file's, under its old path). Only in `repository`. */
  base(path: string): Promise<Result<{ text: string }>>;
  /**
   * Commit the chosen paths, and nothing else, on the current branch or a new one.
   * Only in `repository`; a refusal, git's own included, is a `Result` failure.
   */
  commit(request: HostCommitRequest): Promise<Result<HostCommit>>;
  /** The app instances in the folder, locked or not, valid or not. */
  apps(): Promise<FoundInstance[]>;
  /**
   * One page of an instance: `path` is its sub-path under the instance
   * (`''`, `/room/kitchen`) and `query` its query, both still encoded.
   */
  appPage(manifestPath: string, path: string, query: string): Promise<Result<AppPageAnswer>>;
  /** One view of an instance, for a shell's `project`. */
  appProject(
    manifestPath: string,
    view: unknown
  ): Promise<Result<{ state: object | null; revision: string }>>;
  /** One op on an instance; `view` is what the shell's `opView` answered for it. */
  appOp(manifestPath: string, op: unknown, view?: unknown): Promise<Result<AppOpAnswer>>;
  /**
   * Create an instance of `app` in `folder` (`''`: the served root, which an app
   * may ask consent for) from its create form's `input`.
   */
  appCreate(request: {
    app: string;
    folder: string;
    confirmRoot?: boolean;
    input: unknown;
  }): Promise<Result<{ manifestPath: string; notice?: CannotUndoNotice }>>;
  /** Lock an instance's files, or unlock them; locking answers the manifest's problems now. */
  setAppLock(manifestPath: string, locked: boolean): Promise<Result<AppLockAnswer>>;
  watch(listener: (event: WatchedEvent) => void): () => void;
}

/**
 * The raw route's address for a file: its path in the address's path, each
 * segment percent-encoded, so an address relative to it (a playlist's segment, an
 * image beside a page) resolves to the file's neighbour. Without the page's base.
 */
export function rawAddress(path: string): string {
  return `/api/raw/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** The code a client answers with when the server could not be reached or answered nonsense. */
export const UNREACHABLE = 'HOST_UNREACHABLE';

/** The host's refusal of a request without its run's token. */
export const TOKEN_REQUIRED = 'HOST_TOKEN_REQUIRED';

/** How long a stream the browser gave up on waits to be opened again: the server's `retry`. */
const REOPEN_MS = 1000;

/**
 * A `HostClient` over the local server's routes, at `base` (`''` for the page's
 * own origin). `get` and `put` answer a refusal as a `Result` failure, with the
 * server's code, and a failure to reach the server as `HOST_UNREACHABLE`; the
 * other reads throw, since the page cannot work without them.
 *
 * The run's token travels in the cookie the printed address set, which the
 * browser sends with every request here, the event stream and every element's
 * load included: nothing here sets it. A page left open across a restart holds
 * the old run's cookie, and the new run refuses every request with
 * `HOST_TOKEN_REQUIRED`. The client tells its watchers `restarted` the first
 * time a call is refused so, or the stream fails and `GET /api/root` is, and
 * closes the stream for good: retrying it would be refused every time. A stream
 * the browser gave up on for any other answer (the 503 of a server still
 * starting) is opened again each second until one of the two is known.
 */
export function createHttpClient(base = ''): HostClient {
  const url = (route: string) => `${base}${route}`;
  const watchers = new Set<(event: WatchedEvent) => void>();
  /** Each watch's stream, closed for good when the server is found started again. */
  const streams = new Set<() => void>();
  let restarted = false;
  let checking = false;

  function sawRestart(): void {
    if (restarted) return;
    restarted = true;
    for (const halt of streams) halt();
    for (const listener of watchers) listener({ type: 'restarted' });
  }

  /** `fetch`, noting a refusal for want of the run's token. */
  async function call(route: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(url(route), init);
    if (response.status === 403) {
      const body = (await response
        .clone()
        .json()
        .catch(() => null)) as { code?: unknown } | null;
      if (body?.code === TOKEN_REQUIRED) sawRestart();
    }
    return response;
  }

  /** The stream failed: ask a route whether this page's run is over, or the server only away. */
  async function checkRun(): Promise<void> {
    if (checking || restarted) return;
    checking = true;
    try {
      const response = await call('/api/root', { headers: { accept: 'application/json' } });
      void response.body?.cancel().catch(() => undefined);
    } catch {
      // not reachable: the stream retries by itself
    } finally {
      checking = false;
    }
  }
  async function read<T>(route: string): Promise<T> {
    const response = await call(route, { headers: { accept: 'application/json' } });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message ?? `${route} answered ${response.status}.`);
    }
    return (await response.json()) as T;
  }

  const post = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  /** A route that answers a `Result`: success or the server's refusal, never a throw. */
  async function result<T extends object>(
    route: string,
    init?: RequestInit,
    answered?: (response: Response) => Result<T> | null
  ): Promise<Result<T>> {
    let response: Response;
    try {
      response = await call(route, init);
    } catch (error) {
      return { ok: false, code: UNREACHABLE, message: `The host could not be reached (${error}).` };
    }
    const early = answered?.(response);
    if (early) return early;
    const body = (await response.json().catch(() => null)) as Result<T> | null;
    if (body === null || typeof body !== 'object' || typeof body.ok !== 'boolean') {
      return {
        ok: false,
        code: UNREACHABLE,
        message: `The host answered ${response.status} with something that is not a result.`,
      };
    }
    return body;
  }

  return {
    root: () => read('/api/root'),
    list: () => read('/api/list'),
    status: () => read('/api/status'),
    git: () => read('/api/git'),
    changes: () => result('/api/changes'),
    base: (path) => result(`/api/base?path=${encodeURIComponent(path)}`),
    get: (path) => result(`/api/file?path=${encodeURIComponent(path)}`),
    // The raw route sends the file's bytes: a success is taken from the status and
    // the validator, and the body let go unread. A refusal is JSON, as everywhere.
    // Asked past the browser's cache, which it neither reads (the answer is about
    // the disk now) nor fills with a body cut short. By `GET`: the request checks
    // ask any other method for the page's `Origin`, which a browser does not send
    // with a `HEAD` to its own origin.
    probe: (path) =>
      result(rawAddress(path), { cache: 'no-store' }, (response) => {
        if (!response.ok) return null;
        void response.body?.cancel().catch(() => undefined);
        return { ok: true, validator: response.headers.get('etag') };
      }),
    // The server reads the address's path alone, and no query: `rev` is for the
    // browser's caches, which key a copy by the whole address.
    urlFor: (path, validator) =>
      url(
        `${rawAddress(path)}${validator ? `?rev=${encodeURIComponent(validator.replace(/^W\/|"/g, ''))}` : ''}`
      ),
    commit: (request) => result('/api/commit', post(request)),
    apps: async () => (await read<AppsAnswer>('/api/apps')).apps,
    appPage: (manifestPath, path, query) =>
      result(`/api/apps/page?${new URLSearchParams({ manifestPath, path, query })}`),
    appProject: (manifestPath, view) =>
      result(
        `/api/apps/project?${new URLSearchParams({ manifestPath, view: JSON.stringify(view) })}`
      ),
    appOp: (manifestPath, op, view) =>
      result(
        '/api/apps/op',
        post(view === undefined ? { manifestPath, op } : { manifestPath, op, view })
      ),
    appCreate: (request) => result('/api/apps/create', post(request)),
    setAppLock: (manifestPath, locked) => result('/api/apps/lock', post({ manifestPath, locked })),
    put: (changes, options) =>
      result('/api/files', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(options?.unjournaled ? { changes, unjournaled: true } : { changes }),
      }),
    journal: () => result('/api/journal'),
    undo: () => result('/api/undo', post({})),
    redo: () => result('/api/redo', post({})),
    watch(listener) {
      // One stream, and only while the tab shows. A browser allows six connections
      // to one host over HTTP/1.1, across all its tabs, and an event stream holds
      // one for good: with a stream in every tab, the sixth tab's requests, and
      // then every tab's, wait with no word. A hidden tab gives its stream back.
      let source: EventSource | null = null;
      // Whether the next stream to open follows a gap in which changes went unheard.
      let stale = document.hidden;
      /** A stream the browser gave up on, waiting to be opened again. */
      let reopen: ReturnType<typeof setTimeout> | null = null;
      const cancelReopen = () => {
        if (reopen !== null) clearTimeout(reopen);
        reopen = null;
      };
      const open = () => {
        cancelReopen();
        if (restarted) return;
        const opened = new EventSource(url('/api/events'));
        source = opened;
        opened.onmessage = (message: MessageEvent<string>) => {
          let event: LocalHostEvent;
          try {
            event = JSON.parse(message.data) as LocalHostEvent;
          } catch {
            return;
          }
          listener(event);
        };
        // The browser reconnects by itself. Whatever changed while the stream was
        // down, or closed under a hidden tab, was not sent, so the next open says
        // the list is stale, and the journal with it: a server that restarted has
        // no steps. Then it says so itself, for what no event names: the file that
        // is open.
        // A page of an earlier run is refused the stream; the browser gives up on a
        // refusal, and keeps trying while the server is away. `checkRun` tells the two
        // apart. The browser gives up on any answer but the stream's, though: the 503
        // "Starting." of a server on its way up too, whose check meets the same 503.
        // So a stream given up on is opened again a second later, as the browser does
        // after a dropped connection, until the server answers it or the run is over.
        opened.onerror = () => {
          stale = true;
          void checkRun();
          if (opened.readyState === EventSource.CLOSED && source === opened && reopen === null) {
            reopen = setTimeout(() => {
              reopen = null;
              if (source === opened) open();
            }, REOPEN_MS);
          }
        };
        opened.onopen = () => {
          if (!stale) return;
          stale = false;
          listener({ type: 'listed' });
          listener({ type: 'journal' });
          listener({ type: 'reconnected' });
        };
      };
      const onVisibility = () => {
        if (document.hidden) {
          cancelReopen();
          source?.close();
          source = null;
          stale = true;
        } else if (!source) {
          open();
        }
      };
      const halt = () => {
        cancelReopen();
        source?.close();
        source = null;
      };
      watchers.add(listener);
      streams.add(halt);
      document.addEventListener('visibilitychange', onVisibility);
      if (!document.hidden) open();
      return () => {
        watchers.delete(listener);
        streams.delete(halt);
        document.removeEventListener('visibilitychange', onVisibility);
        halt();
      };
    },
  };
}
