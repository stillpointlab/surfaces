// @vitest-environment jsdom
import { expectNoHostileMarkup, hostile } from '@stillpointlab/common-format/testing';
import { afterEach, describe, expect, it } from 'vitest';

import './host-file-tree';
import { treeStyles } from './tree.styles';

import type { HostFileTree, TreeMark } from './host-file-tree';
import type { FolderNode } from '@stillpointlab/common-format/app';

/** Nodes from paths; a trailing slash makes a `tree` node. */
function nodes(...paths: string[]): FolderNode[] {
  return paths.map((path) =>
    path.endsWith('/') ? { path: path.slice(0, -1), type: 'tree' } : { path, type: 'blob' }
  );
}

function mount(paths: string[], marks?: Record<string, TreeMark>): HostFileTree {
  const tree = document.createElement('host-file-tree');
  document.body.append(tree);
  tree.setNodes(nodes(...paths), marks);
  return tree;
}

const items = (tree: HostFileTree): HTMLElement[] => [
  ...tree.shadowRoot!.querySelectorAll<HTMLElement>('[role="treeitem"]'),
];
const shown = (tree: HostFileTree): string[] => items(tree).map((row) => row.dataset.path!);
const item = (tree: HostFileTree, path: string): HTMLElement => {
  const found = items(tree).find((row) => row.dataset.path === path);
  if (!found) throw new Error(`no row for ${path}`);
  return found;
};
const line = (tree: HostFileTree, path: string): HTMLElement =>
  item(tree, path).querySelector<HTMLElement>('.row')!;
const focused = (tree: HostFileTree): string | undefined =>
  (tree.shadowRoot!.activeElement as HTMLElement | null)?.dataset.path;

type Seen = { type: string; detail: Record<string, unknown> };
const TYPES = ['tree-select', 'tree-activate', 'tree-toggle', 'tree-menu'];

/** Every tree event, heard on the document, so each must bubble out of the shadow root. */
function listen(): Seen[] {
  const seen: Seen[] = [];
  for (const type of TYPES) {
    document.addEventListener(type, (event) => {
      expect(event.bubbles && event.composed).toBe(true);
      seen.push({ type, detail: (event as CustomEvent<Record<string, unknown>>).detail });
    });
  }
  return seen;
}

function press(tree: HostFileTree, key: string, init: KeyboardEventInit = {}): void {
  const target = (tree.shadowRoot!.activeElement as HTMLElement | null) ?? items(tree)[0]!;
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init })
  );
}

function click(target: Element, type = 'click', init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

let seen: Seen[] = [];
afterEach(() => {
  document.body.replaceChildren();
  // Listeners from `listen` stay on the document; a fresh array leaves them inert.
  seen = [];
});

describe('rows', () => {
  it('puts folders first, then sorts by name with numbers in order', () => {
    const tree = mount(['b.txt', 'file10.md', 'src/', 'file2.md', 'Zeta/x', 'a/', 'file1.md']);
    expect(shown(tree)).toEqual(['a', 'src', 'Zeta', 'b.txt', 'file1.md', 'file2.md', 'file10.md']);
  });

  it('starts every folder closed and renders no closed folder’s children', () => {
    const tree = mount(['docs/a.md', 'docs/deep/b.md', 'top.md']);
    expect(shown(tree)).toEqual(['docs', 'top.md']);
    expect(item(tree, 'docs').getAttribute('aria-expanded')).toBe('false');
    expect(item(tree, 'docs').querySelector('[role="group"]')!.children).toHaveLength(0);
  });

  it('makes a folder for a path whose folder node is missing, in any order', () => {
    const shuffled = mount(['x/y/z.ts', 'a.md', 'x/w.ts']);
    const ordered = mount(['a.md', 'x/', 'x/w.ts', 'x/y/', 'x/y/z.ts']);
    for (const tree of [shuffled, ordered]) {
      tree.openPaths = ['x', 'x/y'];
      expect(shown(tree)).toEqual(['x', 'x/y', 'x/y/z.ts', 'x/w.ts', 'a.md']);
      expect(item(tree, 'x/y').getAttribute('aria-expanded')).toBe('true');
    }
  });

  it('treats a blob with paths under it as a folder, and skips paths it cannot place', () => {
    const tree = mount(['lib', 'lib/a.ts', '', '/abs', 'trailing/', 'two//slashes']);
    expect(shown(tree)).toEqual(['lib', 'trailing']);
    expect(item(tree, 'lib').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows an empty folder as a folder that opens to nothing', () => {
    const tree = mount(['empty/']);
    line(tree, 'empty').click();
    expect(item(tree, 'empty').getAttribute('aria-expanded')).toBe('true');
    expect(shown(tree)).toEqual(['empty']);
  });
});

describe('open and close', () => {
  it('opens and closes a folder on a click, raising tree-select then tree-toggle', () => {
    seen = listen();
    const tree = mount(['docs/a.md', 'docs/b.md']);
    line(tree, 'docs').click();
    expect(shown(tree)).toEqual(['docs', 'docs/a.md', 'docs/b.md']);
    expect(tree.openPaths).toEqual(['docs']);
    line(tree, 'docs').click();
    expect(shown(tree)).toEqual(['docs']);
    expect(seen).toEqual([
      { type: 'tree-select', detail: { path: 'docs', kind: 'folder' } },
      { type: 'tree-toggle', detail: { path: 'docs', kind: 'folder', open: true } },
      { type: 'tree-toggle', detail: { path: 'docs', kind: 'folder', open: false } },
    ]);
  });

  it('keeps an inner folder open inside one that closes and opens again', () => {
    const tree = mount(['a/b/c.md']);
    tree.openPaths = ['a', 'a/b'];
    line(tree, 'a').click();
    expect(shown(tree)).toEqual(['a']);
    line(tree, 'a').click();
    expect(shown(tree)).toEqual(['a', 'a/b', 'a/b/c.md']);
  });

  it('restores open folders from openPaths without raising events, and drops gone ones', () => {
    seen = listen();
    const tree = mount(['a/x.md', 'b/y.md']);
    tree.openPaths = ['b', 'gone'];
    expect(shown(tree)).toEqual(['a', 'b', 'b/y.md']);
    expect(seen).toEqual([]);
    tree.setNodes(nodes('a/x.md', 'b/y.md', 'c.md'));
    expect(tree.openPaths).toEqual(['b']);
    tree.setNodes(nodes('a/x.md'));
    expect(tree.openPaths).toEqual([]);
  });
});

describe('keys', () => {
  const paths = ['docs/a.md', 'docs/sub/b.md', 'readme.md', 'z.md'];

  it('Down, Up, Home and End move the cursor and select', () => {
    seen = listen();
    const tree = mount(paths);
    items(tree)[0]!.focus();
    press(tree, 'ArrowDown'); // no cursor yet: the first row
    press(tree, 'ArrowDown');
    expect(tree.selected).toBe('readme.md');
    press(tree, 'End');
    expect(tree.selected).toBe('z.md');
    press(tree, 'ArrowDown'); // the last row stays, and raises nothing
    press(tree, 'ArrowUp');
    expect(tree.selected).toBe('readme.md');
    press(tree, 'Home');
    expect(tree.selected).toBe('docs');
    expect(focused(tree)).toBe('docs');
    expect(seen.map((event) => event.detail.path)).toEqual([
      'docs',
      'readme.md',
      'z.md',
      'readme.md',
      'docs',
    ]);
  });

  it('Right opens a folder, then moves to its first child; Left closes, then moves up', () => {
    const tree = mount(paths);
    tree.selected = 'docs';
    item(tree, 'docs').focus();
    press(tree, 'ArrowRight');
    expect(item(tree, 'docs').getAttribute('aria-expanded')).toBe('true');
    expect(tree.selected).toBe('docs');
    press(tree, 'ArrowRight');
    expect(tree.selected).toBe('docs/sub');
    press(tree, 'ArrowRight'); // opens docs/sub
    press(tree, 'ArrowRight');
    expect(tree.selected).toBe('docs/sub/b.md');
    press(tree, 'ArrowRight'); // a file: nothing
    expect(tree.selected).toBe('docs/sub/b.md');
    press(tree, 'ArrowLeft'); // a file: to its parent
    expect(tree.selected).toBe('docs/sub');
    press(tree, 'ArrowLeft'); // open: close it
    expect(item(tree, 'docs/sub').getAttribute('aria-expanded')).toBe('false');
    press(tree, 'ArrowLeft');
    expect(tree.selected).toBe('docs');
    press(tree, 'ArrowLeft');
    press(tree, 'ArrowLeft'); // a closed top-level folder: nowhere to go
    expect(tree.selected).toBe('docs');
    expect(shown(tree)).toEqual(['docs', 'readme.md', 'z.md']);
    expect(focused(tree)).toBe('docs');
  });

  it('Enter activates a file and opens or closes a folder', () => {
    seen = listen();
    const tree = mount(paths);
    tree.selected = 'readme.md';
    item(tree, 'readme.md').focus();
    press(tree, 'Enter');
    tree.selected = 'docs';
    press(tree, 'Enter');
    press(tree, 'Enter');
    expect(seen).toEqual([
      { type: 'tree-activate', detail: { path: 'readme.md', kind: 'file' } },
      { type: 'tree-toggle', detail: { path: 'docs', kind: 'folder', open: true } },
      { type: 'tree-toggle', detail: { path: 'docs', kind: 'folder', open: false } },
    ]);
  });

  it('leaves modified keys to the browser', () => {
    const tree = mount(paths);
    items(tree)[0]!.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    items(tree)[0]!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(tree.selected).toBeNull();
  });

  it('keeps one tab stop: the selected row, or the first row when it is hidden', () => {
    const tree = mount(paths);
    const stops = (): string[] =>
      items(tree)
        .filter((row) => row.tabIndex === 0)
        .map((row) => row.dataset.path!);
    expect(stops()).toEqual(['docs']);
    tree.selected = 'readme.md';
    expect(stops()).toEqual(['readme.md']);
    tree.reveal('docs/sub/b.md');
    expect(stops()).toEqual(['docs/sub/b.md']);
    line(tree, 'docs').click(); // hides the selection
    expect(stops()).toEqual(['docs']);
  });
});

describe('events', () => {
  it('a double click activates the row the first click selected', () => {
    seen = listen();
    const tree = mount(['a.md', 'b.md']);
    const row = line(tree, 'b.md');
    click(row, 'click', { detail: 1 });
    click(row, 'click', { detail: 2 });
    click(row, 'dblclick', { detail: 2 });
    expect(line(tree, 'b.md')).toBe(row); // not replaced, so the browser's dblclick fires
    expect(seen).toEqual([
      { type: 'tree-select', detail: { path: 'b.md', kind: 'file' } },
      { type: 'tree-activate', detail: { path: 'b.md', kind: 'file' } },
    ]);
  });

  it('a double click on a folder opens and closes it, and activates nothing', () => {
    seen = listen();
    const tree = mount(['docs/a.md']);
    const row = line(tree, 'docs');
    row.click();
    row.click();
    click(row, 'dblclick');
    expect(seen.map((event) => event.type)).toEqual(['tree-select', 'tree-toggle', 'tree-toggle']);
  });

  it('asks for a menu on a right click, at the pointer, without selecting', () => {
    seen = listen();
    const tree = mount(['docs/a.md', 'b.md']);
    const event = click(line(tree, 'b.md'), 'contextmenu', { clientX: 40, clientY: 70 });
    expect(event.defaultPrevented).toBe(true);
    expect(seen).toEqual([
      { type: 'tree-menu', detail: { path: 'b.md', kind: 'file', x: 40, y: 70 } },
    ]);
    expect(tree.selected).toBeNull();
  });

  it('asks for the served folder’s menu on the empty space under the rows', () => {
    seen = listen();
    const tree = mount(['b.md']);
    click(tree.shadowRoot!.querySelector('[role="tree"]')!, 'contextmenu', {
      clientX: 5,
      clientY: 300,
    });
    expect(seen).toEqual([
      { type: 'tree-menu', detail: { path: '', kind: 'folder', x: 5, y: 300 } },
    ]);
  });

  it('asks for a menu with the ContextMenu key and Shift+F10, once each', () => {
    seen = listen();
    const tree = mount(['docs/a.md', 'b.md']);
    item(tree, 'docs').focus();
    press(tree, 'ContextMenu');
    // The browser follows the key with a contextmenu event of its own; it is dropped.
    click(item(tree, 'docs'), 'contextmenu');
    press(tree, 'F10', { shiftKey: true });
    press(tree, 'F10'); // F10 alone is the browser's
    expect(seen.map((event) => [event.type, event.detail.path, event.detail.kind])).toEqual([
      ['tree-menu', 'docs', 'folder'],
      ['tree-menu', 'docs', 'folder'],
    ]);
    // A right click after a pointer press is heard again.
    click(line(tree, 'b.md'), 'pointerdown');
    click(line(tree, 'b.md'), 'contextmenu');
    expect(seen).toHaveLength(3);
  });

  it('asks for a menu from the row’s own button, which is not a tab stop', () => {
    seen = listen();
    const tree = mount(['b.md']);
    const button = line(tree, 'b.md').querySelector<HTMLButtonElement>('button.menu')!;
    expect(button.tabIndex).toBe(-1);
    button.click();
    expect(seen).toEqual([
      { type: 'tree-menu', detail: { path: 'b.md', kind: 'file', x: 0, y: 0 } },
    ]);
    expect(tree.selected).toBeNull();
    expect(focused(tree)).toBe('b.md');
  });

  it('does not raise tree-select again for a click on the selected row', () => {
    seen = listen();
    const tree = mount(['a.md']);
    line(tree, 'a.md').click();
    line(tree, 'a.md').click();
    expect(seen).toHaveLength(1);
  });

  it('selects through the property without an event', () => {
    seen = listen();
    const tree = mount(['a.md', 'b.md']);
    tree.selected = 'b.md';
    expect(item(tree, 'b.md').getAttribute('aria-selected')).toBe('true');
    tree.selected = null;
    expect(item(tree, 'b.md').getAttribute('aria-selected')).toBe('false');
    expect(seen).toEqual([]);
  });
});

describe('marks', () => {
  const marks: Record<string, TreeMark> = {
    'src/deep/changed.ts': { status: 'changed' },
    'src/new.ts': { status: 'new' },
    'moved.md': { status: 'moved' },
    'gone/removed.md': { status: 'deleted' },
    'src/plain.ts': {},
  };

  it('shows a letter with a title on a marked row', () => {
    const tree = mount(['src/deep/changed.ts', 'src/new.ts', 'src/plain.ts', 'moved.md'], marks);
    tree.reveal('src/deep/changed.ts');
    const status = (path: string): [string, string] | null => {
      const span = line(tree, path).querySelector('.status');
      return span ? [span.textContent!, span.getAttribute('title')!] : null;
    };
    expect(status('src/deep/changed.ts')).toEqual(['M', 'Changed']);
    expect(status('src/new.ts')).toEqual(['N', 'New']);
    expect(status('moved.md')).toEqual(['R', 'Moved']);
    expect(status('src/plain.ts')).toBeNull();
  });

  it('rolls a status up to every folder above it as a dot, even for a path not listed', () => {
    const tree = mount(['src/deep/changed.ts', 'src/new.ts', 'gone/kept.md', 'other/x.md'], marks);
    tree.reveal('src/deep/changed.ts');
    const dotted = items(tree)
      .filter((row) => row.firstElementChild!.querySelector('.dot'))
      .map((row) => row.dataset.path);
    expect(dotted).toEqual(['gone', 'src', 'src/deep']);
  });

  it('shows a folder’s own status as a letter rather than a dot', () => {
    const tree = mount(['vendor/lib.js'], {
      vendor: { status: 'new' },
      'vendor/lib.js': { status: 'new' },
    });
    expect(line(tree, 'vendor').querySelector('.status')!.textContent).toBe('N');
    expect(line(tree, 'vendor').querySelector('.dot')).toBeNull();
  });
});

describe('app rows', () => {
  const app = (unlocked?: boolean): TreeMark => ({
    app: { label: 'Release board', icon: 'task', ...(unlocked ? { unlocked } : {}) },
  });

  it('shows a locked app as a leaf with its icon and label, raising kind app', () => {
    seen = listen();
    const tree = mount(['tasks/', 'readme.md'], { tasks: app() });
    const row = item(tree, 'tasks');
    expect(row.hasAttribute('aria-expanded')).toBe(false);
    expect(row.querySelector('.name')!.textContent).toBe('Release board');
    const icon = row.querySelector('spl-icon.app-icon')!;
    expect(icon.getAttribute('icon-name')).toBe('task');
    expect(icon.hasAttribute('inert')).toBe(true);
    expect(row.querySelector('.unlocked')).toBeNull();
    line(tree, 'tasks').click();
    press(tree, 'Enter');
    press(tree, 'ArrowRight');
    expect(seen).toEqual([
      { type: 'tree-select', detail: { path: 'tasks', kind: 'app' } },
      { type: 'tree-activate', detail: { path: 'tasks', kind: 'app' } },
    ]);
  });

  it('opens an unlocked app with children like a folder, with its own mark', () => {
    seen = listen();
    const tree = mount(['tasks/manifest.yml', 'tasks/todo/a.md'], { tasks: app(true) });
    const row = item(tree, 'tasks');
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(row.querySelector('.unlocked')!.textContent).toBe('unlocked');
    line(tree, 'tasks').click(); // selects, and does not toggle: the row opens the app
    expect(shown(tree)).toEqual(['tasks']);
    press(tree, 'ArrowRight');
    expect(shown(tree)).toEqual(['tasks', 'tasks/todo', 'tasks/manifest.yml']);
    press(tree, 'Enter');
    line(tree, 'tasks').querySelector<HTMLElement>('.twisty')!.click();
    expect(shown(tree)).toEqual(['tasks']);
    expect(seen.map((event) => [event.type, event.detail.kind, event.detail.open])).toEqual([
      ['tree-select', 'app', undefined],
      ['tree-toggle', 'app', true],
      ['tree-activate', 'app', undefined],
      ['tree-toggle', 'app', false],
    ]);
  });
});

describe('reveal', () => {
  it('opens every folder above the path, selects it and scrolls it into view', () => {
    seen = listen();
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      const tree = mount(['a/b/c/d.md', 'a/e.md', 'f.md']);
      tree.reveal('a/b/c/d.md');
      expect(shown(tree)).toEqual(['a', 'a/b', 'a/b/c', 'a/b/c/d.md', 'a/e.md', 'f.md']);
      expect(tree.selected).toBe('a/b/c/d.md');
      expect(item(tree, 'a/b/c/d.md').getAttribute('aria-selected')).toBe('true');
      expect(scrolled).toEqual([line(tree, 'a/b/c/d.md')]);
      // A host call: the folders it opens are toggles, and the selection is not an event.
      expect(seen.map((event) => [event.type, event.detail.path])).toEqual([
        ['tree-toggle', 'a'],
        ['tree-toggle', 'a/b'],
        ['tree-toggle', 'a/b/c'],
      ]);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

describe('setNodes with the same paths', () => {
  const paths = ['docs/a.md', 'docs/b.md', 'readme.md'];

  it('keeps the open folders, the selection and real focus, with or without a re-render', () => {
    const tree = mount(paths);
    tree.reveal('docs/b.md');
    item(tree, 'docs/b.md').focus();
    const before = item(tree, 'docs/b.md');

    tree.setNodes(nodes(...[...paths].reverse())); // same rows: nothing to render
    expect(item(tree, 'docs/b.md')).toBe(before);

    tree.setNodes(nodes(...paths), { 'docs/b.md': { status: 'changed' } }); // a new mark: rendered again
    const after = item(tree, 'docs/b.md');
    expect(after).not.toBe(before);
    expect(tree.openPaths).toEqual(['docs']);
    expect(tree.selected).toBe('docs/b.md');
    expect(after.getAttribute('aria-selected')).toBe('true');
    expect(after.tabIndex).toBe(0);
    expect(document.activeElement).toBe(tree);
    expect(tree.shadowRoot!.activeElement).toBe(after);
  });

  it('gives focus to the tab stop when the focused row is gone', () => {
    const tree = mount(paths);
    item(tree, 'readme.md').focus();
    tree.selected = 'readme.md';
    tree.setNodes(nodes('docs/a.md'));
    expect(tree.selected).toBe('readme.md'); // kept, so a path that comes back is selected again
    expect(document.activeElement).toBe(tree);
    expect(focused(tree)).toBe('docs');
  });

  it('does not take focus it did not have', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const tree = mount(paths);
    tree.selected = 'readme.md';
    outside.focus();
    tree.setNodes(nodes(...paths), { 'readme.md': { status: 'new' } });
    expect(document.activeElement).toBe(outside);
  });
});

describe('ARIA', () => {
  it('has a tree of treeitems and groups, with levels, and follows the state', () => {
    const tree = mount(['a/b/c.md', 'd.md']);
    const root = tree.shadowRoot!.querySelector('[role="tree"]')!;
    expect(root.getAttribute('aria-label')).toBe('Files');
    tree.openPaths = ['a', 'a/b'];
    expect(items(tree).map((row) => row.getAttribute('aria-level'))).toEqual(['1', '2', '3', '1']);
    expect(item(tree, 'a/b/c.md').parentElement!.getAttribute('role')).toBe('group');
    expect(item(tree, 'd.md').hasAttribute('aria-expanded')).toBe(false);
    expect(items(tree).every((row) => row.getAttribute('aria-selected') === 'false')).toBe(true);
    item(tree, 'a').focus();
    tree.selected = 'a';
    press(tree, 'ArrowLeft');
    expect(item(tree, 'a').getAttribute('aria-expanded')).toBe('false');
    press(tree, 'ArrowDown');
    expect(item(tree, 'a').getAttribute('aria-selected')).toBe('false');
    expect(item(tree, 'd.md').getAttribute('aria-selected')).toBe('true');
  });
});

describe('hostile names', () => {
  const names = [
    '<img src=x onerror=alert(1)><b>bold.md',
    '   ',
    `${'long-name-'.repeat(40)}.md`,
    'מסמך-בעברית.md',
    '&amp;.md',
    '&lt;script&gt;',
    '__proto__',
    'constructor',
  ];

  it('renders every name as its text and keys paths without the prototype', () => {
    const paths = [
      ...names.map((name) => `odd/${name}`),
      '__proto__/constructor/x.md',
      'constructor/y.md',
    ];
    const marks = Object.fromEntries([
      ['__proto__/constructor/x.md', { status: 'changed' }],
      ['odd/<img src=x onerror=alert(1)><b>bold.md', { status: 'new' }],
      ['constructor', { app: { label: '<img src=x>', icon: 'inventory' } }],
    ]) as Record<string, TreeMark>;
    const tree = mount(paths, marks);
    tree.openPaths = ['odd', '__proto__', '__proto__/constructor'];
    expect(shown(tree)).toContain('__proto__/constructor/x.md');
    for (const name of names) {
      expect(line(tree, `odd/${name}`).querySelector('.name')!.textContent).toBe(name);
    }
    expect(
      line(tree, 'odd/<img src=x onerror=alert(1)><b>bold.md').querySelector('b, img')
    ).toBeNull();
    expect(line(tree, '__proto__/constructor/x.md').querySelector('.status')!.textContent).toBe(
      'M'
    );
    expect(line(tree, '__proto__').querySelector('.dot')).not.toBeNull();
    expect(line(tree, 'constructor').querySelector('.name')!.textContent).toBe('<img src=x>');
    expect(tree.shadowRoot!.querySelector('img')).toBeNull();
    expect(Object.prototype).not.toHaveProperty('status');
  });

  it('lets no payload in a path, a label or an icon become markup', () => {
    const paths = hostile(['a/b.md', 'c/', 'd.md']);
    const marks = Object.fromEntries([
      [paths[0]!, { status: 'changed' as const }],
      [paths[2]!, hostile({ app: { label: 'App', icon: 'task', unlocked: true } })],
    ]);
    const tree = mount(paths, marks);
    tree.openPaths = [paths[0]!.slice(0, paths[0]!.indexOf('/'))];
    expect(items(tree)).toHaveLength(4);
    expectNoHostileMarkup(tree);
  });
});

describe('scale', () => {
  it('lists 20,000 paths and opens a folder of 2,000 without rendering closed folders', () => {
    const paths: string[] = [];
    for (let i = 0; i < 18000; i++) paths.push(`pkg${i % 90}/src/mod${i % 7}/file${i}.ts`);
    for (let i = 0; i < 2000; i++) paths.push(`big/file${i}.ts`);
    const tree = document.createElement('host-file-tree');
    document.body.append(tree);
    tree.setNodes(nodes(...paths));
    expect(items(tree)).toHaveLength(91);
    line(tree, 'big').click();
    expect(items(tree)).toHaveLength(2091);
    expect(shown(tree).slice(1, 4)).toEqual(['big/file0.ts', 'big/file1.ts', 'big/file2.ts']);
  });
});

describe('styles', () => {
  it('starts with the :host rule, with no byte order mark to break it', () => {
    // Sass puts a BOM before a stylesheet holding a character outside ASCII, and in
    // a <style>'s text that BOM becomes part of the first selector.
    expect(treeStyles.startsWith(':host{')).toBe(true);
  });
});
