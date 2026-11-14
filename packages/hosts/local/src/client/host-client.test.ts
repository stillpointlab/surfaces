// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHttpClient, UNREACHABLE } from './host-client';

import type { HostEvent } from './host-client';

afterEach(() => vi.unstubAllGlobals());

function answering(body: unknown, status = 200) {
  const fetch = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status })
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

class FakeSource {
  static last: FakeSource;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeSource.last = this;
  }
  send(data: string): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
  close(): void {
    this.closed = true;
  }
}

describe('createHttpClient', () => {
  it('reads the routes under its base', async () => {
    const fetch = answering({ name: 'served', id: 'abc' });
    const client = createHttpClient('http://127.0.0.1:5190');
    expect(await client.root()).toEqual({ name: 'served', id: 'abc' });
    answering({ nodes: [], truncated: false });
    await client.list();
    answering({});
    await client.status();
    expect(fetch.mock.calls[0][0]).toBe('http://127.0.0.1:5190/api/root');
  });

  it('gets a file by its encoded path, and answers a refusal as the server sent it', async () => {
    const fetch = answering({ ok: true, text: 't', version: 'v' });
    const client = createHttpClient();
    expect(await client.get('a b/#c?.md')).toEqual({ ok: true, text: 't', version: 'v' });
    expect(fetch.mock.calls[0][0]).toBe('/api/file?path=a%20b%2F%23c%3F.md');
    answering({ ok: false, code: 'HOST_FILE_NOT_FOUND', message: 'none' }, 404);
    expect(await client.get('x')).toEqual({
      ok: false,
      code: 'HOST_FILE_NOT_FOUND',
      message: 'none',
    });
  });

  it('answers HOST_UNREACHABLE when the server cannot be reached or answers nonsense', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    const client = createHttpClient();
    expect(await client.get('a')).toMatchObject({ ok: false, code: UNREACHABLE });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { status: 502 }))
    );
    expect(await client.put([])).toMatchObject({ ok: false, code: UNREACHABLE });
  });

  it('puts the changes as JSON', async () => {
    const fetch = answering({ ok: true, versions: { a: 'v2' } });
    const changes = [{ kind: 'write' as const, path: 'a', content: 'x', base: 'v1' }];
    expect(await createHttpClient().put(changes)).toEqual({ ok: true, versions: { a: 'v2' } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/files');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ changes });
  });

  it('reads git’s state, the changes and a file’s text at HEAD', async () => {
    let fetch = answering({ state: 'repository', branch: 'main' });
    const client = createHttpClient();
    expect(await client.git()).toEqual({ state: 'repository', branch: 'main' });
    expect(fetch.mock.calls[0][0]).toBe('/api/git');

    const changes = [{ path: 'b.md', status: 'moved', from: 'a.md' }];
    fetch = answering({ ok: true, changes });
    expect(await client.changes()).toEqual({ ok: true, changes });
    expect(fetch.mock.calls[0][0]).toBe('/api/changes');

    fetch = answering({ ok: true, text: 'at head' });
    expect(await client.base('a b/#c.md')).toEqual({ ok: true, text: 'at head' });
    expect(fetch.mock.calls[0][0]).toBe('/api/base?path=a%20b%2F%23c.md');

    answering({ ok: false, code: 'HOST_NOT_A_REPOSITORY', message: 'not' }, 409);
    expect(await client.changes()).toMatchObject({ ok: false, code: 'HOST_NOT_A_REPOSITORY' });
  });

  it('throws on a read the page cannot do without', async () => {
    answering({ ok: false, code: 'HOST_FORBIDDEN', message: 'Not from here.' }, 403);
    await expect(createHttpClient().list()).rejects.toThrow('Not from here.');
  });

  it('watches the event stream, says the list is stale after a reconnection, and stops', () => {
    vi.stubGlobal('EventSource', FakeSource);
    const client = createHttpClient();
    const events: HostEvent[] = [];
    const stop = client.watch((event) => events.push(event));
    const source = FakeSource.last;
    expect(source.url).toBe('/api/events');
    source.onopen?.();
    source.send('{"type":"listed"}');
    source.send('not json');
    source.send('{"type":"changed","paths":["a.md"]}');
    source.send('{"type":"status"}');
    source.onerror?.();
    source.onopen?.();
    expect(events).toEqual([
      { type: 'listed' },
      { type: 'changed', paths: ['a.md'] },
      { type: 'status' },
      { type: 'listed' },
    ]);
    stop();
    expect(source.closed).toBe(true);
  });

  it('names a revision in a URL once its file has changed, so an element loads it again', () => {
    vi.stubGlobal('EventSource', FakeSource);
    const client = createHttpClient();
    expect(client.urlFor('img/a b.png')).toBe('/api/raw?path=img%2Fa%20b.png');
    client.watch(() => undefined);
    FakeSource.last.send('{"type":"changed","paths":["img/a b.png"]}');
    expect(client.urlFor('img/a b.png')).toBe('/api/raw?path=img%2Fa%20b.png&rev=1');
    expect(client.urlFor('other.png')).toBe('/api/raw?path=other.png');
  });
});
