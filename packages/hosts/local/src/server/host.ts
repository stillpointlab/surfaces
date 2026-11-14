// The local host as a library: `createHost` answers the web's `Request` with a
// `Response`, so the `bin` is a thin adapter from `node:http`, and a desktop shell
// can serve the same handler under its own scheme.
//
// Every request passes three checks before its route:
//
// - its `Host` is the host's own (`127.0.0.1:<port>` or `localhost:<port>`, from
//   `origin`), so another site cannot reach it through a name it controls (DNS
//   rebinding);
// - a request that is not a `GET` carries an `Origin` equal to `origin` (or its
//   loopback twin, `localhost` for `127.0.0.1` and back, the same server);
// - a request another site's page started is refused, by its `Origin` on any
//   method, and by `Sec-Fetch-Site` when the browser sends it, except a
//   navigation (a link to the host from elsewhere still opens it).

import { createHash } from 'node:crypto';
import { constants, open } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Readable } from 'node:stream';

import { escapeHtml } from '@stillpointlab/common-format/html';

import { LIST_LIMIT, MAX_BODY_BYTES } from './limits';
import { isInside, locate, outsideRoot, pathProblem } from './paths';
import { createNodePort } from './port';
import { createFolderWatcher } from './watcher';

import type { NodePort, PortStart } from './port';
import type { FolderWatcher } from './watcher';
import type { Failure } from '@stillpointlab/common-format/app';
import type { HostEvent, HostListing, HostRoot } from '@stillpointlab/common-format/host';
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
      return 409;
    case 'HOST_WRITE_FAILED':
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

export function createHost(options: HostOptions): LocalHost {
  const origin = new URL(options.origin);
  const allowedHosts = hostsFor(origin);
  const allowedOrigins = new Set([...allowedHosts].map((host) => `${origin.protocol}//${host}`));
  const warn = options.warn ?? ((message: string) => console.warn(`surfaces: ${message}`));

  const port = createNodePort({ root: options.root, env: options.env });
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
    '/api/root': {
      GET: async () => json(rootAnswer),
    },
    '/api/events': {
      GET: async (request) => events(request),
    },
    '/': {
      GET: async () =>
        new Response(
          `<!doctype html><meta charset="utf-8"><title>${escapeHtml(rootAnswer.name)}</title>` +
            `<p>Serving <code>${escapeHtml(root)}</code>.</p>\n`,
          {
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'content-security-policy': "default-src 'none'",
              ...SECURITY_HEADERS,
            },
          }
        ),
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

  /** The request's checks; a `Response` when it is refused. */
  function check(request: Request, url: URL): Response | null {
    const host = (request.headers.get('host') ?? url.host).toLowerCase();
    if (!allowedHosts.has(host)) {
      return refuse(
        'HOST_FORBIDDEN',
        `This server answers only as ${[...allowedHosts].join(' or ')}.`,
        403
      );
    }
    const from = request.headers.get('origin');
    if (request.method !== 'GET' && (from === null || !allowedOrigins.has(from))) {
      return refuse('HOST_FORBIDDEN', `A ${request.method} must come from ${origin.origin}.`, 403);
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
  }

  async function fetch(request: Request): Promise<Response> {
    if (closed) return refuse('HOST_CLOSED', 'The host is closed.', 503);
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return refuse('HOST_BAD_REQUEST', 'The request has no usable URL.', 400);
    }
    const refused = check(request, url);
    if (refused) return refused;
    const route = routes[url.pathname];
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
