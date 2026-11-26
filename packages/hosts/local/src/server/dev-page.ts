// Development mode (`npm run serve`): the page from its sources, through Vite as
// middleware in the server's own process, so the page and the API share one
// origin and one set of request checks. Only this module imports Vite, and only
// by a dynamic import when it runs: the `surfaces` command never loads it.
//
// Every request outside `/api/` passes the host's own checks (`Host`, `Origin`,
// `Sec-Fetch-Site`, the run's token) before Vite sees it, and gets the page's
// headers, the content security policy among them; the printed address's
// exchange for the cookie happens here as it does for the built page. Vite's HMR
// socket is an upgrade, which a request listener never sees: Vite is given a
// stand-in for the server to listen on, and an upgrade reaches it only once it
// has passed the same checks (the cookie with it: a browser sends it with a
// WebSocket to its own host) and carries the page's `Origin` (a browser always
// sends one with a WebSocket). Vite's own token check on the socket stays on as
// well. Its token is in the socket's query as `token` too, so an upgrade is
// checked without its query: a socket is never the exchange.

import { EventEmitter } from 'node:events';

import { clientConfig } from './client-build';
import { createRequestCheck } from './host';
import { PAGE_HEADERS } from './page';

import type { IncomingHttpHeaders, IncomingMessage, RequestListener, Server } from 'node:http';

export interface DevPage {
  /** Answer a request: `/api/` goes to the host, anything else to Vite. */
  handle: RequestListener;
  close(): Promise<void>;
}

export interface DevPageOptions {
  /** The server the page is served from; its upgrades are checked here. */
  server: Server;
  /** The page's origin, `http://127.0.0.1:<port>`. */
  origin: string;
  /** The run's token, as the host is given it (`null`: none asked). */
  token: string | null;
  /** The host's own listener, for `/api/`. */
  api: RequestListener;
}

function headersOf(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  return headers;
}

export async function createDevPage(options: DevPageOptions): Promise<DevPage> {
  const check = createRequestCheck(options.origin, options.token);
  const refusal = (req: IncomingMessage, target = req.url ?? '/'): Response | null =>
    check({
      method: req.method ?? 'GET',
      url: options.origin + target,
      headers: headersOf(req.headers),
    });

  // What Vite listens on for upgrades, in place of the server itself.
  const upgrades = new EventEmitter();
  options.server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '/').split('?')[0];
    if (refusal(req, path) !== null || req.headers.origin === undefined) {
      socket.destroy();
      return;
    }
    upgrades.emit('upgrade', req, socket, head);
  });

  const { createServer } = await import('vite');
  const config = clientConfig();
  const vite = await createServer({
    ...config,
    configFile: false,
    appType: 'mpa',
    server: {
      middlewareMode: true,
      ws: { server: upgrades as unknown as Server },
      // The host's checks decide who may read; Vite adds no CORS headers of its own.
      cors: false,
    },
  });

  return {
    handle(req, res) {
      const target = req.url ?? '';
      if (target.startsWith('/api/')) {
        options.api(req, res);
        return;
      }
      // A refusal, or the exchange's redirect with its cookie: sent as it is.
      const checked = target.startsWith('/') ? refusal(req) : null;
      if (!target.startsWith('/') || checked) {
        void (async () => {
          const body = checked ? await checked.text() : 'Bad request.\n';
          const headers: Record<string, string> = { 'content-type': 'text/plain; charset=utf-8' };
          checked?.headers.forEach((value, name) => (headers[name] = value));
          res.writeHead(checked?.status ?? 400, headers);
          res.end(body);
        })();
        return;
      }
      for (const [name, value] of Object.entries(PAGE_HEADERS)) res.setHeader(name, value);
      res.setHeader('cache-control', 'no-store');
      vite.middlewares(req, res, () => {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`Nothing is served at ${target}.\n`);
      });
    },
    close: () => vite.close(),
  };
}
