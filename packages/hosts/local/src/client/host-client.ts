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
import type { JournalLabels, JournalMove } from '../shared/journal';
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

/** How a write goes: `unjournaled` when the person agreed it cannot be undone. */
export interface PutOptions {
  unjournaled?: boolean;
}

export interface HostClient {
  /** The served folder: its name, and the id the page keys stored state by. */
  root(): Promise<{ name: string; id: string }>;
  list(): Promise<{ nodes: FolderNode[]; truncated: boolean }>;
  get(path: string): Promise<Result<{ text: string; version: string }>>;
  /** A URL an element can load the file from. */
  urlFor(path: string): string;
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
  }): Promise<Result<{ manifestPath: string }>>;
  /** Lock an instance's files, or unlock them; locking answers the manifest's problems now. */
  setAppLock(manifestPath: string, locked: boolean): Promise<Result<AppLockAnswer>>;
  watch(listener: (event: LocalHostEvent) => void): () => void;
}

/** The code a client answers with when the server could not be reached or answered nonsense. */
export const UNREACHABLE = 'HOST_UNREACHABLE';

/**
 * A `HostClient` over the local server's routes, at `base` (`''` for the page's
 * own origin). `get` and `put` answer a refusal as a `Result` failure, with the
 * server's code, and a failure to reach the server as `HOST_UNREACHABLE`; the
 * other reads throw, since the page cannot work without them.
 */
export function createHttpClient(base = ''): HostClient {
  const url = (route: string) => `${base}${route}`;
  // How often each path has changed while this client watched: `urlFor` names the
  // revision, so an element given the URL again after a change loads the new
  // bytes rather than the browser's copy of the old (the server reads `path` alone).
  const revisions = new Map<string, number>();

  async function read<T>(route: string): Promise<T> {
    const response = await fetch(url(route), { headers: { accept: 'application/json' } });
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
  async function result<T extends object>(route: string, init?: RequestInit): Promise<Result<T>> {
    let response: Response;
    try {
      response = await fetch(url(route), init);
    } catch (error) {
      return { ok: false, code: UNREACHABLE, message: `The host could not be reached (${error}).` };
    }
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
    urlFor(path) {
      const revision = revisions.get(path);
      const query = `path=${encodeURIComponent(path)}${revision ? `&rev=${revision}` : ''}`;
      return url(`/api/raw?${query}`);
    },
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
      const source = new EventSource(url('/api/events'));
      let dropped = false;
      source.onmessage = (message: MessageEvent<string>) => {
        let event: LocalHostEvent;
        try {
          event = JSON.parse(message.data) as LocalHostEvent;
        } catch {
          return;
        }
        if (event.type === 'changed') {
          for (const path of event.paths) revisions.set(path, (revisions.get(path) ?? 0) + 1);
        }
        listener(event);
      };
      // The browser reconnects by itself. Whatever changed while the stream was
      // down was not sent, so a reconnection says the list is stale, and the
      // journal with it: a server that restarted has no steps.
      source.onerror = () => {
        dropped = true;
      };
      source.onopen = () => {
        if (!dropped) return;
        dropped = false;
        listener({ type: 'listed' });
        listener({ type: 'journal' });
      };
      return () => source.close();
    },
  };
}
