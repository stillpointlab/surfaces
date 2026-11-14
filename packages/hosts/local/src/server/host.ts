// The local host as a library: `createHost` answers the web's `Request` with a
// `Response`, so the `bin` is a thin adapter from `node:http`, and a desktop shell
// can serve the same handler under its own scheme.
//
// Every request passes three checks before its route (`createRequestCheck`, which
// development mode applies to what Vite serves as well):
//
// - its `Host` is the host's own (`127.0.0.1:<port>` or `localhost:<port>`, from
//   `origin`), so another site cannot reach it through a name it controls (DNS
//   rebinding);
// - a request that is not a `GET` carries an `Origin` equal to `origin` (or its
//   loopback twin, `localhost` for `127.0.0.1` and back, the same server);
// - a request another site's page started is refused, by its `Origin` on any
//   method, and by `Sec-Fetch-Site` when the browser sends it, except a
//   navigation (a link to the host from elsewhere still opens it).
//
// In a git repository the watcher also watches `HEAD` and `index` in git's own
// folder (a worktree's, or the one above a served subfolder), and the stream sends
// `{ type: 'status' }` when either changes: a commit, a stage or a switch made in
// a terminal, and the host's own staging. The host's reads never write the index
// (`GIT_OPTIONAL_LOCKS=0`), so reading the status after the event raises no other.

import { createHash } from 'node:crypto';
import { constants, open } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Readable } from 'node:stream';

import { LIST_LIMIT, MAX_BODY_BYTES } from './limits';
import { isInside, locate, outsideRoot, pathProblem } from './paths';
import { createNodePort } from './port';
import { createFolderWatcher } from './watcher';

import type { PageHandler } from './page';
import type { NodePort, PortStart } from './port';
import type { FolderWatcher } from './watcher';
import type { Failure } from '@stillpointlab/common-format/app';
import type {
  HostCommitRequest,
  HostEvent,
  HostListing,
  HostRoot,
} from '@stillpointlab/common-format/host';
import type { FileHandle } from 'node:fs/promises';

export interface Host {
  /** Answer one request. */
  fetch(request: Request): Promise<Response>;
  close(): Promise<void>;
}

export interface HostOptions {
  /** The folder to serve. */
  root: string;
  /** The page's origin (`http://127.0.0.1:5190`): the `Host` and `Origin` checks read it. */
  origin: string;
  /** The environment `git` runs in; the process's own by default. */
  env?: NodeJS.ProcessEnv;
  /** Something the host could not do but can work without. The default prints it. */
  warn?(message: string): void;
  /**
   * The page: a `GET` or `HEAD` of any path outside `/api/`, once the request has
   * passed the checks. The `surfaces` command serves the built client
   * (`createStaticPage`); without one, those paths answer `HOST_NO_ROUTE`.
   */
  page?: PageHandler;
}

export interface LocalHost extends Host {
  /** The port the host reads and writes through. */
  readonly port: NodePort;
  /** Resolves once the host has decided how it lists and is watching the folder. */
  ready(): Promise<PortStart>;
}

/** The HTTP status for a refusal's code: not found, a conflict, or anything else. */
export function statusFor(code: string): number {
  switch (code) {
    case 'HOST_FILE_NOT_FOUND':
      return 404;
    case 'HOST_PATH_EXISTS':
    case 'HOST_FILE_CHANGED':
    case 'HOST_NOT_A_REPOSITORY':
    case 'HOST_GIT_NOT_FOUND':
    case 'HOST_NOT_CHANGED':
    case 'HOST_PATH_CONFLICTED':
    case 'HOST_GIT_IN_PROGRESS':
    case 'HOST_DETACHED_HEAD':
    case 'HOST_BRANCH_EXISTS':
      return 409;
    case 'HOST_WRITE_FAILED':
    case 'HOST_GIT_FAILED':
      return 500;
    default:
      return 400;
  }
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...headers },
  });
}

function refusal(failure: Failure, status = statusFor(failure.code)): Response {
  return json({ ok: false, code: failure.code, message: failure.message }, status);
}

function refuse(
  code: string,
  message: string,
  status: number,
  headers?: Record<string, string>
): Response {
  return json({ ok: false, code, message }, status, headers);
}

/** The type `/api/raw` sends for an extension; anything else is bytes. */
const TYPES: Record<string, string> = {
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ts': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.weba': 'audio/webm',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
};

/** The `Host` values that name this server, from its origin. */
function hostsFor(origin: URL): Set<string> {
  const hosts = new Set([origin.host.toLowerCase()]);
  const port = origin.port === '' ? '' : `:${origin.port}`;
  if (origin.hostname === '127.0.0.1') hosts.add(`localhost${port}`);
  if (origin.hostname === 'localhost') hosts.add(`127.0.0.1${port}`);
  return hosts;
}

/** What the checks read of a request: a `Request` has all three. */
export interface CheckedRequest {
  method: string;
  url: string;
  headers: Headers;
}

/**
 * The checks every request passes before it is answered, for the host whose page
 * is at `origin`: a `Response` that refuses it, or `null`.
 */
export function createRequestCheck(origin: string): (request: CheckedRequest) => Response | null {
  const base = new URL(origin);
  const allowedHosts = hostsFor(base);
  const allowedOrigins = new Set([...allowedHosts].map((host) => `${base.protocol}//${host}`));
  return (request) => {
    let fallback = '';
    try {
      fallback = new URL(request.url).host;
    } catch {
      // no usable URL: the `Host` header alone decides
    }
    const host = (request.headers.get('host') ?? fallback).toLowerCase();
    if (!allowedHosts.has(host)) {
      return refuse(
        'HOST_FORBIDDEN',
        `This server answers only as ${[...allowedHosts].join(' or ')}.`,
        403
      );
    }
    const from = request.headers.get('origin');
    if (request.method !== 'GET' && (from === null || !allowedOrigins.has(from))) {
      return refuse('HOST_FORBIDDEN', `A ${request.method} must come from ${base.origin}.`, 403);
    }
    if (from !== null && !allowedOrigins.has(from)) {
      return refuse('HOST_FORBIDDEN', 'Another origin cannot read this server.', 403);
    }
    const site = request.headers.get('sec-fetch-site');
    const mode = request.headers.get('sec-fetch-mode');
    if ((site === 'cross-site' || site === 'same-site') && mode !== 'navigate') {
      return refuse('HOST_FORBIDDEN', 'Another site cannot read this server.', 403);
    }
    return null;
  };
}

export function createHost(options: HostOptions): LocalHost {
  const check = createRequestCheck(options.origin);
  const warn = options.warn ?? ((message: string) => console.warn(`surfaces: ${message}`));

  const port = createNodePort({ root: options.root, env: options.env, warn });
  const root = port.root;
  const rootAnswer: HostRoot = {
    name: basename(root) || root,
    id: createHash('sha256').update(root).digest('hex'),
  };

  // Server-sent events: one controller per listener.
  const listeners = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();
  function broadcast(event: HostEvent): void {
    const chunk = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
    for (const listener of listeners) {
      try {
        listener.enqueue(chunk);
      } catch {
        listeners.delete(listener);
      }
    }
  }
  const keepAlive = setInterval(() => {
    const chunk = encoder.encode(': keep-alive\n\n');
    for (const listener of listeners) {
      try {
        listener.enqueue(chunk);
      } catch {
        listeners.delete(listener);
      }
    }
  }, 25_000);
  keepAlive.unref();

  const watcher: FolderWatcher = createFolderWatcher({
    root,
    list: () => port.list(),
    send: broadcast,
    warn,
  });
  let closed = false;
  const ready = (async () => {
    const start = await port.start();
    await watcher.ready;
    const git = await port.git.start();
    if (git.state === 'repository' && !closed) {
      watcher.watchNames(git.gitDir, ['HEAD', 'index'], () => broadcast({ type: 'status' }));
    }
    return start;
  })();
  // A failure surfaces through `ready()`; it must not go unhandled if nobody asks.
  ready.catch(() => undefined);

  type Handler = (request: Request, url: URL) => Promise<Response>;

  function pathParam(url: URL): string {
    return url.searchParams.get('path') ?? '';
  }

  const routes: Record<string, Partial<Record<string, Handler>>> = {
    '/api/list': {
      GET: async () => {
        const nodes = await port.list();
        const answer: HostListing = {
          nodes: nodes.slice(0, LIST_LIMIT),
          truncated: nodes.length > LIST_LIMIT,
        };
        return json(answer);
      },
    },
    '/api/file': {
      GET: async (_request, url) => {
        const answer = await port.get(pathParam(url));
        return answer.ok ? json(answer) : refusal(answer);
      },
    },
    '/api/raw': {
      GET: async (_request, url) => raw(pathParam(url)),
    },
    '/api/files': {
      PUT: async (request) => {
        const body = await readBody(request);
        if (body instanceof Response) return body;
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          return refuse('HOST_BAD_REQUEST', 'The body is not JSON.', 400);
        }
        const changes = (parsed as { changes?: unknown } | null)?.changes;
        if (!Array.isArray(changes)) {
          return refuse('HOST_BAD_REQUEST', 'The body must be { "changes": [...] }.', 400);
        }
        const answer = await port.put(changes);
        return answer.ok ? json(answer) : refusal(answer);
      },
    },
    '/api/status': {
      GET: async () => json(await port.status()),
    },
    '/api/git': {
      GET: async () => json(await port.git.info()),
    },
    '/api/changes': {
      GET: async () => {
        const answer = await port.git.changes();
        return answer.ok ? json(answer) : refusal(answer);
      },
    },
    '/api/base': {
      GET: async (_request, url) => {
        const answer = await port.git.base(pathParam(url));
        return answer.ok ? json(answer) : refusal(answer);
      },
    },
    '/api/commit': {
      POST: async (request) => {
        const body = await readBody(request);
        if (body instanceof Response) return body;
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          return refuse('HOST_BAD_REQUEST', 'The body is not JSON.', 400);
        }
        // The port checks the body's shape: a request may come from anywhere.
        const answer = await port.commit(parsed as HostCommitRequest);
        return answer.ok ? json(answer) : refusal(answer);
      },
    },
    '/api/root': {
      GET: async () => json(rootAnswer),
    },
    '/api/events': {
      GET: async (request) => events(request),
    },
  };

  async function raw(path: string): Promise<Response> {
    const problem = pathProblem(path);
    if (problem !== null) return refusal(outsideRoot(path, problem));
    const at = await locate(root, path);
    if (at.kind === 'outside') {
      return refusal(outsideRoot(path, 'a symbolic link on the path leads out of it.'));
    }
    const missing = (): Response =>
      refuse('HOST_FILE_NOT_FOUND', `There is no file at ${JSON.stringify(path)}.`, 404);
    if (at.kind !== 'file' || !isInside(root, at.real)) return missing();
    let handle: FileHandle | undefined;
    let size: number;
    try {
      // Non-blocking, so a pipe swapped in after the check cannot hang the read.
      handle = await open(at.real, constants.O_RDONLY | constants.O_NONBLOCK);
      const info = await handle.stat();
      if (!info.isFile()) throw new Error('not a file');
      size = info.size;
    } catch {
      await handle?.close();
      return missing();
    }
    // The stream closes the handle when it ends or is cancelled.
    const stream = handle.createReadStream();
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers: {
        'content-type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
        'content-length': String(size),
        'content-security-policy': 'sandbox',
        ...SECURITY_HEADERS,
      },
    });
  }

  function events(request: Request): Response {
    let self!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        self = controller;
        listeners.add(controller);
        // The first bytes say the stream is open (and how soon to reconnect).
        controller.enqueue(encoder.encode('retry: 1000\n\n'));
      },
      cancel() {
        listeners.delete(self);
      },
    });
    request.signal.addEventListener('abort', () => {
      listeners.delete(self);
      try {
        self.close();
      } catch {
        // already closed
      }
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        ...SECURITY_HEADERS,
      },
    });
  }

  async function fetch(request: Request): Promise<Response> {
    if (closed) return refuse('HOST_CLOSED', 'The host is closed.', 503);
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return refuse('HOST_BAD_REQUEST', 'The request has no usable URL.', 400);
    }
    const refused = check(request);
    if (refused) return refused;
    const route = routes[url.pathname];
    if (!route && options.page && !url.pathname.startsWith('/api/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return refuse('HOST_METHOD_NOT_ALLOWED', 'The page answers GET, HEAD.', 405, {
          allow: 'GET, HEAD',
        });
      }
      return options.page(request, url);
    }
    if (!route) return refuse('HOST_NO_ROUTE', `Nothing is served at ${url.pathname}.`, 404);
    const handler = route[request.method];
    if (!handler) {
      const allow = Object.keys(route).join(', ');
      return refuse('HOST_METHOD_NOT_ALLOWED', `${url.pathname} answers ${allow}.`, 405, { allow });
    }
    try {
      return await handler(request, url);
    } catch (error) {
      warn(`${request.method} ${url.pathname} failed: ${String(error)}`);
      return refuse('HOST_ERROR', 'The host could not answer; its terminal says why.', 500);
    }
  }

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    clearInterval(keepAlive);
    watcher.close();
    for (const listener of listeners) {
      try {
        listener.close();
      } catch {
        // already closed
      }
    }
    listeners.clear();
  }

  return { fetch, close, port, ready: () => ready };
}

/** A request's body as text, refused past `MAX_BODY_BYTES`. */
async function readBody(request: Request): Promise<string | Response> {
  if (!request.body) return '';
  const declared = Number(request.headers.get('content-length') ?? '0');
  const tooLarge = () =>
    refuse('HOST_BODY_TOO_LARGE', `The body is over ${MAX_BODY_BYTES / 1024 / 1024} MiB.`, 413);
  if (declared > MAX_BODY_BYTES) return tooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
