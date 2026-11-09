// The example inventories in dev/examples/, as the files a host would hand the
// core: each folder is a repository holding one inventory. The harness's host
// keeps them in memory, so what an op changes lasts until the page reloads.
import type { InventorySnapshot } from '../src/space.js';

const files = import.meta.glob<string>('./examples/**/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The examples: a configured (version 2) workshop and a legacy (version 1) house. */
export type ExampleName = 'workshop' | 'house';

/** Where each example sits in its imagined repository. */
const SPACE_PATHS: Record<ExampleName, string> = { workshop: 'workshop', house: '' };

/** One example as a snapshot: every file readable, nothing else in the repository. */
export function exampleSnapshot(name: ExampleName): InventorySnapshot {
  const prefix = `./examples/${name}/`;
  const spacePath = SPACE_PATHS[name];
  const repoPath = (file: string): string =>
    `${spacePath === '' ? '' : `${spacePath}/`}${file.slice(prefix.length)}`;
  const contents: Record<string, string> = {};
  for (const [file, content] of Object.entries(files)) {
    if (file.startsWith(prefix)) contents[repoPath(file)] = content;
  }
  return {
    manifestPath: repoPath(`${prefix}inventory.yaml`),
    paths: Object.keys(contents).sort(),
    files: contents,
  };
}
