// `surfaces [path] [--port <n>]`: serve a folder on 127.0.0.1. The `bin` calls
// this; tests call it with their own output and port 0. The page is the built
// client in `dist/client`; development mode (`npm run serve`, through `dev.ts`)
// serves it from Vite instead, loaded only then.

import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

import { CLIENT_DIST } from './client-build';
import { createHost } from './host';
import { nodeListener } from './node-http';
import { createStaticPage } from './page';

import type { LocalHost } from './host';
import type { RequestListener, Server } from 'node:http';

export const DEFAULT_PORT = 5190;

const USAGE = 'Usage: surfaces [path] [--port <n>]';

export interface CliIo {
  /** Where a relative path is resolved: the folder the command was typed in. */
  cwd: string;
  out(line: string): void;
  err(line: string): void;
  env?: NodeJS.ProcessEnv;
}

export interface CliOptions {
  /**
   * Serve the page from its sources through Vite, as middleware in this process
   * (`npm run serve`). Vite is imported only then: the `surfaces` command does not
   * need it installed.
   */
  dev?: boolean;
  /** The built page to serve when not in development mode; `dist/client` by default. */
  clientDir?: string;
}

export interface Serving {
  url: string;
  host: LocalHost;
  server: Server;
  close(): Promise<void>;
}

/** Parse, check and start; a number is the exit code of a refusal. */
export async function runCli(
  argv: readonly string[],
  io: CliIo,
  options: CliOptions = {}
): Promise<Serving | number> {
  let path: string | undefined;
  let port = DEFAULT_PORT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      io.out(USAGE);
      return 0;
    }
    if (arg === '--port' || arg.startsWith('--port=')) {
      const value = arg === '--port' ? argv[++i] : arg.slice('--port='.length);
      if (value === undefined || !/^\d+$/.test(value) || Number(value) > 65535) {
        io.err(
          `surfaces: --port takes a number from 0 to 65535, not ${JSON.stringify(value ?? '')}.`
        );
        io.err(USAGE);
        return 2;
      }
      port = Number(value);
    } else if (arg.startsWith('-') && arg !== '-') {
      io.err(`surfaces: unknown option ${arg}.`);
      io.err(USAGE);
      return 2;
    } else if (path === undefined) {
      path = arg;
    } else {
      io.err(`surfaces: one folder at a time; ${JSON.stringify(arg)} is a second.`);
      io.err(USAGE);
      return 2;
    }
  }

  const root = resolve(io.cwd, path ?? '.');
  try {
    if (!(await stat(root)).isDirectory()) {
      io.err(`surfaces: ${root} is not a folder.`);
      return 1;
    }
  } catch {
    io.err(`surfaces: ${root} does not exist.`);
    return 1;
  }

  let base = '';
  // Until the host and the page are ready, every request is told so.
  let handle: RequestListener = (_req, res) => {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Starting.\n');
  };
  const server = createServer({ requireHostHeader: true }, (req, res) => handle(req, res));

  const listening = await new Promise<true | NodeJS.ErrnoException>((done) => {
    server.once('error', (error: NodeJS.ErrnoException) => done(error));
    server.listen(port, '127.0.0.1', () => done(true));
  });
  if (listening !== true) {
    if (listening.code === 'EADDRINUSE') {
      io.err(`surfaces: port ${port} is in use. Choose another with --port <n>.`);
    } else {
      io.err(`surfaces: could not listen on 127.0.0.1:${port} (${listening.message}).`);
    }
    return 1;
  }

  const address = server.address();
  const actual = typeof address === 'object' && address ? address.port : port;
  base = `http://127.0.0.1:${actual}`;
  const host = createHost({
    root,
    origin: base,
    env: io.env,
    warn: (message) => io.err(`surfaces: ${message}`),
    page: options.dev ? undefined : createStaticPage(options.clientDir ?? CLIENT_DIST),
  });
  const api = nodeListener(
    (request) => host.fetch(request),
    () => base
  );
  let closePage = async (): Promise<void> => undefined;
  if (options.dev) {
    try {
      const { createDevPage } = await import('./dev-page');
      const page = await createDevPage({ server, origin: base, api });
      handle = page.handle;
      closePage = page.close;
    } catch (error) {
      io.err(`surfaces: development mode could not start (${String(error)}).`);
      await host.close();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      return 1;
    }
  } else {
    handle = api;
  }
  const start = await host.ready();
  if (!start.gitFound && start.looksLikeRepository) {
    io.err('surfaces: git was not found; listing every file');
  }
  const url = `${base}/`;
  io.out(`Serving ${host.port.root} at ${url}`);

  return {
    url,
    host,
    server,
    async close() {
      await closePage();
      await host.close();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}
