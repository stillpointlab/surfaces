// The `surfaces` command, through `runCli` (what the bin calls) and a real
// listener on port 0: the adapter from `node:http`, end to end.

import { readFileSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCli } from './cli';
import { eventReader, gitEnv, makeRepository, tempFolder, writeFiles } from './test-support';

import type { Serving } from './cli';
import type { Server } from 'node:http';

let folder: ReturnType<typeof tempFolder>;
let out: string[];
let err: string[];
let serving: Serving | null;
let blocker: Server | null;

beforeEach(() => {
  folder = tempFolder();
  writeFiles(folder.path, { 'site/a.md': 'a', 'file.txt': 'not a folder' });
  out = [];
  err = [];
  serving = null;
  blocker = null;
});
afterEach(async () => {
  await serving?.close();
  await new Promise<void>((done) => (blocker ? blocker.close(() => done()) : done()));
  folder.cleanup();
});

const io = (env?: NodeJS.ProcessEnv) => ({
  cwd: folder.path,
  out: (line: string) => out.push(line),
  err: (line: string) => err.push(line),
  env,
});

async function serve(args: string[], env?: NodeJS.ProcessEnv): Promise<Serving> {
  const result = await runCli(args, io(env));
  if (typeof result === 'number') throw new Error(`exit ${result}: ${err.join('\n')}`);
  serving = result;
  return result;
}

/** A raw request, so the test chooses the `Host` header. */
function raw(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      { method: options.method ?? 'GET', headers: options.headers },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    req.on('error', reject);
    req.end(options.body);
  });
}

describe('surfaces', () => {
  it('serves a folder relative to where it was typed, and prints the URL', async () => {
    const { url } = await serve(['site', '--port', '0']);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(out).toEqual([`Serving ${join(folder.path, 'site')} at ${url}`]);
    const list = await fetch(`${url}api/list`);
    expect(await list.json()).toEqual({
      nodes: [{ path: 'a.md', type: 'blob' }],
      truncated: false,
    });
    expect(await (await fetch(url)).text()).toContain('Serving <code>');
  });

  it('defaults to the folder it was typed in', async () => {
    await serve(['--port=0']);
    expect(out[0]).toContain(`Serving ${folder.path} at`);
  });

  it('writes through PUT with the Origin, and refuses one without it', async () => {
    const { url } = await serve(['site', '--port', '0']);
    const origin = url.slice(0, -1);
    const body = JSON.stringify({
      changes: [{ kind: 'write', path: 'a.md', content: 'over http' }],
    });
    const refused = await fetch(`${url}api/files`, { method: 'PUT', body });
    expect(refused.status).toBe(403);
    const written = await fetch(`${url}api/files`, { method: 'PUT', body, headers: { origin } });
    expect(written.status).toBe(200);
    expect(readFileSync(join(folder.path, 'site/a.md'), 'utf8')).toBe('over http');
  });

  it('refuses a Host that is not its own, and an absolute URL in the request line', async () => {
    const { url } = await serve(['site', '--port', '0']);
    const port = new URL(url).port;
    expect((await raw(`${url}api/list`, { headers: { host: 'evil.example' } })).status).toBe(403);
    expect(
      (await raw(`${url}api/list`, { headers: { host: `127.0.0.1:${Number(port) + 1}` } })).status
    ).toBe(403);
    expect((await raw(`${url}api/list`, { headers: { host: `localhost:${port}` } })).status).toBe(
      200
    );
    const absolute = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { host: '127.0.0.1', port, path: 'http://evil.example/api/list' },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }
      );
      req.on('error', reject);
      req.end();
    });
    expect(absolute).toBe(400);
  });

  it('streams events over HTTP', async () => {
    const { url } = await serve(['site', '--port', '0']);
    const response = await fetch(`${url}api/events`);
    const events = eventReader(response);
    await events.opened;
    writeFileSync(join(folder.path, 'site/a.md'), 'changed on disk');
    expect(await events.next()).toEqual({ type: 'changed', paths: ['a.md'] });
    await events.close();
  });

  it('refuses a path that is not a folder, and one that does not exist', async () => {
    expect(await runCli(['file.txt'], io())).toBe(1);
    expect(await runCli(['nowhere'], io())).toBe(1);
    expect(err).toEqual([
      `surfaces: ${join(folder.path, 'file.txt')} is not a folder.`,
      `surfaces: ${join(folder.path, 'nowhere')} does not exist.`,
    ]);
  });

  it('refuses a port in use, with a plain message', async () => {
    blocker = createServer();
    await new Promise<void>((done) => blocker!.listen(0, '127.0.0.1', () => done()));
    const address = blocker.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    expect(await runCli(['site', '--port', String(port)], io())).toBe(1);
    expect(err).toEqual([`surfaces: port ${port} is in use. Choose another with --port <n>.`]);
  });

  it('refuses a port that is not a number, and an unknown option', async () => {
    expect(await runCli(['--port', 'eighty'], io())).toBe(2);
    expect(await runCli(['--port', '70000'], io())).toBe(2);
    expect(await runCli(['--verbose'], io())).toBe(2);
    expect(err.filter((line) => line.startsWith('Usage'))).toHaveLength(3);
  });

  it('says so when git is not found and the folder looks like a repository', async () => {
    const env = gitEnv(folder.path);
    makeRepository(join(folder.path, 'repo'), env, { 'a.md': 'a' });
    await serve(['repo', '--port', '0'], { ...env, PATH: join(folder.path, 'no-bin') });
    expect(err).toEqual(['surfaces: git was not found; listing every file']);
  });

  it('says nothing about git for a folder that is not a repository, with git off the PATH', async () => {
    await serve(['site', '--port', '0'], { ...process.env, PATH: join(folder.path, 'no-bin') });
    expect(err).toEqual([]);
  });
});
