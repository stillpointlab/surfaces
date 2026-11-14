// The one function that runs `git`: an argument list, never a shell string, in a
// given folder, with a timeout. Reads pass `GIT_OPTIONAL_LOCKS=0`, so a status or
// a listing never takes the index lock from a person's own git.
//
// The listing uses it, and so does the rest of this folder (`repository.ts`), which
// is the only other code that runs git.
//
// A command that may run a hook or sign (`commit`, `switch`) is run `isolate`d,
// so nothing it starts can wait on a person forever:
// - in a session of its own (`detached`, which is `setsid`), so it has no
//   controlling terminal: a prompt that opens `/dev/tty` (a passphrase) fails at
//   once instead of waiting for an answer nobody can type;
// - with standard input closed once its input is written (git gives hooks none);
// - on the timeout, its whole process group is sent `SIGTERM` (git removes its
//   `index.lock` on the way out, and a hook's own children go too), then
//   `SIGKILL` if anything is still there a moment later. The answer waits for
//   the group's output to close, so nothing it started outlives it unseen.

import { execFile, spawn } from 'node:child_process';

import { GIT_TIMEOUT_MS } from '../limits';

export type GitRun =
  | { ok: true; stdout: Buffer }
  | {
      ok: false;
      /** `git` could not be run at all (not on the `PATH`). */
      missing: boolean;
      exitCode: number | null;
      stderr: string;
      /** What git wrote to standard output (an isolated run's; `''` otherwise). */
      stdout?: string;
      /** It ran past its timeout and was stopped. */
      timedOut?: boolean;
    };

export interface GitOptions {
  /** The folder to run in. */
  cwd: string;
  /** The environment; the process's own by default. Tests take `git` off the `PATH` here. */
  env?: NodeJS.ProcessEnv;
  /** A read: sets `GIT_OPTIONAL_LOCKS=0`. */
  read?: boolean;
  /** What git reads on its standard input (`update-index --index-info`). */
  input?: string | Buffer;
  timeoutMs?: number;
  /** In a session of its own, killed as a group on the timeout (above). */
  isolate?: boolean;
}

/** How long a group sent `SIGTERM` has before it is sent `SIGKILL`. */
const KILL_GRACE_MS = 2000;

export function runGit(args: readonly string[], options: GitOptions): Promise<GitRun> {
  const env = { ...(options.env ?? process.env) };
  if (options.read) env.GIT_OPTIONAL_LOCKS = '0';
  if (options.isolate) return runIsolated(args, options, env);
  return new Promise((resolve) => {
    const child = execFile(
      'git',
      args,
      {
        cwd: options.cwd,
        env,
        encoding: 'buffer',
        maxBuffer: 256 * 1024 * 1024,
        timeout: options.timeoutMs ?? GIT_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ ok: true, stdout });
          return;
        }
        const failure = error as NodeJS.ErrnoException & { code?: string | number };
        resolve({
          ok: false,
          missing: failure.code === 'ENOENT',
          exitCode: typeof failure.code === 'number' ? failure.code : null,
          stderr: stderr?.toString('utf8') ?? failure.message,
        });
      }
    );
    if (options.input !== undefined) {
      // A git that exits before reading it all (a bad argument) closes the pipe.
      child.stdin?.on('error', () => undefined);
      child.stdin?.end(options.input);
    }
  });
}

/** What an isolated run keeps of its output: plenty for a hook's report, bounded. */
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

function runIsolated(
  args: readonly string[],
  options: GitOptions,
  env: NodeJS.ProcessEnv
): Promise<GitRun> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd: options.cwd,
      env,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let kept = 0;
    const keep = (into: Buffer[]) => (chunk: Buffer) => {
      if (kept >= MAX_OUTPUT_BYTES) return;
      into.push(chunk);
      kept += chunk.length;
    };
    child.stdout.on('data', keep(out));
    child.stderr.on('data', keep(err));

    let timedOut = false;
    let killer: NodeJS.Timeout | undefined;
    const signal = (name: NodeJS.Signals) => {
      try {
        if (process.platform === 'win32' || child.pid === undefined) child.kill(name);
        else process.kill(-child.pid, name);
      } catch {
        // already gone
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      signal('SIGTERM');
      killer = setTimeout(() => signal('SIGKILL'), KILL_GRACE_MS);
    }, options.timeoutMs ?? GIT_TIMEOUT_MS);

    let spawnError: NodeJS.ErrnoException | null = null;
    child.on('error', (error: NodeJS.ErrnoException) => {
      spawnError = error;
      // Never started (not on the `PATH`): there is no process to wait for.
      if (child.pid === undefined) {
        clearTimeout(timer);
        resolve({
          ok: false,
          missing: error.code === 'ENOENT',
          exitCode: null,
          stderr: error.message,
          stdout: '',
          timedOut: false,
        });
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      clearTimeout(killer);
      const stdout = Buffer.concat(out);
      if (code === 0 && !timedOut && spawnError === null) {
        resolve({ ok: true, stdout });
        return;
      }
      const missing = (spawnError as NodeJS.ErrnoException | null)?.code === 'ENOENT';
      resolve({
        ok: false,
        missing,
        exitCode: code,
        stderr: Buffer.concat(err).toString('utf8') || (missing ? 'git was not found.' : ''),
        stdout: stdout.toString('utf8'),
        timedOut,
      });
    });

    child.stdin.on('error', () => undefined);
    child.stdin.end(options.input ?? '');
  });
}
