// The page's one way to its host. Everything the page knows about the served
// folder comes through a `HostClient`: the HTTP implementation below talks to the
// local server, a test hands the page a fake, and a desktop shell could hand it
// one over its own bridge. This is the only module in the client that calls
// `fetch` or `EventSource` (an ESLint rule in the root config fails any other).
// A later spec adds a method here, never a second way to reach the server.

import type { FolderNode, Result } from '@stillpointlab/common-format/app';
import type {
  FileStatus,
  HostChange,
  HostCommit,
  HostCommitRequest,
  HostEvent,
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

export interface HostClient {
  /** The served folder: its name, and the id the page keys stored state by. */
  root(): Promise<{ name: string; id: string }>;
  list(): Promise<{ nodes: FolderNode[]; truncated: boolean }>;
  get(path: string): Promise<Result<{ text: string; version: string }>>;
  /** A URL an element can load the file from. */
  urlFor(path: string): string;
  put(changes: readonly PortChange[]): Promise<Result<{ versions: Record<string, string> }>>;
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
  watch(listener: (event: HostEvent) => void): () => void;
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
    commit: (request) =>
      result('/api/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      }),
    put: (changes) =>
      result('/api/files', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ changes }),
      }),
    watch(listener) {
      const source = new EventSource(url('/api/events'));
      let dropped = false;
      source.onmessage = (message: MessageEvent<string>) => {
        let event: HostEvent;
        try {
          event = JSON.parse(message.data) as HostEvent;
        } catch {
          return;
        }
        if (event.type === 'changed') {
          for (const path of event.paths) revisions.set(path, (revisions.get(path) ?? 0) + 1);
        }
        listener(event);
      };
      // The browser reconnects by itself. Whatever changed while the stream was
      // down was not sent, so a reconnection says the list is stale.
      source.onerror = () => {
        dropped = true;
      };
      source.onopen = () => {
        if (!dropped) return;
        dropped = false;
        listener({ type: 'listed' });
      };
      return () => source.close();
    },
  };
}
