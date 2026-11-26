// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHttpClient, TOKEN_REQUIRED, UNREACHABLE } from './host-client';

import type { WatchedEvent } from './host-client';

afterEach(() => vi.unstubAllGlobals());

function answering(body: unknown, status = 200) {
  const fetch = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status })
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

class FakeSource {
  static readonly CLOSED = 2;
  static last: FakeSource;
  static all: FakeSource[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;
  readyState = 0;
  constructor(readonly url: string) {
    FakeSource.last = this;
    FakeSource.all.push(this);
  }
  send(data: string): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
  close(): void {
    this.closed = true;
    this.readyState = FakeSource.CLOSED;
  }
  /**
   * The browser gives the stream up, as it does on any answer but its events (a
   * 503, a 403): closed, and one `error`, with no reconnection of its own.
   */
  giveUp(): void {
    this.readyState = FakeSource.CLOSED;
    this.onerror?.();
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

  it('says so when a write is one the person agreed cannot be undone', async () => {
    const fetch = answering({ ok: true, versions: {} });
    const changes = [{ kind: 'delete' as const, path: 'a.png' }];
    await createHttpClient().put(changes, { unjournaled: true });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      changes,
      unjournaled: true,
    });
  });

  it('reads the journal, and posts undo and redo', async () => {
    let fetch = answering({ ok: true, undo: 'Delete a.md', redo: null });
    const client = createHttpClient();
    expect(await client.journal()).toEqual({ ok: true, undo: 'Delete a.md', redo: null });
    expect(fetch.mock.calls[0][0]).toBe('/api/journal');

    const moved = { ok: true, label: 'Delete a.md', moved: [], deleted: [] };
    fetch = answering(moved);
    expect(await client.undo()).toEqual(moved);
    expect(fetch.mock.calls[0][0]).toBe('/api/undo');
    expect(fetch.mock.calls[0][1]?.method).toBe('POST');

    fetch = answering({ ok: false, code: 'HOST_NOTHING_TO_REDO', message: 'none' }, 409);
    expect(await client.redo()).toMatchObject({ ok: false, code: 'HOST_NOTHING_TO_REDO' });
    expect(fetch.mock.calls[0][0]).toBe('/api/redo');
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

  it('posts a commit as JSON, and answers git’s refusal as the server sent it', async () => {
    let fetch = answering({ ok: true, commit: 'c'.repeat(40), short: 'ccccccc', branch: 'main' });
    const request = { paths: ['b.md', 'a.md'], message: 'Move a\n\nbody', branch: 'topic' };
    expect(await createHttpClient().commit(request)).toEqual({
      ok: true,
      commit: 'c'.repeat(40),
      short: 'ccccccc',
      branch: 'main',
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/commit');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(request);

    fetch = answering({ ok: false, code: 'HOST_GIT_FAILED', message: 'hook said no' }, 500);
    expect(await createHttpClient().commit(request)).toEqual({
      ok: false,
      code: 'HOST_GIT_FAILED',
      message: 'hook said no',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reads the apps, and throws when it cannot', async () => {
    const instance = { app: 'inventory', manifestPath: 'inv/inventory.yaml', folder: 'inv' };
    const fetch = answering({ apps: [instance] });
    expect(await createHttpClient().apps()).toEqual([instance]);
    expect(fetch.mock.calls[0][0]).toBe('/api/apps');
    answering({ ok: false, code: 'HOST_ERROR', message: 'broken' }, 500);
    await expect(createHttpClient().apps()).rejects.toThrow('broken');
  });

  it('asks for an app’s page, a view and an op, and sets its lock', async () => {
    const client = createHttpClient();
    let fetch = answering({ ok: true, view: null, state: null, title: 't', revision: 'r' });
    expect(await client.appPage('a b/inventory.yaml', '/room/x%20y', 'q=1')).toMatchObject({
      ok: true,
      title: 't',
    });
    const page = new URL(fetch.mock.calls[0][0], 'http://h');
    expect(page.pathname).toBe('/api/apps/page');
    expect(Object.fromEntries(page.searchParams)).toEqual({
      manifestPath: 'a b/inventory.yaml',
      path: '/room/x%20y',
      query: 'q=1',
    });

    fetch = answering({ ok: true, state: {}, revision: 'r' });
    await client.appProject('inv/inventory.yaml', { type: 'zone', slug: 'a' });
    const project = new URL(fetch.mock.calls[0][0], 'http://h');
    expect(project.pathname).toBe('/api/apps/project');
    expect(JSON.parse(project.searchParams.get('view')!)).toEqual({ type: 'zone', slug: 'a' });

    fetch = answering({ ok: true, reply: {}, revision: 'r' });
    await client.appOp('inv/inventory.yaml', { type: 'add-zone', title: 'A' }, { type: 'space' });
    expect(fetch.mock.calls[0][0]).toBe('/api/apps/op');
    expect(fetch.mock.calls[0][1]?.method).toBe('POST');
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      manifestPath: 'inv/inventory.yaml',
      op: { type: 'add-zone', title: 'A' },
      view: { type: 'space' },
    });

    fetch = answering({ ok: false, code: 'HOST_APP_NOT_FOUND', message: 'none' }, 404);
    expect(await client.setAppLock('inv/inventory.yaml', false)).toMatchObject({
      ok: false,
      code: 'HOST_APP_NOT_FOUND',
    });
    expect(fetch.mock.calls[0][0]).toBe('/api/apps/lock');
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      manifestPath: 'inv/inventory.yaml',
      locked: false,
    });
  });

  it('throws on a read the page cannot do without', async () => {
    answering({ ok: false, code: 'HOST_FORBIDDEN', message: 'Not from here.' }, 403);
    await expect(createHttpClient().list()).rejects.toThrow('Not from here.');
  });

  it('watches the event stream, says the list and the journal are stale after a reconnection, and stops', () => {
    vi.stubGlobal('EventSource', FakeSource);
    const client = createHttpClient();
    const events: WatchedEvent[] = [];
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
      // The reconnection: the list, the journal (a restarted server has no steps),
      // and the client's own word for what no event names.
      { type: 'listed' },
      { type: 'journal' },
      { type: 'reconnected' },
    ]);
    stop();
    expect(source.closed).toBe(true);
  });

  it('gives the stream back while the tab is hidden, and says what went unheard when shown', () => {
    vi.stubGlobal('EventSource', FakeSource);
    let hidden = false;
    const spy = vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const show = (to: boolean) => {
      hidden = !to;
      document.dispatchEvent(new Event('visibilitychange'));
    };
    const client = createHttpClient();
    const events: WatchedEvent[] = [];
    const stop = client.watch((event) => events.push(event));
    const first = FakeSource.last;
    first.onopen?.();
    show(false);
    expect(first.closed).toBe(true);
    expect(FakeSource.last).toBe(first);
    show(true);
    const second = FakeSource.last;
    expect(second).not.toBe(first);
    expect(events).toEqual([]);
    second.onopen?.();
    expect(events).toEqual([{ type: 'listed' }, { type: 'journal' }, { type: 'reconnected' }]);
    // Shown twice opens one stream.
    show(true);
    expect(FakeSource.last).toBe(second);
    stop();
    expect(second.closed).toBe(true);
    // Stopped, a later show opens nothing.
    show(false);
    show(true);
    expect(FakeSource.last).toBe(second);
    spy.mockRestore();
  });

  it('a page loaded in a hidden tab opens its stream when shown, and reads again then', () => {
    vi.stubGlobal('EventSource', FakeSource);
    let hidden = true;
    const spy = vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const before = FakeSource.last;
    const events: WatchedEvent[] = [];
    const stop = createHttpClient().watch((event) => events.push(event));
    expect(FakeSource.last).toBe(before);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(FakeSource.last).not.toBe(before);
    FakeSource.last.onopen?.();
    expect(events).toEqual([{ type: 'listed' }, { type: 'journal' }, { type: 'reconnected' }]);
    stop();
    spy.mockRestore();
  });

  it('gives a file’s address by its path, each segment encoded, its neighbours beside it', () => {
    const client = createHttpClient();
    expect(client.urlFor('deep/er/nested.txt')).toBe('/api/raw/deep/er/nested.txt');
    expect(client.urlFor('with space/a#1?%.png')).toBe('/api/raw/with%20space/a%231%3F%25.png');
    expect(createHttpClient('http://127.0.0.1:5190').urlFor('a.png')).toBe(
      'http://127.0.0.1:5190/api/raw/a.png'
    );
    const playlist = new URL(client.urlFor('hls/a b/list.m3u8'), 'http://127.0.0.1:5190');
    expect(new URL('seg%200.m4s', playlist).pathname).toBe('/api/raw/hls/a%20b/seg%200.m4s');
  });

  it('names a revision in a URL once its file has changed, so an element loads it again', () => {
    vi.stubGlobal('EventSource', FakeSource);
    const client = createHttpClient();
    expect(client.urlFor('img/a b.png')).toBe('/api/raw/img/a%20b.png');
    client.watch(() => undefined);
    FakeSource.last.send('{"type":"changed","paths":["img/a b.png"]}');
    expect(client.urlFor('img/a b.png')).toBe('/api/raw/img/a%20b.png?rev=1');
    expect(client.urlFor('other.png')).toBe('/api/raw/other.png');
    // A reconnection counts as a change to every path: one may have gone unheard.
    FakeSource.last.onerror?.();
    FakeSource.last.onopen?.();
    expect(client.urlFor('img/a b.png')).toBe('/api/raw/img/a%20b.png?rev=2');
    expect(client.urlFor('other.png')).toBe('/api/raw/other.png?rev=1');
  });

  describe('a page left open across a restart', () => {
    const refused = { ok: false, code: TOKEN_REQUIRED, message: 'Open the address…' };

    it('says restarted once when a call is refused for the token, and closes the stream for good', async () => {
      vi.stubGlobal('EventSource', FakeSource);
      let hidden = false;
      const spy = vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
      // Its own base, so its streams are told from other tests' clients'.
      const client = createHttpClient('http://restarted');
      const streams = () =>
        FakeSource.all.filter((made) => made.url.startsWith('http://restarted'));
      const events: WatchedEvent[] = [];
      const stop = client.watch((event) => events.push(event));
      const [source] = streams();
      answering(refused, 403);
      // The refusal is still the call's answer, as the server sent it.
      expect(await client.get('a.md')).toEqual(refused);
      await expect(client.list()).rejects.toThrow('Open the address…');
      expect(await client.commit({ paths: ['a.md'], message: 'm' })).toEqual(refused);
      expect(events).toEqual([{ type: 'restarted' }]);
      expect(source.closed).toBe(true);
      // Hidden and shown again, the tab opens no stream: it would be refused.
      hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      // A watch begun after it opens none either.
      client.watch(() => undefined)();
      expect(streams()).toEqual([source]);
      stop();
      spy.mockRestore();
    });

    it('takes another 403 as it was: no restart', async () => {
      vi.stubGlobal('EventSource', FakeSource);
      const client = createHttpClient();
      const events: WatchedEvent[] = [];
      client.watch((event) => events.push(event));
      answering({ ok: false, code: 'HOST_FORBIDDEN', message: 'Not from here.' }, 403);
      await client.get('a.md');
      expect(events).toEqual([]);
      expect(FakeSource.last.closed).toBe(false);
    });

    it('asks GET /api/root when the stream fails, and says restarted when it is refused so', async () => {
      vi.stubGlobal('EventSource', FakeSource);
      const client = createHttpClient();
      const events: WatchedEvent[] = [];
      client.watch((event) => events.push(event));
      const source = FakeSource.last;
      source.onopen?.();
      const fetch = answering(refused, 403);
      source.onerror?.();
      await vi.waitFor(() => expect(events).toEqual([{ type: 'restarted' }]));
      expect(fetch.mock.calls.map((call) => call[0])).toEqual(['/api/root']);
      expect(source.closed).toBe(true);
      // Once said, a later failure asks nothing more.
      source.onerror?.();
      await new Promise((done) => setTimeout(done, 0));
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(events).toEqual([{ type: 'restarted' }]);
    });

    it('keeps the stream when the server is only away, or answers', async () => {
      vi.stubGlobal('EventSource', FakeSource);
      const client = createHttpClient();
      const events: WatchedEvent[] = [];
      client.watch((event) => events.push(event));
      const source = FakeSource.last;
      source.onopen?.();
      const away = vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      });
      vi.stubGlobal('fetch', away);
      source.onerror?.();
      await vi.waitFor(() => expect(away).toHaveBeenCalledTimes(1));
      await new Promise((done) => setTimeout(done, 0));
      const back = answering({ name: 'served', id: 'abc' });
      source.onerror?.();
      await vi.waitFor(() => expect(back).toHaveBeenCalledTimes(1));
      await new Promise((done) => setTimeout(done, 0));
      expect(source.closed).toBe(false);
      source.onopen?.();
      expect(events).toEqual([{ type: 'listed' }, { type: 'journal' }, { type: 'reconnected' }]);
    });

    describe('a stream the browser gave up on', () => {
      const starting = () =>
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => new Response('Starting.\n', { status: 503 }))
        );

      afterEach(() => vi.useRealTimers());

      it('is opened again each second while the server is starting, until the new run refuses it', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('EventSource', FakeSource);
        const client = createHttpClient('http://starting');
        const streams = () =>
          FakeSource.all.filter((made) => made.url.startsWith('http://starting'));
        const events: WatchedEvent[] = [];
        client.watch((event) => events.push(event));
        streams()[0].onopen?.();
        // The server is on its way up: the stream and the check both meet its 503.
        starting();
        streams()[0].giveUp();
        await vi.advanceTimersByTimeAsync(999);
        expect(streams()).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(streams()).toHaveLength(2);
        streams()[1].giveUp();
        await vi.advanceTimersByTimeAsync(1000);
        expect(streams()).toHaveLength(3);
        expect(events).toEqual([]);
        // Up, and a new run: the stream is refused for the token, and so is the check.
        answering(refused, 403);
        streams()[2].giveUp();
        await vi.advanceTimersByTimeAsync(0);
        expect(events).toEqual([{ type: 'restarted' }]);
        await vi.advanceTimersByTimeAsync(5000);
        expect(streams()).toHaveLength(3);
      });

      it('is opened again, and says what went unheard, when the server answers for this run', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('EventSource', FakeSource);
        const client = createHttpClient();
        const events: WatchedEvent[] = [];
        client.watch((event) => events.push(event));
        const first = FakeSource.last;
        first.onopen?.();
        starting();
        first.giveUp();
        answering({ name: 'served', id: 'abc' });
        await vi.advanceTimersByTimeAsync(1000);
        const second = FakeSource.last;
        expect(second).not.toBe(first);
        second.onopen?.();
        expect(events).toEqual([{ type: 'listed' }, { type: 'journal' }, { type: 'reconnected' }]);
      });

      it('is not opened again once the watch stops, or while the tab is hidden', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('EventSource', FakeSource);
        let hidden = false;
        const spy = vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
        const client = createHttpClient('http://stopping');
        const streams = () =>
          FakeSource.all.filter((made) => made.url.startsWith('http://stopping'));
        const stop = client.watch(() => undefined);
        starting();
        streams()[0].giveUp();
        hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(2000);
        expect(streams()).toHaveLength(1);
        // Shown again, it opens one stream, at once.
        hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
        expect(streams()).toHaveLength(2);
        streams()[1].giveUp();
        stop();
        await vi.advanceTimersByTimeAsync(2000);
        expect(streams()).toHaveLength(2);
        spy.mockRestore();
      });
    });
  });

  it('probes a file on the raw route, lets its bytes go, and answers a refusal as sent', async () => {
    let cancelled = false;
    const bytes = new ReadableStream<Uint8Array>({ cancel: () => void (cancelled = true) });
    const fetch = vi.fn(async (_url: string) => new Response(bytes, { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const client = createHttpClient();
    expect(await client.probe('img/a b.png')).toEqual({ ok: true });
    expect(fetch.mock.calls[0][0]).toBe('/api/raw/img/a%20b.png');
    expect(cancelled).toBe(true);
    answering({ ok: false, code: 'HOST_FILE_NOT_FOUND', message: 'none' }, 404);
    expect(await client.probe('gone.png')).toEqual({
      ok: false,
      code: 'HOST_FILE_NOT_FOUND',
      message: 'none',
    });
  });
});
