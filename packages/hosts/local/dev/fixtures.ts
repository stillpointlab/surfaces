// The local host's explorer tree in the surfaces harness (`npm run dev`, then pick
// `local`). Each fixture hands the tree a list of paths and marks, as the host page
// will. The tree's events show in the harness's event log.
import '../src/client/tree/host-file-tree';

import type { HarnessElements, HarnessFormat } from '../../../../tooling/harness/types';
import type { HostFileTree, TreeMark } from '../src/client/tree/host-file-tree';
import type { FolderNode } from '@stillpointlab/common-format/app';

const TAG = 'host-file-tree';

/** Paths to nodes; a trailing slash makes a folder node, and some folders have none. */
function nodes(paths: readonly string[]): FolderNode[] {
  return paths.map((path) =>
    path.endsWith('/') ? { path: path.slice(0, -1), type: 'tree' } : { path, type: 'blob' }
  );
}

/** The tree, sized to a column as the host page will. */
function tree(elements: HarnessElements): HostFileTree {
  const el = elements.extras[TAG] as HostFileTree;
  el.style.maxWidth = '320px'; // the harness's pane gives it a height
  return el;
}

function show(paths: readonly string[], marks: Record<string, TreeMark> = {}, open: string[] = []) {
  return (elements: HarnessElements): void => {
    const el = tree(elements);
    el.openPaths = [];
    el.selected = null;
    el.setNodes(nodes(paths), marks);
    el.openPaths = open;
  };
}

const small = ['README.md', 'package.json', 'src/', 'src/index.ts', 'src/util.ts', 'docs/guide.md'];

const deep = [
  'a/b/c/d/e/f/g/h/deepest.md',
  'a/b/c/d/e/f/g/sibling.md',
  'a/b/c/note.md',
  'a/top.md',
  ...Array.from({ length: 30 }, (_, i) => `a/b/many/item${i + 1}.md`),
];

const statuses: Record<string, TreeMark> = {
  'src/index.ts': { status: 'changed' },
  'src/new-file.ts': { status: 'new' },
  'docs/renamed.md': { status: 'moved' },
  'docs/old/removed.md': { status: 'deleted' },
  'package.json': { status: 'changed' },
};

const apps: Record<string, TreeMark> = {
  'boards/release': { app: { label: 'Release board', icon: 'task' } },
  'stock/shelf': { app: { label: 'Shelf inventory', icon: 'inventory', unlocked: true } },
  'stock/shelf/zones/a.md': { status: 'changed' },
};

const hostileNames = [
  '<img src=x onerror=alert(1)><b>markup.md',
  '   ',
  `${'a-very-long-file-name-'.repeat(8)}end.md`,
  'שלום-עולם.md',
  'مرحبا.txt',
  '&amp;.md',
  '&lt;b&gt;not bold',
  '__proto__',
  'constructor',
];

/** A large folder in a realistic shape: packages, sources and tests, many times over. */
function large(): string[] {
  const paths: string[] = [];
  for (let i = 0; paths.length < 18000; i++) {
    const pkg = `packages/pkg${i % 120}`;
    paths.push(
      `${pkg}/src/module${i}.ts`,
      `${pkg}/src/module${i}.test.ts`,
      `${pkg}/docs/note${i}.md`
    );
  }
  for (let i = 0; i < 2000; i++) paths.push(`generated/file${i}.json`);
  return paths;
}

export default {
  elements: { extra: [TAG] },
  fixtures: {
    'Small folder': { content: '', apply: show(small) },
    'Deep folder': {
      content: '',
      apply: (elements) => {
        show(deep)(elements);
        tree(elements).reveal('a/b/c/d/e/f/g/h/deepest.md');
      },
    },
    Statuses: {
      content: '',
      apply: show([...small, 'src/new-file.ts', 'docs/renamed.md', 'docs/old/kept.md'], statuses, [
        'src',
        'docs',
      ]),
    },
    'Apps, locked and unlocked': {
      content: '',
      apply: show(
        ['boards/release/', 'stock/shelf/manifest.yml', 'stock/shelf/zones/a.md', 'stock/notes.md'],
        apps,
        ['boards', 'stock', 'stock/shelf']
      ),
    },
    'Hostile names': {
      content: '',
      apply: show(
        [
          ...hostileNames.map((name) => `odd/${name}`),
          '__proto__/constructor/inner.md',
          `${'deep-folder-'.repeat(6)}/x.md`,
        ],
        Object.fromEntries([
          ['odd/__proto__', { status: 'changed' }],
          ['odd/constructor', { app: { label: '<script>alert(1)</script>', icon: 'task' } }],
        ]) as Record<string, TreeMark>,
        ['odd', '__proto__', '__proto__/constructor']
      ),
    },
    'Large: 20,000 paths': { content: '', apply: show(large()) },
  },
} satisfies HarnessFormat;
