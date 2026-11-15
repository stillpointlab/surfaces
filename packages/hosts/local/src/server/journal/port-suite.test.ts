// The storage port suite over a port the journal makes: the journal changes
// nothing a writer can see. Once over the memory port, and once over the node
// port in a committed repository, with git's index.

import { join } from 'node:path';

import { createMemoryPort } from '@stillpointlab/common-format/host';
import { describeStoragePort } from '@stillpointlab/common-format/testing/host';
import { afterEach } from 'vitest';

import { createNodePort } from '../port';
import { git, gitEnv, tempFolder, writeFiles } from '../test-support';

import { createJournal } from './journal';

const folders: ReturnType<typeof tempFolder>[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) folder.cleanup();
});

describeStoragePort('the journal over the memory port', (files) =>
  createJournal({ port: createMemoryPort(files) }).port('A step')
);

describeStoragePort('the journal over the node port', (files) => {
  const folder = tempFolder();
  folders.push(folder);
  const env = gitEnv(folder.path);
  const root = join(folder.path, 'repository');
  writeFiles(root, files);
  git(folder.path, env, 'init', '-q', root);
  git(root, env, 'add', '-A');
  git(root, env, 'commit', '-q', '--allow-empty', '-m', 'the files as made');
  const port = createNodePort({ root, env, warn: () => undefined });
  return createJournal({ port, index: port.index }).port('A step');
});
