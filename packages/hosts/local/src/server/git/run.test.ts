// `runGit` itself, for what only its isolated run does: answering when git exits,
// even while something git started still holds its output open.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { gitEnv, tempFolder } from '../test-support';

import { runGit } from './run';

let folder: ReturnType<typeof tempFolder>;
let env: NodeJS.ProcessEnv;
let pidFile: string;

beforeEach(() => {
  folder = tempFolder();
  env = gitEnv(folder.path);
  pidFile = join(folder.path, 'child.pid');
});
afterEach(() => {
  // The child the alias left behind, stopped by the PID it wrote.
  if (existsSync(pidFile)) {
    try {
      process.kill(Number(readFileSync(pidFile, 'utf8')), 'SIGKILL');
    } catch {
      // already gone
    }
  }
  folder.cleanup();
});

/**
 * A git alias that runs `script` after starting a `sleep` in the background,
 * which keeps git's standard output and error open long after git has exited.
 */
function lingering(script: string): string[] {
  return ['-c', `alias.linger=!sleep 10 & echo $! > '${pidFile}'; ${script}`, 'linger'];
}

describe('an isolated run', () => {
  it('answers when git exits, with its output, while a child it left holds the output open', async () => {
    const started = Date.now();
    const run = await runGit(lingering('echo done'), { cwd: folder.path, env, isolate: true });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(run).toEqual({ ok: true, stdout: Buffer.from('done\n') });
    // The child is still there: the answer did not wait for it, and did not stop it.
    expect(() => process.kill(Number(readFileSync(pidFile, 'utf8')), 0)).not.toThrow();
  });

  it('a failure keeps its exit code and what git said, with a child still holding the output', async () => {
    const started = Date.now();
    const run = await runGit(lingering('echo out; echo said >&2; exit 3'), {
      cwd: folder.path,
      env,
      isolate: true,
    });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(run).toEqual({
      ok: false,
      missing: false,
      exitCode: 3,
      stderr: 'said\n',
      stdout: 'out\n',
      timedOut: false,
    });
  });

  it('an ordinary run answers with its output', async () => {
    const run = await runGit(['--version'], { cwd: folder.path, env, isolate: true });
    expect(run.ok && run.stdout.toString('utf8')).toMatch(/^git version /);
  });

  it('a timeout still stops the group and says so', async () => {
    const run = await runGit(['-c', `alias.wait=!echo waiting >&2; sleep 30`, 'wait'], {
      cwd: folder.path,
      env,
      isolate: true,
      timeoutMs: 300,
    });
    expect(run).toMatchObject({ ok: false, timedOut: true, stderr: 'waiting\n' });
  });

  it('git off the PATH is missing', async () => {
    const run = await runGit(['--version'], {
      cwd: folder.path,
      env: { ...env, PATH: join(folder.path, 'no-bin') },
      isolate: true,
    });
    expect(run).toMatchObject({ ok: false, missing: true, exitCode: null });
  });
});
