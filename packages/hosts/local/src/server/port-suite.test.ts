// The storage port suite (`common-format/testing/host`) over the node port: a
// repository in a temporary folder per test, its files committed, so the
// port's statuses are git's. The memory port runs the same suite in `common`.

import { join } from 'node:path';

import { describeStoragePort } from '@stillpointlab/common-format/testing/host';
import { afterEach } from 'vitest';

import { createNodePort } from './port';
import { git, gitEnv, tempFolder, writeFiles } from './test-support';

const folders: ReturnType<typeof tempFolder>[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) folder.cleanup();
});

describeStoragePort('the node port', (files) => {
  const folder = tempFolder();
  folders.push(folder);
  const env = gitEnv(folder.path);
  const root = join(folder.path, 'repository');
  writeFiles(root, files);
  git(folder.path, env, 'init', '-q', root);
  git(root, env, 'add', '-A');
  git(root, env, 'commit', '-q', '--allow-empty', '-m', 'the files as made');
  return createNodePort({ root, env, warn: () => undefined });
});
