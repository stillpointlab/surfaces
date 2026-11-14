// The storage port over a folder on disk: the only module besides the watcher,
// git's and the `bin` that touches `node:fs` or runs a program.
//
// In a git repository, `put` stages its own moves and deletes once they are
// written (`git/stage.ts`), and `status()` is git's (`git/repository.ts`). A
// staging that fails leaves the write standing: `put` still succeeds, and warns.
// `commit` is git's commit of chosen paths, run under the same write lock as
// `put`, so a `put` arriving during a commit waits for it, and the reverse.
//
// `put` is all or nothing, in three steps under one lock (two `put`s run one after
// the other, so the second checks its bases against what the first wrote):
//
// 1. Check every change against the disk without writing: paths, bases, what
//    exists. One refusal refuses the call.
// 2. Write each change so that it can be taken back: a new file is placed under
//    its name only if the name is free; a file that is replaced or removed is kept
//    under a temporary name beside it until the end.
// 3. When every change is written, drop the kept files and the folders the moves
//    and deletes left empty. When one fails (a full disk, a folder that cannot be
//    written), take back the ones written, newest first, and answer
//    `HOST_WRITE_FAILED`.

import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import {
  chmod,
  constants,
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { fail, ok } from '@stillpointlab/common-format/app';

import { createGit } from './git/repository';
import { MAX_TEXT_BYTES } from './limits';
import { gitPaths, toNodes, walkPaths } from './listing';
import { isInside, locate, outsideRoot, pathProblem } from './paths';
import { decodeText } from './text';

import type { HostGitAccess } from './git/repository';
import type { Location } from './paths';
import type { Failure, FolderNode, Result } from '@stillpointlab/common-format/app';
import type {
  FileStatus,
  GitState,
  HostCommit,
  HostCommitRequest,
  PortChange,
  StoragePort,
} from '@stillpointlab/common-format/host';

/** How the port lists, decided once at start. */
export interface PortStart {
  listing: 'git' | 'walk';
  /** Whether `git` could be run at all. */
  gitFound: boolean;
  /**
   * When `git` could not be run: whether a `.git` entry (a folder or a file) is in
   * the root or a folder above it. `false` when `git` ran.
   */
  looksLikeRepository: boolean;
  /** Whether the folder is under git, as `GET /api/git` answers it. */
  git: GitState;
}

export interface NodePort extends StoragePort {
  /** The root's real path. */
  readonly root: string;
  /** The folder's git: its state, changes, `HEAD` text and staging. */
  readonly git: HostGitAccess;
  /** How the port lists. The first call asks `git`; later calls answer the same. */
  start(): Promise<PortStart>;
  /**
   * Commit the chosen paths (`git.commit`) under the write lock: never while a
   * `put` writes or stages.
   */
  commit(request: HostCommitRequest): Promise<Result<HostCommit>>;
}

export interface NodePortOptions {
  /** The folder to serve. Must exist and be a folder. */
  root: string;
  /** The environment `git` runs in; the process's own by default. */
  env?: NodeJS.ProcessEnv;
  /** Something the port could not do but worked without (a staging that failed). The default prints it. */
  warn?(message: string): void;
  /** How long a commit may run (`COMMIT_TIMEOUT_MS` by default); a test shortens it. */
  commitTimeoutMs?: number;
}

/** A SHA-256 of the bytes, as hex: a file's version. */
export function versionOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function versionOfFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}

function tempName(folder: string, name: string): string {
  return join(folder, `.${name}.surfaces-tmp-${randomBytes(8).toString('hex')}`);
}

const notFound = (path: string): Failure =>
  fail('HOST_FILE_NOT_FOUND', `There is no file at ${JSON.stringify(path)}.`);

const exists = (path: string, what = 'a file'): Failure =>
  fail('HOST_PATH_EXISTS', `There is already ${what} at ${JSON.stringify(path)}.`);

const changed = (path: string): Failure =>
  fail(
    'HOST_FILE_CHANGED',
    `${JSON.stringify(path)} changed on disk after it was read; nothing was written.`
  );

const badRequest = (message: string): Failure => fail('HOST_BAD_REQUEST', message);

/** The shape of a change, checked before anything else (a `put` can come from a request body). */
function shapeProblem(change: unknown, index: number): string | null {
  const at = `Change ${index + 1}`;
  if (typeof change !== 'object' || change === null) return `${at} is not an object.`;
  const c = change as Record<string, unknown>;
  if (typeof c.path !== 'string') return `${at} has no path.`;
  if (c.base !== undefined && typeof c.base !== 'string')
    return `${at} has a base that is not a string.`;
  switch (c.kind) {
    case 'write':
    case 'create':
      if (typeof c.content !== 'string') return `${at} (${c.kind}) has no content.`;
      return null;
    case 'move':
      if (typeof c.from !== 'string') return `${at} (move) has no "from".`;
      if (c.content !== undefined && typeof c.content !== 'string')
        return `${at} (move) has content that is not a string.`;
      return null;
    case 'delete':
      return null;
    default:
      return `${at} has an unknown kind, ${JSON.stringify(c.kind)}.`;
  }
}

/** One change, checked and ready to write. */
type Planned =
  | { kind: 'write'; path: string; real: string; bytes: Buffer; mode: number }
  | { kind: 'create'; path: string; base: string; rest: string[]; bytes: Buffer }
  | {
      kind: 'move';
      path: string;
      entry: string;
      base: string;
      rest: string[];
      bytes: Buffer | null;
      mode: number;
    }
  | { kind: 'delete'; path: string; entry: string };

/** A failure while writing, after the checks passed. */
class WriteFailure extends Error {
  constructor(
    readonly path: string,
    readonly cause: unknown,
    readonly refusal?: Failure
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

export function createNodePort(options: NodePortOptions): NodePort {
  const root = realpathSyncChecked(options.root);
  const env = options.env;
  const warn = options.warn ?? ((message: string) => console.warn(`surfaces: ${message}`));
  const git = createGit({ root, env, warn, commitTimeoutMs: options.commitTimeoutMs });
  let started: Promise<PortStart> | null = null;
  // Writes run one at a time: each `put` checks against what the one before wrote,
  // and a commit reads the index the last `put` staged.
  let queue: Promise<unknown> = Promise.resolve();

  /** Run `task` once every write before it has finished, and before any after it. */
  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  }

  function start(): Promise<PortStart> {
    started ??= (async (): Promise<PortStart> => {
      const at = await git.start();
      if (at.state === 'repository') {
        return { listing: 'git', gitFound: true, looksLikeRepository: false, git: 'repository' };
      }
      if (at.state === 'no-git') {
        return { listing: 'walk', gitFound: false, looksLikeRepository: true, git: 'no-git' };
      }
      return {
        listing: 'walk',
        gitFound: at.gitFound,
        looksLikeRepository: false,
        git: 'no-repository',
      };
    })();
    return started;
  }

  async function list(): Promise<FolderNode[]> {
    const { listing } = await start();
    const listed =
      (listing === 'git' ? await gitPaths(root, env) : null) ?? (await walkPaths(root));
    return toNodes(listed);
  }

  /** A path's location, or the refusal its text or its place earns. */
  async function place(path: unknown): Promise<Failure | { path: string; at: Location }> {
    const problem = pathProblem(path);
    if (problem !== null) return outsideRoot(String(path), problem);
    const at = await locate(root, path as string);
    if (at.kind === 'outside') {
      return outsideRoot(path as string, 'a symbolic link on the path leads out of it.');
    }
    return { path: path as string, at };
  }

  async function get(path: string): Promise<Result<{ text: string; version: string }>> {
    const placed = await place(path);
    if ('ok' in placed) return placed;
    if (placed.at.kind !== 'file') return notFound(path);
    let bytes: Buffer;
    try {
      // Non-blocking, so a pipe swapped in after the check cannot hang the read.
      const handle = await open(placed.at.real, constants.O_RDONLY | constants.O_NONBLOCK);
      try {
        const info = await handle.stat();
        if (!info.isFile()) return notFound(path);
        if (info.size > MAX_TEXT_BYTES) return tooLarge(path);
        bytes = await handle.readFile();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return notFound(path);
      throw error;
    }
    if (bytes.length > MAX_TEXT_BYTES) return tooLarge(path);
    const text = decodeText(bytes);
    if (text === null) {
      return fail(
        'HOST_NOT_TEXT',
        `${JSON.stringify(path)} is not text (UTF-8 without NUL bytes).`
      );
    }
    return ok({ text, version: versionOf(bytes) });
  }

  function tooLarge(path: string): Failure {
    return fail(
      'HOST_FILE_TOO_LARGE',
      `${JSON.stringify(path)} is over ${MAX_TEXT_BYTES / 1024 / 1024} MiB, too large to open as text.`
    );
  }

  /** Step 1: every change checked against the disk, or the first refusal. */
  async function plan(changes: readonly PortChange[]): Promise<Failure | Planned[]> {
    if (!Array.isArray(changes)) return badRequest('The changes must be a list.');
    for (const [index, change] of changes.entries()) {
      const problem = shapeProblem(change, index);
      if (problem !== null) return badRequest(problem);
    }
    // A path is named once per call: as a change's path or a move's source.
    const named = new Set<string>();
    for (const change of changes) {
      for (const path of change.kind === 'move' ? [change.from, change.path] : [change.path]) {
        if (named.has(path)) {
          return badRequest(
            `${JSON.stringify(path)} is named twice; name each path once per call.`
          );
        }
        named.add(path);
      }
    }

    const planned: Planned[] = [];
    for (const change of changes) {
      // A move's source is checked before its target, so a missing source says so.
      const source = change.kind === 'move' ? await place(change.from) : null;
      if (source && 'ok' in source) return source;
      if (source && source.at.kind !== 'file') return notFound((change as { from: string }).from);
      const placed = await place(change.path);
      if ('ok' in placed) return placed;
      const { at } = placed;
      const bytes = change.content === undefined ? null : Buffer.from(change.content, 'utf8');

      if (change.kind === 'create' || change.kind === 'move') {
        if (at.kind === 'blocked') return exists(at.at, 'a file where a folder would go,');
        if (at.kind !== 'missing')
          return exists(change.path, at.kind === 'file' ? 'a file' : 'something');
      }
      const target = at as Extract<Location, { kind: 'missing' }>;

      if (change.kind === 'create') {
        const { base, rest } = target;
        planned.push({ kind: 'create', path: change.path, base, rest, bytes: bytes as Buffer });
        continue;
      }

      // The file a write, a move or a delete acts on, and its base.
      const sourcePath = change.kind === 'move' ? change.from : change.path;
      const file = (source ?? placed).at;
      if (file.kind !== 'file') return notFound(sourcePath);
      const info = await stat(file.real);
      if (change.base !== undefined && (await versionOfFile(file.real)) !== change.base) {
        return changed(sourcePath);
      }

      if (change.kind === 'write') {
        planned.push({
          kind: 'write',
          path: change.path,
          real: file.real,
          bytes: bytes as Buffer,
          mode: info.mode & 0o7777,
        });
      } else if (change.kind === 'move') {
        planned.push({
          kind: 'move',
          path: change.path,
          entry: file.entry,
          base: target.base,
          rest: target.rest,
          bytes,
          mode: info.mode & 0o7777,
        });
      } else {
        planned.push({ kind: 'delete', path: change.path, entry: file.entry });
      }
    }

    // A new file cannot sit inside another new file.
    const created = planned
      .filter((p) => p.kind === 'create' || p.kind === 'move')
      .map((p) => p.path);
    for (const path of created) {
      const inside = created.find((other) => other.startsWith(`${path}/`));
      if (inside)
        return exists(path, `a new file whose path is a folder of ${JSON.stringify(inside)},`);
    }
    return planned;
  }

  async function put(
    changes: readonly PortChange[]
  ): Promise<Result<{ versions: Record<string, string> }>> {
    return exclusive(async () => {
      const planned = await plan(changes);
      if (!Array.isArray(planned)) return planned;
      const written = await write(planned);
      // Inside the lock, so the next call's staging reads the index this one left.
      if (written.ok) await stage(changes);
      return written;
    });
  }

  function commit(request: HostCommitRequest): Promise<Result<HostCommit>> {
    return exclusive(() => git.commit(request));
  }

  /** Steps 2 and 3. */
  async function write(planned: Planned[]): Promise<Result<{ versions: Record<string, string> }>> {
    const undo: Array<() => Promise<unknown>> = [];
    const kept: string[] = [];
    const emptied = new Set<string>();
    const versions: Record<string, string> = {};

    /** Make the folders a new path needs, each one undone if the call fails. */
    async function folderFor(base: string, rest: string[]): Promise<string> {
      let folder = base;
      for (const name of rest.slice(0, -1)) {
        folder = join(folder, name);
        try {
          await mkdir(folder);
          const made = folder;
          undo.push(() => rmdir(made));
        } catch (error) {
          if (errorCode(error) !== 'EEXIST') throw error;
        }
      }
      // A folder made on the way must still be the root's (nothing swapped a link in).
      const real = await realpath(folder);
      if (!isInside(root, real))
        throw new Error('a folder on the path now leads out of the served folder');
      return real;
    }

    /** Write bytes to a temporary file in `folder`. */
    async function temp(
      folder: string,
      name: string,
      bytes: Buffer,
      mode?: number
    ): Promise<string> {
      const path = tempName(folder, name);
      await writeFile(path, bytes, { flag: 'wx', mode: mode ?? 0o666, flush: true });
      if (mode !== undefined) await chmod(path, mode);
      return path;
    }

    /** Give `from` the name `to` only if `to` is free; `from` is gone afterwards. */
    async function placeAt(from: string, to: string, path: string): Promise<void> {
      try {
        await link(from, to);
      } catch (error) {
        const c = errorCode(error);
        if (c === 'EEXIST') throw new WriteFailure(path, error, exists(path));
        if (
          c !== 'EPERM' &&
          c !== 'ENOTSUP' &&
          c !== 'EOPNOTSUPP' &&
          c !== 'EXDEV' &&
          c !== 'EMLINK'
        ) {
          throw error;
        }
        // A file system without hard links: check, then rename (or copy across devices).
        const taken = await lstat(to).then(
          () => true,
          () => false
        );
        if (taken) throw new WriteFailure(path, error, exists(path));
        if (c === 'EXDEV') await copyFile(from, to, constants.COPYFILE_EXCL);
        else {
          await rename(from, to);
          return;
        }
      }
      await unlink(from);
    }

    /** Set `entry` aside under a temporary name, put back if the call fails. */
    async function keepAside(entry: string): Promise<void> {
      const aside = tempName(dirname(entry), basename(entry));
      await rename(entry, aside);
      undo.push(() => rename(aside, entry));
      kept.push(aside);
    }

    let current = '';
    try {
      for (const change of planned) {
        current = change.path;
        if (change.kind === 'write') {
          // The old bytes stay under a second name until the end.
          const folder = dirname(change.real);
          const aside = tempName(folder, basename(change.real));
          try {
            await link(change.real, aside);
          } catch {
            await copyFile(change.real, aside, constants.COPYFILE_EXCL);
          }
          kept.push(aside);
          const fresh = await temp(folder, basename(change.real), change.bytes, change.mode);
          try {
            await rename(fresh, change.real);
          } catch (error) {
            await unlink(fresh).catch(() => undefined);
            throw error;
          }
          undo.push(() => rename(aside, change.real));
          versions[change.path] = versionOf(change.bytes);
        } else if (change.kind === 'create') {
          const folder = await folderFor(change.base, change.rest);
          const target = join(folder, change.rest[change.rest.length - 1]);
          const fresh = await temp(folder, basename(target), change.bytes);
          try {
            await placeAt(fresh, target, change.path);
          } catch (error) {
            await unlink(fresh).catch(() => undefined);
            throw error;
          }
          undo.push(() => unlink(target));
          versions[change.path] = versionOf(change.bytes);
        } else if (change.kind === 'move') {
          const folder = await folderFor(change.base, change.rest);
          const target = join(folder, change.rest[change.rest.length - 1]);
          if (change.bytes === null) {
            // The same bytes under a new name: the entry itself moves (a link stays a link).
            await placeAt(change.entry, target, change.path);
            undo.push(() => rename(target, change.entry));
            // A relative link moved to another folder may lead nowhere now: no version.
            const version = await versionOfFile(target).catch(() => null);
            if (version !== null) versions[change.path] = version;
          } else {
            const fresh = await temp(folder, basename(target), change.bytes, change.mode);
            try {
              await placeAt(fresh, target, change.path);
            } catch (error) {
              await unlink(fresh).catch(() => undefined);
              throw error;
            }
            undo.push(() => unlink(target));
            await keepAside(change.entry);
            versions[change.path] = versionOf(change.bytes);
          }
          emptied.add(dirname(change.entry));
        } else {
          await keepAside(change.entry);
          emptied.add(dirname(change.entry));
        }
      }
    } catch (error) {
      const failure = error instanceof WriteFailure ? error : new WriteFailure(current, error);
      const stuck: string[] = [];
      for (const step of undo.reverse()) {
        await step().catch((undoError: unknown) => stuck.push(String(undoError)));
      }
      if (stuck.length === 0) {
        for (const aside of kept) await unlink(aside).catch(() => undefined);
        if (failure.refusal) return failure.refusal;
      }
      // When something could not be taken back, the kept files stay, for a person to recover.
      return fail(
        'HOST_WRITE_FAILED',
        stuck.length === 0
          ? `Could not write ${JSON.stringify(failure.path)} (${failure.message}); nothing was changed.`
          : `Could not write ${JSON.stringify(failure.path)} (${failure.message}), and ${stuck.length} of the changes before it could not be taken back (${stuck.join('; ')}). The earlier files are kept beside them as .<name>.surfaces-tmp-*.`
      );
    }

    // Done: drop what was kept, and the folders moves and deletes left empty.
    for (const aside of kept) await unlink(aside).catch(() => undefined);
    for (const folder of emptied) await pruneEmpty(root, folder);
    return ok({ versions });
  }

  /** Stage what a successful write moved or deleted; a failure is a warning, never a refusal. */
  async function stage(changes: readonly PortChange[]): Promise<void> {
    if (!changes.some((change) => change.kind === 'move' || change.kind === 'delete')) return;
    try {
      const staged = await git.stage(changes);
      if (!staged.ok) {
        warn(
          `the files were written, but git could not stage the move or delete (${staged.message}); git will show them unstaged.`
        );
      }
    } catch (error) {
      warn(`the files were written, but staging them failed: ${String(error)}`);
    }
  }

  function status(): Promise<Record<string, FileStatus>> {
    return git.status();
  }

  return { root, git, start, list, get, put, status, commit };
}

/** Remove `folder` and the folders above it while they are empty, up to the root. */
async function pruneEmpty(root: string, folder: string): Promise<void> {
  let at = folder;
  while (at !== root && isInside(root, at)) {
    try {
      await rmdir(at);
    } catch {
      return;
    }
    at = dirname(at);
  }
}

/** Synchronous on purpose: a host knows its root before it answers anything. */
function realpathSyncChecked(root: string): string {
  const real = realpathSync(root);
  if (!statSync(real).isDirectory()) throw new Error(`${root} is not a folder`);
  return real;
}
