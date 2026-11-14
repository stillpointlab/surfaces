// The adapter from `node:http` to a host's `fetch`: a request in, a response out,
// and nothing else. The URL is built from the address the server listens on, never
// from the request's `Host`, which the host checks as a header.

import { Readable } from 'node:stream';

import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';

export function nodeListener(
  fetch: (request: Request) => Promise<Response>,
  base: () => string
): RequestListener {
  return (req, res) => {
    void answer(fetch, base(), req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  };
}

async function answer(
  fetch: (request: Request) => Promise<Response>,
  base: string,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const target = req.url ?? '';
  // Only a path: an absolute URL in the request line (`GET http://elsewhere/`) is refused.
  if (!target.startsWith('/')) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad request.\n');
    return;
  }
  const aborted = new AbortController();
  res.on('close', () => aborted.abort());

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const request = new Request(base + target, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
    signal: aborted.signal,
    // Node's fetch needs `duplex` for a streamed body.
    duplex: hasBody ? 'half' : undefined,
  });

  const response = await fetch(request);
  const out: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    out[name] = value;
  });
  res.writeHead(response.status, out);
  if (!response.body || req.method === 'HEAD') {
    res.end();
    return;
  }
  // Each chunk goes out as it comes, so server-sent events are not held back.
  res.flushHeaders();
  const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
  body.on('error', () => res.destroy());
  res.on('close', () => body.destroy());
  body.pipe(res);
}
