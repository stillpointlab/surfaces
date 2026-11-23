import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createNodePort } from './port';
import { tempFolder, writeFiles } from './test-support';
import { createFolderWatcher } from './watcher';

import type { FolderWatcher } from './watcher';
import type { HostEvent } from '@stillpointlab/common-format/host';

let folder: ReturnType<typeof tempFolder>;
let watcher: FolderWatcher | null;

beforeEach(() => {
  folder = tempFolder();
  watcher = null;
});
afterEach(() => {
  watcher?.close();
  folder.cleanup();
});

/** Resolves when `predicate` holds, checked whenever `poke` is called; rejects after a timeout. */
function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000
): { poke(): void; done: Promise<void> } {
  let poke = () => undefined as void;
  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`not within ${timeoutMs} ms`)), timeoutMs);
    poke = () => {
      if (predicate()) {
        clearTimeout(timer);
        resolve();
      }
    };
  });
  return { poke: () => poke(), done };
}

describe('createFolderWatcher', () => {
  it('watches only folders that hold a listed file', async () => {
    const root = join(folder.path, 'root');
    writeFiles(root, { 'a.md': 'a', 'docs/deep/b.md': 'b' });
    mkdirSync(join(root, 'empty'));
    const port = createNodePort({ root });
    watcher = createFolderWatcher({ root, list: () => port.list(), send: () => undefined });
    await watcher.ready;
    // The root, docs and docs/deep; not the empty folder.
    expect(watcher.watched).toBe(3);
  });

  it('still hears a folder that was removed and made again in one burst', async () => {
    const root = join(folder.path, 'root');
    writeFiles(root, { 'a.md': 'a', 'docs/b.md': 'b' });
    const port = createNodePort({ root });
    const sent: HostEvent[] = [];
    const changedPaths = () =>
      sent.flatMap((event) => (event.type === 'changed' ? event.paths : []));
    let wait = waitFor(() => changedPaths().includes('docs/b.md'));
    watcher = createFolderWatcher({
      root,
      list: () => port.list(),
      send: (event) => {
        sent.push(event);
        wait.poke();
      },
      burstMs: 40,
    });
    await watcher.ready;
    // As a rebase does: the folder goes and comes back, with the same file in it.
    rmSync(join(root, 'docs'), { recursive: true });
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'docs/b.md'), 'b');
    // The listing is the same; the file in the folder made again is said to have changed.
    await wait.done;
    expect(sent.some((event) => event.type === 'listed')).toBe(false);
    expect(watcher.watched).toBe(2);

    // And a later change in it, and a new file, are heard.
    sent.length = 0;
    wait = waitFor(
      () => changedPaths().includes('docs/b.md') && changedPaths().includes('docs/new.md')
    );
    writeFileSync(join(root, 'docs/b.md'), 'b, edited');
    writeFileSync(join(root, 'docs/new.md'), 'n');
    await wait.done;
    expect(sent.some((event) => event.type === 'listed')).toBe(true);
  });

  it('watches names in a folder outside the tree, through a replace by rename', async () => {
    const root = join(folder.path, 'root');
    const gitDir = join(folder.path, 'elsewhere.git');
    writeFiles(root, { 'a.md': 'a' });
    writeFiles(gitDir, { HEAD: 'ref: refs/heads/main\n', index: 'i', config: '' });
    const port = createNodePort({ root });
    const sent: HostEvent[] = [];
    let calls = 0;
    const wait = waitFor(() => calls >= 2);
    watcher = createFolderWatcher({
      root,
      list: () => port.list(),
      send: (event) => sent.push(event),
    });
    await watcher.ready;
    const stop = watcher.watchNames(gitDir, ['HEAD', 'index'], () => {
      calls += 1;
      wait.poke();
      // The second burst: the index replaced as git does, through index.lock.
      if (calls === 1) {
        writeFileSync(join(gitDir, 'index.lock'), 'i2');
        renameSync(join(gitDir, 'index.lock'), join(gitDir, 'index'));
      }
    });
    writeFileSync(join(gitDir, 'config'), 'not watched');
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/other\n');
    await wait.done;
    expect(calls).toBe(2);
    expect(sent).toEqual([]);
    stop();
    expect(watcher.watched).toBe(1);
  });
});
