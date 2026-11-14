// The folder's listing: git's when the root is in a work tree, a walk otherwise.
// Either way the answer is file paths; folder nodes are derived from them, so an
// empty folder is not listed.

import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { runGit } from './git/run';
import { WALK_LIMIT } from './limits';
import { isGitName, pathProblem } from './paths';

import type { FolderNode } from '@stillpointlab/common-format/app';

/** The name a write's temporary file has, so a listing and the watcher pass over it. */
export const TEMP_NAME = /\.surfaces-tmp-[0-9a-f]{16}$/;

/** One listed path: a file (or a link, which is listed as one), or a folder git lists as one entry. */
export interface ListedPath {
  path: string;
  type: 'blob' | 'tree';
}

/**
 * `git ls-files` in `root`: tracked and untracked files, not ignored ones, with
 * files missing from disk left out. `null` when git fails.
 *
 * A submodule, and a repository nested inside without being one, are each one
 * entry, a folder on disk: they are listed as a folder with nothing under it,
 * which is how git lists them, and not read further.
 */
export async function gitPaths(
  root: string,
  env?: NodeJS.ProcessEnv
): Promise<ListedPath[] | null> {
  const run = await runGit(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    env,
    read: true,
  });
  if (!run.ok) return null;
  // An unmerged path is listed once per stage; a nested repository ends in `/`.
  const names = new Set(
    run.stdout
      .toString('utf8')
      .split('\0')
      .filter((name) => name !== '')
      .map((name) => name.replace(/\/$/, ''))
  );
  const listed: ListedPath[] = [];
  const queue = [...names].filter((name) => listable(name));
  // lstat in batches: tens of thousands at once would open as many requests.
  for (let start = 0; start < queue.length; start += 256) {
    const batch = queue.slice(start, start + 256);
    const found = await Promise.all(
      batch.map(async (path) => {
        try {
          const info = await lstat(join(root, path));
          if (info.isFile() || info.isSymbolicLink()) return { path, type: 'blob' as const };
          if (info.isDirectory()) return { path, type: 'tree' as const };
        } catch {
          // Missing from disk (deleted, not yet staged): left out.
        }
        return null;
      })
    );
    for (const item of found) if (item) listed.push(item);
  }
  return listed;
}

/**
 * Every file under `root`, skipping `.git` and `node_modules`, stopping after
 * `WALK_LIMIT` files. A link is listed as a file and not followed, so a link to a
 * folder cannot walk out of the root or loop.
 */
export async function walkPaths(root: string): Promise<ListedPath[]> {
  const listed: ListedPath[] = [];
  const folders = [''];
  while (folders.length > 0 && listed.length < WALK_LIMIT) {
    const folder = folders.pop() as string;
    let entries;
    try {
      entries = await readdir(join(root, folder), { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
    for (const entry of entries) {
      if (entry.name === 'node_modules' || isGitName(entry.name)) continue;
      const path = folder === '' ? entry.name : `${folder}/${entry.name}`;
      if (!listable(path)) continue;
      if (entry.isDirectory()) folders.push(path);
      else if (entry.isFile() || entry.isSymbolicLink()) listed.push({ path, type: 'blob' });
    }
  }
  return listed.slice(0, WALK_LIMIT);
}

/** A path the port would answer (a name with a backslash, say, is passed over) and not a write's temporary file. */
function listable(path: string): boolean {
  return pathProblem(path) === null && !TEMP_NAME.test(path);
}

/** The listed paths with every folder above them, sorted by path, so a folder comes before what is in it. */
export function toNodes(listed: readonly ListedPath[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  for (const { path, type } of listed) {
    nodes.set(path, { path, type });
    let cut = path.lastIndexOf('/');
    while (cut > 0) {
      const folder = path.slice(0, cut);
      if (nodes.get(folder)?.type === 'tree') break;
      nodes.set(folder, { path: folder, type: 'tree' });
      cut = folder.lastIndexOf('/');
    }
  }
  return [...nodes.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
