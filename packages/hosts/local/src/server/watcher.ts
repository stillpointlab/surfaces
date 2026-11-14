// The watcher: tells a listener when the folder's files change on disk.
//
// It watches each listed folder on its own (`fs.watch` without `recursive`), not
// the root recursively. On Linux, Node's recursive watch walks every folder,
// `node_modules` and ignored build output included, and it watches each file by
// itself, so a file an editor or git replaces by a rename goes silent after the
// first save. A watch on a folder reports a name whatever happens to it, so this
// one does not. The folders are those the listing derives, re-derived whenever
// the list changes, so what git ignores is never watched.
//
// Events within `BURST_MS` of each other (and at most `BURST_MAX_MS` apart) make
// one burst. A burst that saw a name appear or go lists the folder again, and
// sends `listed` when the set of paths changed. Then it sends `changed` with the
// listed files whose contents changed, appeared or went. Names nothing lists (a
// write's temporary file, an ignored log) are passed over.
//
// A folder outside the tree (git's own, for its `HEAD` and `index`) is watched
// with `watchNames`, which calls back once per burst that touched one of the names.

import { watch } from 'node:fs';
import { join } from 'node:path';

import { BURST_MAX_MS, BURST_MS } from './limits';
import { TEMP_NAME } from './listing';
import { isGitName } from './paths';

import type { FolderNode } from '@stillpointlab/common-format/app';
import type { HostEvent } from '@stillpointlab/common-format/host';
import type { FSWatcher } from 'node:fs';

export interface FolderWatcherOptions {
  /** The root's real path. */
  root: string;
  /** The listing, as the port answers it. */
  list(): Promise<FolderNode[]>;
  /** Where events go. */
  send(event: HostEvent): void;
  /** Something the watcher could not do (the system's watch limit, say). The default prints it. */
  warn?(message: string): void;
  burstMs?: number;
  burstMaxMs?: number;
}

export interface FolderWatcher {
  /** Resolves once the first listing is taken and its folders are watched. */
  readonly ready: Promise<void>;
  /** How many folders are watched now, the tree's and `watchNames`'s. */
  readonly watched: number;
  /**
   * Watch some names in one folder, anywhere (git's folder, for `HEAD` and
   * `index`): `onChange` runs once per burst that touched one. Returns a function
   * that stops it.
   */
  watchNames(folder: string, names: readonly string[], onChange: () => void): () => void;
  close(): void;
}

interface Pending {
  /** Paths under the root, with whether a name appeared or went (`rename`) or only changed. */
  paths: Map<string, 'rename' | 'change'>;
  relist: boolean;
  callbacks: Set<() => void>;
}

interface NameWatch {
  names: ReadonlySet<string>;
  onChange: () => void;
}

export function createFolderWatcher(options: FolderWatcherOptions): FolderWatcher {
  const { root } = options;
  const burstMs = options.burstMs ?? BURST_MS;
  const burstMaxMs = options.burstMaxMs ?? BURST_MAX_MS;
  const warn = options.warn ?? ((message: string) => console.warn(`surfaces: ${message}`));

  /** Every open watch, by absolute folder. */
  const watches = new Map<string, FSWatcher>();
  /** The tree's folders, absolute to relative ('' for the root). */
  let treeFolders = new Map<string, string>();
  /** Watches outside the tree, by absolute folder. */
  const nameWatches = new Map<string, Set<NameWatch>>();
  /** The files the last listing had. */
  let files = new Set<string>();
  let folders = new Set<string>();
  let watchFolders = new Set<string>();

  let pending: Pending = { paths: new Map(), relist: false, callbacks: new Set() };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let burstStart = 0;
  let flushing: Promise<void> = Promise.resolve();
  let closed = false;
  let warnedLimit = false;

  function onRaw(folder: string, type: string, name: string | Buffer | null): void {
    if (closed) return;
    const named = name === null ? null : String(name);
    const rel = treeFolders.get(folder);
    if (rel !== undefined) {
      if (named === null) {
        pending.relist = true;
      } else if (!isGitName(named) && !TEMP_NAME.test(named)) {
        const path = rel === '' ? named : `${rel}/${named}`;
        const kind =
          type === 'rename' || pending.paths.get(path) === 'rename' ? 'rename' : 'change';
        pending.paths.set(path, kind);
        if (kind === 'rename' || !files.has(path)) pending.relist = true;
      }
    }
    for (const watch of nameWatches.get(folder) ?? []) {
      if (named === null || watch.names.has(named)) pending.callbacks.add(watch.onChange);
    }
    schedule();
  }

  function schedule(): void {
    const now = Date.now();
    if (timer === null) burstStart = now;
    else clearTimeout(timer);
    const wait = Math.max(0, Math.min(burstMs, burstStart + burstMaxMs - now));
    timer = setTimeout(() => {
      timer = null;
      const burst = pending;
      pending = { paths: new Map(), relist: false, callbacks: new Set() };
      flushing = flushing.then(() => flush(burst)).catch((error: unknown) => warn(String(error)));
    }, wait);
  }

  async function flush(burst: Pending): Promise<void> {
    if (closed) return;
    let nextFiles = files;
    let listed = false;
    if (burst.relist) {
      const nodes = await options.list();
      if (closed) return;
      const next = split(nodes);
      listed = !sameSet(files, next.files) || !sameSet(folders, next.folders);
      nextFiles = next.files;
      if (listed) {
        folders = next.folders;
        watchFolders = next.watch;
        syncTree();
      }
    }
    const touched = new Set<string>();
    for (const path of burst.paths.keys()) {
      if (files.has(path) || nextFiles.has(path)) touched.add(path);
    }
    if (listed) {
      for (const path of nextFiles) if (!files.has(path)) touched.add(path);
      for (const path of files) if (!nextFiles.has(path)) touched.add(path);
    }
    files = nextFiles;
    if (listed) options.send({ type: 'listed' });
    if (touched.size > 0) options.send({ type: 'changed', paths: [...touched].sort() });
    for (const callback of burst.callbacks) callback();
  }

  /** Open and close watches so they match the tree's folders and the named ones. */
  function syncTree(): void {
    const next = new Map<string, string>([[root, '']]);
    for (const folder of watchFolders) next.set(join(root, folder), folder);
    treeFolders = next;
    syncWatches();
  }

  function syncWatches(): void {
    const wanted = new Set([...treeFolders.keys(), ...nameWatches.keys()]);
    for (const [folder, watcher] of watches) {
      if (!wanted.has(folder)) {
        watcher.close();
        watches.delete(folder);
      }
    }
    for (const folder of wanted) {
      if (watches.has(folder)) continue;
      try {
        const watcher = watch(folder, { persistent: false }, (type, name) =>
          onRaw(folder, type, name)
        );
        // A watched folder that goes away errors on some systems; its parent reports it.
        watcher.on('error', () => {
          watcher.close();
          if (watches.get(folder) === watcher) watches.delete(folder);
        });
        watches.set(folder, watcher);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'ENOTDIR') continue;
        if ((code === 'ENOSPC' || code === 'EMFILE') && !warnedLimit) {
          warnedLimit = true;
          warn(
            `the system's limit on watched folders was reached (${code}); changes in some folders will not show until the page reloads.`
          );
          continue;
        }
        if (code !== 'ENOSPC' && code !== 'EMFILE')
          warn(`could not watch ${folder}: ${String(error)}`);
      }
    }
  }

  const ready = (async () => {
    const first = split(await options.list());
    if (closed) return;
    files = first.files;
    folders = first.folders;
    watchFolders = first.watch;
    syncTree();
  })();

  return {
    ready,
    get watched() {
      return watches.size;
    },
    watchNames(folder, names, onChange) {
      const entry: NameWatch = { names: new Set(names), onChange };
      const set = nameWatches.get(folder) ?? new Set<NameWatch>();
      set.add(entry);
      nameWatches.set(folder, set);
      syncWatches();
      return () => {
        set.delete(entry);
        if (set.size === 0) nameWatches.delete(folder);
        syncWatches();
      };
    },
    close() {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      for (const watcher of watches.values()) watcher.close();
      watches.clear();
    },
  };
}

/**
 * The listing's files and folders, and the folders to watch: those that hold a
 * listed file. A folder listed with nothing under it (a submodule, a nested
 * repository) is not watched: git lists it as one entry, and the host leaves it alone.
 */
function split(nodes: readonly FolderNode[]): {
  files: Set<string>;
  folders: Set<string>;
  watch: Set<string>;
} {
  const files = new Set<string>();
  const folders = new Set<string>();
  const watch = new Set<string>();
  for (const node of nodes) {
    if (node.type === 'tree') {
      folders.add(node.path);
      continue;
    }
    files.add(node.path);
    for (let cut = node.path.lastIndexOf('/'); cut > 0; cut = node.path.lastIndexOf('/', cut - 1)) {
      const folder = node.path.slice(0, cut);
      if (watch.has(folder)) break;
      watch.add(folder);
    }
  }
  return { files, folders, watch };
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}
