// The one function that runs `git`: an argument list, never a shell string, in a
// given folder, with a timeout. Reads pass `GIT_OPTIONAL_LOCKS=0`, so a status or
// a listing never takes the index lock from a person's own git.
//
// The listing uses it, and so does the rest of this folder (`repository.ts`), which
// is the only other code that runs git.

import { execFile } from 'node:child_process';

import { GIT_TIMEOUT_MS } from '../limits';

export type GitRun =
  | { ok: true; stdout: Buffer }
  /** `missing`: `git` could not be run at all (not on the `PATH`). */
  | { ok: false; missing: boolean; exitCode: number | null; stderr: string };

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
}

export function runGit(args: readonly string[], options: GitOptions): Promise<GitRun> {
  const env = { ...(options.env ?? process.env) };
  if (options.read) env.GIT_OPTIONAL_LOCKS = '0';
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
