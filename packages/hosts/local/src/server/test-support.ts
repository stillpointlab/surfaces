// Shared by the server's tests: temporary folders and repositories that need
// nothing from the machine's own git configuration, and waiting on an event
// stream with a timeout instead of a sleep.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { HostEvent } from '@stillpointlab/common-format/host';

/** A temporary folder (its real path), removed by `cleanup`. */
export function tempFolder(): { path: string; cleanup(): void } {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'surfaces-host-')));
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

/** Write files under `root`, making folders as needed. */
export function writeFiles(root: string, files: Record<string, string | Uint8Array>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

/**
 * An environment for `git` that reads no global or system configuration (so a
 * person's excludes or hooks cannot change a result) and names its own author.
 */
export function gitEnv(home: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(home, 'no-global-gitconfig'),
    GIT_AUTHOR_NAME: 'Surfaces Test',
    GIT_AUTHOR_EMAIL: 'test@surfaces.invalid',
    GIT_COMMITTER_NAME: 'Surfaces Test',
    GIT_COMMITTER_EMAIL: 'test@surfaces.invalid',
  };
}

/** Run git in `cwd` with `env`, with the branch name and signing set on the command line. */
export function git(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...args],
    { cwd, env, encoding: 'utf8' }
  );
}

/** A repository at `path` with `files` committed. */
export function makeRepository(
  path: string,
  env: NodeJS.ProcessEnv,
  files: Record<string, string>
): void {
  mkdirSync(path, { recursive: true });
  git(path, env, 'init', '-q');
  writeFiles(path, files);
  git(path, env, 'add', '-A');
  git(path, env, 'commit', '-q', '-m', 'init');
}

/** Read server-sent events from a response, one parsed `data` line at a time. */
export function eventReader(response: Response): {
  /** The next event that matches, or a rejection after `timeoutMs`. */
  next(match?: (event: HostEvent) => boolean, timeoutMs?: number): Promise<HostEvent>;
  /** Resolves once the stream's first bytes arrive (the host has the listener). */
  opened: Promise<void>;
  close(): Promise<void>;
} {
  if (!response.body) throw new Error('no body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const queue: HostEvent[] = [];
  const waiters: Array<() => void> = [];
  let buffer = '';
  let markOpened: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => (markOpened = resolve));
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) return;
      markOpened();
      buffer += decoder.decode(value, { stream: true });
      let cut: number;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        for (const line of block.split('\n')) {
          if (line.startsWith('data: ')) queue.push(JSON.parse(line.slice(6)) as HostEvent);
        }
      }
      for (const wake of waiters.splice(0)) wake();
    }
  })();

  async function next(match: (event: HostEvent) => boolean = () => true, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = queue.findIndex(match);
      if (index >= 0) return queue.splice(index, 1)[0];
      const left = deadline - Date.now();
      if (left <= 0)
        throw new Error(`no matching event within ${timeoutMs} ms; saw ${JSON.stringify(queue)}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  return { next, opened, close: () => reader.cancel() };
}
