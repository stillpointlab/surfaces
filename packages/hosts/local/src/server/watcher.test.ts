import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
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
