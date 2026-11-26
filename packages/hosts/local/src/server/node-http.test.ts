// The adapter from `node:http`, under a real listener on port 0 and a client that
// keeps its connection open: what the client sees when a body ends short of the
// length its headers declared.

import { truncateSync } from 'node:fs';
import { Agent, createServer, request as httpRequest } from 'node:http';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHost } from './host';
import { nodeListener } from './node-http';
import { tempFolder, writeFiles } from './test-support';

import type { LocalHost } from './host';
import type { Server } from 'node:http';

let folder: ReturnType<typeof tempFolder>;
let server: Server | null;
let host: LocalHost | null;
let agent: Agent;

beforeEach(() => {
  folder = tempFolder();
  server = null;
  host = null;
  agent = new Agent({ keepAlive: true });
});
afterEach(async () => {
  agent.destroy();
  await host?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((done) => server!.close(() => done()));
  }
  folder.cleanup();
});

/** Listen on port 0 with `fetch` behind the adapter; the server's base URL. */
async function listen(fetch: (request: Request, base: string) => Promise<Response>) {
  let base = '';
  const listening = createServer(
    nodeListener(
      (request) => fetch(request, base),
      () => base
    )
  );
  // Long enough that a client left waiting on an open connection is told nothing
  // while the test watches.
  listening.keepAliveTimeout = 30_000;
  server = listening;
  await new Promise<void>((done) => listening.listen(0, '127.0.0.1', () => done()));
  const address = listening.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  return base;
}

type Outcome =
  | { kind: 'complete'; status: number; length: string | undefined; received: number }
  | { kind: 'failed'; status: number; length: string | undefined; received: number }
  | { kind: 'waiting'; status: number | null; received: number };

/**
 * A request over a kept-alive connection, and how it stands after `withinMs`:
 * the whole body, a failure the client saw, or still waiting for bytes.
 */
function outcome(
  url: string,
  options: { method?: string; headers?: Record<string, string> } = {},
  withinMs = 1000
): Promise<Outcome> {
  return new Promise((resolve) => {
    let status: number | null = null;
    let received = 0;
    const timer = setTimeout(() => resolve({ kind: 'waiting', status, received }), withinMs);
    const done = (result: Outcome) => {
      clearTimeout(timer);
      resolve(result);
    };
    const req = httpRequest(
      url,
      { method: options.method ?? 'GET', headers: options.headers, agent },
      (res) => {
        status = res.statusCode ?? 0;
        const length = res.headers['content-length'];
        res.on('data', (chunk: Buffer) => (received += chunk.byteLength));
        res.on('end', () => done({ kind: 'complete', status: status!, length, received }));
        res.on('error', () => done({ kind: 'failed', status: status!, length, received }));
      }
    );
    req.on('error', () =>
      done({ kind: 'failed', status: status ?? 0, length: undefined, received })
    );
    req.end();
  });
}

describe('a body that ends short of its Content-Length', () => {
  it('fails at once, where the client would otherwise wait for the rest', async () => {
    const base = await listen(
      async () =>
        new Response(new Uint8Array(50), {
          headers: { 'content-type': 'application/octet-stream', 'content-length': '100' },
        })
    );
    expect(await outcome(`${base}/short`)).toEqual({
      kind: 'failed',
      status: 200,
      length: '100',
      received: 50,
    });
  });

  it('is sent whole when it is the length it declares, and a HEAD sends no body', async () => {
    const base = await listen(
      async () =>
        new Response(new Uint8Array(100), {
          headers: { 'content-type': 'application/octet-stream', 'content-length': '100' },
        })
    );
    // Twice on the one connection: the first left it fit to use again.
    for (let i = 0; i < 2; i += 1) {
      expect(await outcome(`${base}/whole`)).toEqual({
        kind: 'complete',
        status: 200,
        length: '100',
        received: 100,
      });
    }
    expect(await outcome(`${base}/whole`, { method: 'HEAD' })).toEqual({
      kind: 'complete',
      status: 200,
      length: '100',
      received: 0,
    });
  });

  it('a body with no length (the event stream) is sent as it comes and not cut', async () => {
    const encoder = new TextEncoder();
    const base = await listen(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('retry: 1000\n\n'));
          setTimeout(() => {
            controller.enqueue(encoder.encode('data: {}\n\n'));
            controller.close();
          }, 50);
        },
      });
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
    });
    expect(await outcome(`${base}/events`)).toEqual({
      kind: 'complete',
      status: 200,
      length: undefined,
      received: 23,
    });
  });
});

describe('a raw file that shrinks after its size is read', () => {
  const SIZE = 4 * 1024 * 1024;

  /** A host over the folder whose file is cut to 10 bytes once the host has answered. */
  async function shrinking() {
    const root = join(folder.path, 'served');
    writeFiles(root, { 'big.bin': new Uint8Array(SIZE) });
    return listen(async (request, base) => {
      host ??= createHost({ root, origin: base, token: null, warn: () => undefined });
      const response = await host.fetch(request);
      truncateSync(join(root, 'big.bin'), 10);
      return response;
    });
  }

  it('fails the whole file at once', async () => {
    const base = await shrinking();
    const seen = await outcome(`${base}/api/raw/big.bin`);
    expect(seen).toMatchObject({ kind: 'failed', status: 200, length: String(SIZE) });
    expect(seen.received).toBeLessThan(SIZE);
  });

  it('fails a range at once', async () => {
    const base = await shrinking();
    const seen = await outcome(`${base}/api/raw/big.bin`, {
      headers: { range: `bytes=5-${SIZE - 2}` },
    });
    expect(seen).toMatchObject({ kind: 'failed', status: 206, length: String(SIZE - 6) });
    expect(seen.received).toBeLessThan(SIZE - 6);
  });
});
