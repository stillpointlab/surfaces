/// <reference lib="dom" />

// Shared by the client's tests (jsdom): a `HostClient` over a folder in memory,
// and two small formats whose elements keep their content as text, so a test
// drives the page without a server, a real format or a network.

import { createFormatRegistry } from '@stillpointlab/common-format/format';

import { inRegion } from '../shared/apps';

import type {
  AppLockAnswer,
  AppOpAnswer,
  AppPageAnswer,
  CannotUndoNotice,
  FoundInstance,
  HostClient,
  JournalMove,
  PutOptions,
  WatchedEvent,
} from './host-client';
import type { FolderNode, Result } from '@stillpointlab/common-format/app';
import type { FormatDescriptor } from '@stillpointlab/common-format/format';
import type {
  FileStatus,
  HostChange,
  HostCommit,
  HostCommitRequest,
  HostGit,
  PortChange,
} from '@stillpointlab/common-format/host';

/** A file whose content is not text: `get` refuses it as `HOST_NOT_TEXT`. */
export const BINARY = Symbol('binary');

export interface FakeHost extends HostClient {
  /** The files, by path; change them and `emit` to play a change on disk. */
  readonly disk: Map<string, string | typeof BINARY>;
  readonly versions: Map<string, string>;
  readonly gets: string[];
  /** The paths asked for with no read (`probe`). */
  readonly probes: string[];
  readonly puts: PortChange[][];
  /** Each put's options, beside `puts`. */
  readonly putOptions: (PutOptions | undefined)[];
  /**
   * The steps undo would take, newest last, and those it took, next to redo
   * last: as the server keeps them, for the creates, moves and deletes `put` is
   * sent. A delete of a `BINARY` file is refused with `HOST_CANNOT_UNDO` unless
   * it is sent `unjournaled`, which empties both.
   */
  readonly steps: FakeStep[];
  readonly undone: FakeStep[];
  /** Answer the next undo or redo with this refusal instead. */
  refuseNextStep?: { code: string; message: string; path?: string };
  /** Hold every undo and redo until `releaseStep()`. */
  holdStep: boolean;
  releaseStep(): void;
  /** Answer the next `put` with this refusal instead of writing. */
  refuseNextPut?: { code: string; message: string; reason?: string };
  /** Hold every `put` until `releasePut()`. */
  holdPut: boolean;
  releasePut(): void;
  /** Folders listed with nothing under them, as a submodule is. */
  readonly separate: Set<string>;
  /** Answer the listing as cut. */
  truncated: boolean;
  /** Hold every `get` until `release()`. */
  hold: boolean;
  release(): void;
  emit(event: WatchedEvent): void;
  /** Write a file as something outside the page would, and say so. */
  writeOutside(path: string, text: string | null): void;
  /** What `git()` answers: not a repository unless a test says so. */
  gitInfo: HostGit;
  /** What `status()` answers, by path; change it and `emit({ type: 'status' })`. */
  statuses: Record<string, FileStatus>;
  /** A moved file's old path, by its new one, for `changes()` and `base()`. */
  movedFrom: Map<string, string>;
  /** The files' text at `HEAD`, by path, for `base()`. */
  readonly heads: Map<string, string | typeof BINARY>;
  /** The git routes asked, in order: `changes`, `base:<path>`, `commit`. */
  readonly gitCalls: string[];
  /** The commits asked for, in order. */
  readonly commits: HostCommitRequest[];
  /** Answer the next `commit` with this refusal instead of committing. */
  refuseNextCommit?: { code: string; message: string };
  /** Hold every `commit` until `releaseCommit()`. */
  holdCommit: boolean;
  releaseCommit(): void;
  /** Hold every `changes` until `releaseChanges()`. */
  holdChanges: boolean;
  releaseChanges(): void;
  /** The instances `apps()` answers; `setAppLock` changes their `unlocked` and says so. */
  instances: FoundInstance[];
  /** How `appPage` answers; by default a page whose state names the call. */
  pageAnswer: (manifestPath: string, path: string, query: string) => Result<AppPageAnswer>;
  /** How `appOp` answers; by default a reply with the next revision. */
  opAnswer: (manifestPath: string, op: unknown, view: unknown) => Result<AppOpAnswer>;
  /** The app calls, in order: `page:<manifest><path>?<query>`, `op:<type>`, `project`, `lock:<manifest>:<locked>`. */
  readonly appCalls: string[];
  /** The ops sent, with their views. */
  readonly ops: { manifestPath: string; op: unknown; view: unknown }[];
  /** Hold every `appOp` until `releaseOp()`. */
  holdOp: boolean;
  releaseOp(): void;
  /** What `setAppLock` answers on a lock. */
  lockAnswer: AppLockAnswer;
  /** The creates asked for, in order. */
  readonly creates: { app: string; folder: string; confirmRoot?: boolean; input: unknown }[];
  /** How `appCreate` answers; by default the instance is added, locked, and said so. */
  createAnswer?: (request: {
    app: string;
    folder: string;
  }) => Result<{ manifestPath: string; notice?: CannotUndoNotice }>;
}

/** A step the fake keeps: what undo and redo write. */
export interface FakeStep {
  label: string;
  inverse: PortChange[];
  forward: PortChange[];
}

export function fakeHost(files: Record<string, string | typeof BINARY>): FakeHost {
  const disk = new Map(Object.entries(files));
  const versions = new Map<string, string>();
  let next = 0;
  const stamp = (path: string) => versions.set(path, `v${++next}`);
  for (const path of disk.keys()) stamp(path);
  const listeners = new Set<(event: WatchedEvent) => void>();
  let held: (() => void)[] = [];
  let heldPuts: (() => void)[] = [];
  let heldCommits: (() => void)[] = [];
  let heldChanges: (() => void)[] = [];
  let heldOps: (() => void)[] = [];
  let heldSteps: (() => void)[] = [];
  let commitCount = 0;
  let opCount = 0;

  const host: FakeHost = {
    disk,
    versions,
    gets: [],
    probes: [],
    puts: [],
    putOptions: [],
    steps: [],
    undone: [],
    holdStep: false,
    releaseStep() {
      const waiting = heldSteps;
      heldSteps = [];
      for (const go of waiting) go();
    },
    hold: false,
    holdPut: false,
    separate: new Set(),
    truncated: false,
    gitInfo: { state: 'no-repository', branch: null },
    statuses: {},
    movedFrom: new Map(),
    heads: new Map(),
    gitCalls: [],
    commits: [],
    holdCommit: false,
    holdChanges: false,
    releaseChanges() {
      const waiting = heldChanges;
      heldChanges = [];
      host.holdChanges = false;
      for (const go of waiting) go();
    },
    instances: [],
    appCalls: [],
    ops: [],
    holdOp: false,
    lockAnswer: { errors: [], warnings: [] },
    creates: [],
    pageAnswer: (manifestPath, path, query) => ({
      ok: true,
      view: { type: 'page', path },
      state: { manifestPath, path, query },
      title: `Page ${path || '/'}`,
      revision: 'r0',
    }),
    opAnswer: () => {
      opCount += 1;
      return { ok: true, reply: { done: opCount }, revision: `op${opCount}` };
    },
    releaseOp() {
      const waiting = heldOps;
      heldOps = [];
      for (const go of waiting) go();
    },
    releaseCommit() {
      const waiting = heldCommits;
      heldCommits = [];
      for (const go of waiting) go();
    },
    release() {
      const waiting = held;
      held = [];
      for (const go of waiting) go();
    },
    releasePut() {
      const waiting = heldPuts;
      heldPuts = [];
      for (const go of waiting) go();
    },
    emit(event) {
      for (const listener of listeners) listener(event);
    },
    writeOutside(path, text) {
      if (text === null) disk.delete(path);
      else {
        disk.set(path, text);
        stamp(path);
      }
      host.emit({ type: 'changed', paths: [path] });
    },
    async root() {
      return { name: 'served', id: 'root-1' };
    },
    async list() {
      const nodes: FolderNode[] = [];
      const folders = new Set<string>();
      for (const path of disk.keys()) {
        nodes.push({ path, type: 'blob' });
        for (let cut = path.indexOf('/'); cut > 0; cut = path.indexOf('/', cut + 1)) {
          folders.add(path.slice(0, cut));
        }
      }
      for (const path of host.separate) folders.add(path);
      for (const path of folders) nodes.push({ path, type: 'tree' });
      return { nodes, truncated: host.truncated };
    },
    async get(path): Promise<Result<{ text: string; version: string }>> {
      host.gets.push(path);
      if (host.hold) await new Promise<void>((go) => held.push(go));
      if (path.startsWith('../')) {
        return { ok: false, code: 'HOST_PATH_OUTSIDE_ROOT', message: 'outside' };
      }
      const text = disk.get(path);
      if (text === undefined) return { ok: false, code: 'HOST_FILE_NOT_FOUND', message: 'none' };
      if (text === BINARY) return { ok: false, code: 'HOST_NOT_TEXT', message: 'not text' };
      return { ok: true, text, version: versions.get(path)! };
    },
    async probe(path): Promise<Result> {
      host.probes.push(path);
      return disk.has(path)
        ? { ok: true }
        : { ok: false, code: 'HOST_FILE_NOT_FOUND', message: 'none' };
    },
    urlFor: (path) => `/api/raw?path=${encodeURIComponent(path)}`,
    async put(changes, options) {
      host.puts.push([...changes]);
      host.putOptions.push(options);
      if (host.holdPut) await new Promise<void>((go) => heldPuts.push(go));
      // As the server does: no write into a locked app's files.
      for (const change of changes) {
        for (const path of change.kind === 'move' ? [change.from, change.path] : [change.path]) {
          if (host.instances.some((i) => !i.unlocked && inRegion(i, path))) {
            return { ok: false, code: 'HOST_SCOPE_LOCKED', message: `${path} is locked.` };
          }
        }
      }
      if (host.refuseNextPut) {
        const refusal = host.refuseNextPut;
        host.refuseNextPut = undefined;
        return { ok: false, ...refusal };
      }
      const journaled = changes.length > 0 && changes.every((c) => c.kind !== 'write');
      if (journaled && !options?.unjournaled) {
        if (changes.some((c) => c.kind === 'delete' && disk.get(c.path) === BINARY)) {
          return {
            ok: false,
            code: 'HOST_CANNOT_UNDO',
            message: 'cannot undo',
            reason: 'not-text',
          } as Result<{ versions: Record<string, string> }>;
        }
      }
      const inverse: PortChange[] = changes
        .map((c): PortChange => {
          if (c.kind === 'create') return { kind: 'delete', path: c.path };
          if (c.kind === 'move') return { kind: 'move', from: c.path, path: c.from };
          if (c.kind === 'delete') {
            return { kind: 'create', path: c.path, content: String(disk.get(c.path) ?? '') };
          }
          return c;
        })
        .reverse();
      const written = write(changes);
      if (written.ok && journaled) {
        if (options?.unjournaled) {
          host.steps.length = 0;
          host.undone.length = 0;
        } else {
          host.steps.push({
            label: `Step ${host.steps.length + 1}`,
            inverse,
            forward: [...changes],
          });
          host.undone.length = 0;
        }
        queueMicrotask(() => host.emit({ type: 'journal' }));
      }
      return written;
    },
    async journal() {
      return {
        ok: true,
        undo: host.steps.at(-1)?.label ?? null,
        redo: host.undone.at(-1)?.label ?? null,
      };
    },
    undo: () => takeStep('undo'),
    redo: () => takeStep('redo'),
    async status(): Promise<Record<string, FileStatus>> {
      return { ...host.statuses };
    },
    async git() {
      return { ...host.gitInfo };
    },
    async changes(): Promise<Result<{ changes: HostChange[] }>> {
      host.gitCalls.push('changes');
      if (host.holdChanges) await new Promise<void>((go) => heldChanges.push(go));
      if (host.gitInfo.state !== 'repository') return notARepository(host.gitInfo);
      const changes = Object.entries(host.statuses).map(([path, status]) => {
        const from = host.movedFrom.get(path);
        return from ? { path, status, from } : { path, status };
      });
      return { ok: true, changes };
    },
    async base(path): Promise<Result<{ text: string }>> {
      host.gitCalls.push(`base:${path}`);
      if (host.gitInfo.state !== 'repository') return notARepository(host.gitInfo);
      const text =
        host.statuses[path] === 'new'
          ? undefined
          : host.heads.get(host.movedFrom.get(path) ?? path);
      if (text === undefined) return { ok: false, code: 'HOST_FILE_NOT_FOUND', message: 'none' };
      if (text === BINARY) return { ok: false, code: 'HOST_NOT_TEXT', message: 'not text' };
      return { ok: true, text };
    },
    async commit(request): Promise<Result<HostCommit>> {
      host.gitCalls.push('commit');
      host.commits.push({ ...request, paths: [...request.paths] });
      if (host.holdCommit) await new Promise<void>((go) => heldCommits.push(go));
      if (host.gitInfo.state !== 'repository') return notARepository(host.gitInfo);
      if (host.refuseNextCommit) {
        const refusal = host.refuseNextCommit;
        host.refuseNextCommit = undefined;
        return { ok: false, ...refusal };
      }
      // As the server does: the chosen paths, a moved file by either of its paths.
      for (const path of request.paths) {
        const moved = [...host.movedFrom].find(([, from]) => from === path)?.[0];
        delete host.statuses[moved ?? path];
        if (moved) host.movedFrom.delete(moved);
        host.movedFrom.delete(path);
      }
      if (request.branch !== undefined) host.gitInfo = { ...host.gitInfo, branch: request.branch };
      commitCount += 1;
      const commit = `${commitCount}`.padStart(40, 'c');
      queueMicrotask(() => host.emit({ type: 'status' }));
      return { ok: true, commit, short: commit.slice(-7), branch: host.gitInfo.branch ?? '' };
    },
    async apps() {
      return host.instances.map((instance) => ({ ...instance }));
    },
    async appPage(manifestPath, path, query) {
      host.appCalls.push(`page:${manifestPath}${path}${query ? `?${query}` : ''}`);
      return host.pageAnswer(manifestPath, path, query);
    },
    async appProject(manifestPath, view) {
      host.appCalls.push('project');
      return { ok: true, state: { manifestPath, view }, revision: 'project' };
    },
    async appOp(manifestPath, op, view) {
      host.appCalls.push(`op:${(op as { type: string }).type}`);
      host.ops.push({ manifestPath, op, view });
      if (host.holdOp) await new Promise<void>((go) => heldOps.push(go));
      return host.opAnswer(manifestPath, op, view);
    },
    async appCreate(request) {
      host.creates.push({ ...request });
      if (host.createAnswer) return host.createAnswer(request);
      const manifestPath = `${request.folder === '' ? '' : `${request.folder}/`}${request.app}.yaml`;
      host.disk.set(manifestPath, '');
      stamp(manifestPath);
      host.instances.push({
        app: request.app,
        manifestPath,
        folder: request.folder,
        label: request.app,
        icon: 'task',
        valid: true,
        errors: [],
        unlocked: false,
        ...(request.folder === '' ? { scope: [manifestPath] } : {}),
      });
      queueMicrotask(() => host.emit({ type: 'apps' }));
      return { ok: true, manifestPath };
    },
    async setAppLock(manifestPath, locked) {
      host.appCalls.push(`lock:${manifestPath}:${locked}`);
      const instance = host.instances.find((i) => i.manifestPath === manifestPath);
      if (!instance) return { ok: false, code: 'HOST_APP_NOT_FOUND', message: 'no app' };
      instance.unlocked = !locked;
      queueMicrotask(() => host.emit({ type: 'apps' }));
      return { ok: true, ...(locked ? host.lockAnswer : { errors: [], warnings: [] }) };
    },
    watch(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  /** Write changes as the server would, and say so on the stream. */
  function write(changes: readonly PortChange[]): Result<{ versions: Record<string, string> }> {
    const named = new Set<string>();
    for (const change of changes) {
      for (const path of change.kind === 'move' ? [change.from, change.path] : [change.path]) {
        if (named.has(path)) return { ok: false, code: 'HOST_BAD_REQUEST', message: 'twice' };
        named.add(path);
      }
    }
    for (const change of changes) {
      const exists = disk.has(change.path);
      const source = change.kind === 'move' ? change.from : change.path;
      if ((change.kind === 'write' || change.kind === 'delete') && !exists) {
        return { ok: false, code: 'HOST_FILE_NOT_FOUND', message: 'none' };
      }
      if (change.kind === 'move' && !disk.has(source)) {
        return { ok: false, code: 'HOST_FILE_NOT_FOUND', message: 'none' };
      }
      if ((change.kind === 'create' || change.kind === 'move') && exists) {
        return { ok: false, code: 'HOST_PATH_EXISTS', message: 'exists' };
      }
      if (change.base !== undefined && change.base !== versions.get(source)) {
        return { ok: false, code: 'HOST_FILE_CHANGED', message: 'changed' };
      }
    }
    const answer: Record<string, string> = {};
    for (const change of changes) {
      if (change.kind === 'delete') {
        disk.delete(change.path);
        versions.delete(change.path);
      } else if (change.kind === 'move') {
        // Without content, the bytes and so the version move as they are.
        disk.set(change.path, disk.get(change.from)!);
        versions.set(change.path, versions.get(change.from)!);
        disk.delete(change.from);
        versions.delete(change.from);
        answer[change.path] = versions.get(change.path)!;
      } else {
        disk.set(change.path, change.content);
        stamp(change.path);
        answer[change.path] = versions.get(change.path)!;
      }
    }
    // The server reports its own writes too, and here before the write's answer.
    const paths = changes.flatMap((c) => (c.kind === 'move' ? [c.from, c.path] : [c.path]));
    queueMicrotask(() => host.emit({ type: 'changed', paths }));
    return { ok: true, versions: answer };
  }

  /** Undo or redo the newest step on its side, as the server would. */
  async function takeStep(which: 'undo' | 'redo'): Promise<Result<JournalMove>> {
    if (host.holdStep) await new Promise<void>((go) => heldSteps.push(go));
    if (host.refuseNextStep) {
      const refusal = host.refuseNextStep;
      host.refuseNextStep = undefined;
      return { ok: false, ...refusal } as Result<JournalMove>;
    }
    const from = which === 'undo' ? host.steps : host.undone;
    const to = which === 'undo' ? host.undone : host.steps;
    const step = from.at(-1);
    if (!step) {
      return {
        ok: false,
        code: which === 'undo' ? 'HOST_NOTHING_TO_UNDO' : 'HOST_NOTHING_TO_REDO',
        message: 'nothing',
      };
    }
    const changes = which === 'undo' ? step.inverse : step.forward;
    const written = write(changes);
    if (!written.ok) return written;
    from.pop();
    to.push(step);
    queueMicrotask(() => host.emit({ type: 'journal' }));
    return {
      ok: true,
      label: step.label,
      moved: changes.flatMap((c) => (c.kind === 'move' ? [{ from: c.from, path: c.path }] : [])),
      deleted: changes.flatMap((c) => (c.kind === 'delete' ? [c.path] : [])),
    };
  }

  return host;
}

function notARepository(git: HostGit): { ok: false; code: string; message: string } {
  return git.state === 'no-git'
    ? { ok: false, code: 'HOST_GIT_NOT_FOUND', message: 'no git' }
    : { ok: false, code: 'HOST_NOT_A_REPOSITORY', message: 'not a repository' };
}

/** A preview that keeps its text. */
export class FakePreview extends HTMLElement {
  content = '';
  setContent(content: string): void {
    this.content = content;
    this.textContent = content;
  }
  async whenReady(): Promise<void> {}
}

/** An editor that keeps its text; `type` is a person's edit. */
export class FakeEditor extends FakePreview {
  getContent(): string {
    return this.content;
  }
  override focus(): void {
    this.dataset.focused = 'true';
  }
  type(text: string): void {
    this.setContent(this.content + text);
    this.dispatchEvent(new CustomEvent('content-change', { detail: { content: this.content } }));
  }
}

/** A diff that keeps its two sides, as `<code-diff>` takes them. */
export class FakeDiff extends HTMLElement {
  left = '';
  right = '';
  setContents(contents: { left: string; right: string }): void {
    this.left = contents.left;
    this.right = contents.right;
  }
  async whenReady(): Promise<void> {}
}

/** A preview that takes a URL. */
export class FakeImage extends HTMLElement {
  async whenReady(): Promise<void> {}
}

if (!customElements.get('fake-preview')) customElements.define('fake-preview', FakePreview);
if (!customElements.get('fake-editor')) customElements.define('fake-editor', FakeEditor);
if (!customElements.get('fake-image')) customElements.define('fake-image', FakeImage);
if (!customElements.get('fake-diff')) customElements.define('fake-diff', FakeDiff);

/** The pane's diff element, for tests: the fake, loaded at once. */
export const fakeDiff = { tag: 'fake-diff', load: async () => undefined };

export const textFormat: FormatDescriptor = {
  id: 'text',
  opens: ['.md', '.txt'],
  needs: 'text',
  preview: { tag: 'fake-preview', load: async () => undefined },
  editor: { tag: 'fake-editor', load: async () => undefined },
  apply(element, file) {
    (element as FakePreview).setContent(file.text ?? '');
  },
};

export const picFormat: FormatDescriptor = {
  id: 'pic',
  opens: ['.png'],
  needs: 'url',
  preview: { tag: 'fake-image', load: async () => undefined },
  apply(element, file) {
    element.setAttribute('src', file.url ?? '');
  },
};

export const fakeRegistry = () =>
  createFormatRegistry([textFormat, picFormat], { fallback: textFormat });
