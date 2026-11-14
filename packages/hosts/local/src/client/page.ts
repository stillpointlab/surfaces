// The local host's page: the explorer on the left, the pane on the right, the
// address in the fragment, and the host's events. Everything reaches the server
// through the `HostClient` it is given.
//
// The wiring, for the specs that build on it:
// - `tree-select` and `tree-activate` open files; `tree-toggle` keeps the open
//   folders; `tree-menu` opens the host's menu (`menu/`) with the row's entries
//   from `file-ops/`, in `wire`. Another kind of row adds its entries there.
// - `menu` is the page's one options menu: anything that asks for a menu opens
//   it with `menu.open({ x, y, entries })`.
// - `navigate` is the one way to open something: it asks before unsaved edits are
//   lost, writes the address, and tells the pane. A new view (`#/diff/<path>`) is
//   an entry in `address.ts` and a case in the pane.
// - `refresh` lists the folder again, as a `listed` event does.
// - git: the page asks `client.git()` once. In `repository` the statuses mark the
//   tree and tell the pane which files offer the Changes view (`statusOf`); a
//   `status` event reads them again. In `no-git` the explorer's note says git was
//   not found. Outside `repository` nothing calls the git routes. The Commit
//   button (step 2 of git-in-the-host) goes in `.explorer-header`.

import '@stillpointlab/modal-dialog-component';
import { fileNameOf } from '@stillpointlab/common-format/format';
import { html, render } from '@stillpointlab/common-format/html';

import { formatAddress, parseAddress } from './address';
import { createConfirm } from './confirm';
import { createFileOps } from './file-ops/file-ops';
import { indexListing } from './file-ops/paths';
import { HostMenu } from './menu/menu';
import { pageStyles } from './page.styles';
import { FilePane } from './pane';
import { readOpenFolders, writeOpenFolders } from './stored';
import './tree/host-file-tree';
import { words } from './words';

import type { Address, View } from './address';
import type { Confirm } from './confirm';
import type { FileOps } from './file-ops/file-ops';
import type { HostClient, HostEvent, HostGit } from './host-client';
import type { PaneState } from './pane';
import type {
  HostFileTree,
  TreeEventDetail,
  TreeMark,
  TreeMenuDetail,
} from './tree/host-file-tree';
import type { FolderNode } from '@stillpointlab/common-format/app';
import type { FormatDescriptor, FormatRegistry } from '@stillpointlab/common-format/format';
import type { FileStatus } from '@stillpointlab/common-format/host';

export interface PageOptions {
  client: HostClient;
  registry: FormatRegistry;
  /** What must happen before a format's element mounts (md's sanitizing renderer). */
  prepare?: (format: FormatDescriptor) => Promise<void>;
  /** Where the page renders: `document.body` by default. */
  root?: HTMLElement;
  /** The Changes view's element: `<code-diff>` by default (a test hands a fake). */
  diff?: { tag: string; load(): Promise<unknown> };
}

export interface HostPage {
  readonly tree: HostFileTree;
  readonly pane: FilePane;
  readonly confirm: Confirm;
  /** The page's one options menu. */
  readonly menu: HostMenu;
  /** Create, rename and delete: the explorer's entries, dialogs and writes. */
  readonly fileOps: FileOps;
  /** Settles once the first listing and the first address have been handled. */
  readonly ready: Promise<void>;
  /** Open what an address names, asking first when edits would be lost; false if declined. */
  navigate(address: Address | null, how?: 'push' | 'replace'): Promise<boolean>;
  /** List the folder again. */
  refresh(): Promise<void>;
  /** Stop listening to the host and the window. */
  destroy(): void;
}

/** The history entries the page writes carry their place, so a declined Back can be undone. */
interface EntryState {
  surfacesIndex: number;
}

function indexOf(state: unknown): number | null {
  const index = (state as Partial<EntryState> | null)?.surfacesIndex;
  return typeof index === 'number' ? index : null;
}

let styled = false;

export function startPage(options: PageOptions): HostPage {
  const { client, registry } = options;
  const host = options.root ?? document.body;
  if (!styled) {
    styled = true;
    const style = document.createElement('style');
    style.textContent = pageStyles;
    document.head.append(style);
  }

  render(
    host,
    html`<div class="host-page"><nav class="explorer" aria-label="${words.explorer}"><header class="explorer-header"><span class="explorer-name"></span></header><p class="explorer-note" hidden></p><host-file-tree></host-file-tree></nav><main class="pane"></main></div>`
  );
  const tree = host.querySelector('host-file-tree') as HostFileTree;
  const rootName = host.querySelector<HTMLElement>('.explorer-name')!;
  const note = host.querySelector<HTMLElement>('.explorer-note')!;
  const confirm = createConfirm(host);
  const controller = new AbortController();
  const { signal } = controller;

  let rootId: string | null = null;
  let folderName = '';
  let nodes: FolderNode[] = [];
  let truncated = false;
  let listingIndex: ReturnType<typeof indexListing> | null = null;
  /** The folder's git, once asked; `null` until then, or if the host could not say. */
  let git: HostGit | null = null;
  /** The last statuses read, by path. */
  let statuses: Record<string, FileStatus> = {};
  /** The explorer's note: one line each for git and the listing. */
  const notes: { git: string | null; list: string | null } = { git: null, list: null };

  const pane: FilePane = new FilePane(host.querySelector<HTMLElement>('.pane')!, {
    client,
    registry,
    confirm,
    prepare: options.prepare,
    diff: options.diff,
    onViewRequest: (view, how = 'push') => {
      const current = pane.current;
      if (current) void navigate({ path: current.path, view }, how);
    },
    statusOf: (path) =>
      git?.state === 'repository' && Object.hasOwn(statuses, path) ? statuses[path] : undefined,
    onState: showState,
  });

  function showNote(): void {
    const lines = [notes.git, notes.list].filter((line): line is string => line !== null);
    note.hidden = lines.length === 0;
    render(
      note,
      html`${lines.map((line) => html`<span class="explorer-note-line">${line}</span>`)}`
    );
  }

  // ---- the address ----

  let index = indexOf(history.state) ?? 0;
  history.replaceState({ ...(history.state as object | null), surfacesIndex: index }, '');
  /** The next `popstate` is the page undoing a declined Back or Forward. */
  let undoing = false;

  function writeAddress(address: Address | null, how: 'push' | 'replace'): void {
    const hash = address ? formatAddress(address) : '';
    const url = hash === '' ? location.pathname + location.search : hash;
    if (location.hash === hash) return;
    // While an open is still running its entry is replaced, not stacked: holding
    // an arrow key in the tree leaves one entry, not one per row.
    if (how === 'push' && !pane.busy) {
      index += 1;
      history.pushState({ surfacesIndex: index } satisfies EntryState, '', url);
    } else {
      history.replaceState({ surfacesIndex: index } satisfies EntryState, '', url);
    }
  }

  async function navigate(
    address: Address | null,
    how: 'push' | 'replace' = 'push',
    focus = false
  ): Promise<boolean> {
    const current = pane.current;
    const same =
      address !== null &&
      current !== null &&
      current.path === address.path &&
      current.view === pane.viewFor(address.path, address.view);
    if (!same && !(await pane.confirmLeave())) return false;
    writeAddress(
      address ? { ...address, view: pane.viewFor(address.path, address.view) } : null,
      how
    );
    if (address) void pane.open(address.path, address.view, { focus });
    else pane.close();
    return true;
  }

  async function onPopState(event: PopStateEvent): Promise<void> {
    if (undoing) {
      undoing = false;
      return;
    }
    const address = parseAddress(location.hash);
    const current = pane.current;
    const same =
      address !== null &&
      current !== null &&
      current.path === address.path &&
      current.view === pane.viewFor(address.path, address.view);
    if (!same && !(await pane.confirmLeave())) {
      // Put the address back where it was.
      const at = indexOf(event.state);
      if (at !== null && at !== index) {
        undoing = true;
        history.go(index - at);
      } else if (current) {
        history.replaceState(
          { surfacesIndex: index } satisfies EntryState,
          '',
          formatAddress(current)
        );
      }
      return;
    }
    const at = indexOf(event.state);
    if (at === null) {
      // An address typed by hand: a new entry the page had not stamped.
      index += 1;
      history.replaceState({ surfacesIndex: index } satisfies EntryState, '');
    } else {
      index = at;
    }
    if (address) {
      tree.reveal(address.path);
      void openAddress(address);
    } else {
      pane.close();
    }
  }

  /** Open what the address already names, saying so when the format has no editor. */
  function openAddress(address: Address): Promise<void> {
    const view = pane.viewFor(address.path, address.view);
    if (view !== address.view) writeAddress({ path: address.path, view }, 'replace');
    return pane.open(address.path, view);
  }

  /** Keep the title and the address in step with what the pane shows. */
  function showState(state: PaneState | null): void {
    const name = state ? `${state.dirty ? '● ' : ''}${fileNameOf(state.path)} — ` : '';
    document.title = `${name}${folderName || 'Surfaces'}`;
    // An editor-less format opens in its preview: the address says so.
    const address = parseAddress(location.hash);
    if (state && !pane.busy && address?.path === state.path && address.view !== state.view) {
      writeAddress({ path: state.path, view: state.view }, 'replace');
    }
  }

  // ---- the tree ----

  let listing: Promise<void> | null = null;
  let listAgain = false;

  /** List the folder and its statuses into the tree; one listing at a time. */
  async function refresh(): Promise<void> {
    if (listing) {
      listAgain = true;
      return listing;
    }
    listing = (async () => {
      do {
        listAgain = false;
        try {
          const [list, status] = await Promise.all([client.list(), client.status()]);
          nodes = list.nodes;
          truncated = list.truncated;
          listingIndex = null;
          statuses = status;
          tree.setNodes(nodes, marksOf(status));
          notes.list = list.truncated ? words.explorerTruncated(nodes.length) : null;
          pane.statusChanged();
        } catch (error) {
          notes.list = words.explorerFailed(String(error));
        }
        showNote();
      } while (listAgain);
    })().finally(() => (listing = null));
    return listing;
  }

  /**
   * Statuses only, for a change that leaves the paths as they were; `head` when
   * git's `HEAD` or index moved, so the Changes view reads its two sides again.
   */
  async function refreshMarks(head = false): Promise<void> {
    try {
      statuses = await client.status();
      tree.setNodes(nodes, marksOf(statuses));
      pane.statusChanged({ head });
    } catch {
      // the next listing tries again
    }
  }

  function marksOf(status: Record<string, TreeMark['status']>): Record<string, TreeMark> {
    // Own properties only, so a path named `__proto__` is a path like any other.
    return Object.fromEntries(
      Object.entries(status).map(([path, mark]) => [path, { status: mark }])
    );
  }

  function onHostEvent(event: HostEvent): void {
    if (event.type === 'listed') {
      void refresh();
    } else if (event.type === 'changed') {
      void pane.fileChanged(event.paths);
      void refreshMarks();
    } else if (event.type === 'status') {
      void refreshMarks(true);
    }
  }

  async function openFromTree(detail: TreeEventDetail, view: View): Promise<void> {
    if (detail.kind !== 'file') return;
    const current = pane.current;
    // Selecting the open file again keeps it as it is.
    if (view === 'preview' && current?.path === detail.path) return;
    const opened = await navigate({ path: detail.path, view }, 'push', view === 'edit');
    if (!opened) tree.selected = pane.current?.path ?? null;
  }

  const menu = new HostMenu(host);
  const fileOps = createFileOps(host, {
    client,
    tree,
    pane,
    listing: () => (listingIndex ??= indexListing(nodes, truncated)),
    refresh,
    navigate: (address, how, focus) => navigate(address, how, focus),
    showAddress: (state) => writeAddress(state, 'replace'),
  });

  function openMenu(detail: TreeMenuDetail): void {
    menu.open({
      x: detail.x,
      y: detail.y,
      entries: fileOps.entriesFor(detail),
      label: words.menu.label(detail.path),
      // Back to the row it was asked on; for the space under the rows, to what had focus.
      ...(detail.path === '' ? {} : { returnFocus: () => void fileOps.focusRow(detail.path) }),
    });
  }

  function wire(): void {
    tree.addEventListener(
      'tree-select',
      (event) => void openFromTree((event as CustomEvent<TreeEventDetail>).detail, 'preview'),
      { signal }
    );
    tree.addEventListener(
      'tree-activate',
      (event) => void openFromTree((event as CustomEvent<TreeEventDetail>).detail, 'edit'),
      { signal }
    );
    tree.addEventListener(
      'tree-menu',
      (event) => openMenu((event as CustomEvent<TreeMenuDetail>).detail),
      { signal }
    );
    tree.addEventListener(
      'tree-toggle',
      () => {
        if (rootId !== null) writeOpenFolders(rootId, tree.openPaths);
      },
      { signal }
    );
    window.addEventListener('popstate', (event) => void onPopState(event), { signal });
    window.addEventListener(
      'keydown',
      (event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === 's'
        ) {
          // Never the browser's own Save Page, here.
          event.preventDefault();
          void pane.save();
        }
      },
      { signal, capture: true }
    );
    window.addEventListener(
      'beforeunload',
      (event) => {
        if (pane.current?.dirty) {
          event.preventDefault();
          event.returnValue = '';
        }
      },
      { signal }
    );
  }

  wire();
  const unwatch = client.watch(onHostEvent);

  const ready = (async () => {
    const asked = (async () => {
      try {
        git = await client.git();
      } catch {
        git = null;
      }
      notes.git = git?.state === 'no-git' ? words.gitNotFound : null;
    })();
    let listed: () => void = () => undefined;
    const firstListing = new Promise<void>((done) => (listed = done));
    const opening = (async () => {
      const address = parseAddress(location.hash);
      // The Changes view is offered by status, so it waits for the first statuses.
      if (address?.view === 'diff') await firstListing;
      if (address) await openAddress(address);
    })();
    try {
      const root = await client.root();
      rootId = root.id;
      folderName = root.name;
      rootName.textContent = root.name;
      rootName.title = root.name;
      showState(pane.current);
    } catch (error) {
      notes.list = words.explorerFailed(String(error));
      showNote();
    }
    await asked;
    await refresh();
    listed();
    if (rootId !== null) tree.openPaths = readOpenFolders(rootId);
    const address = parseAddress(location.hash);
    if (address) tree.reveal(address.path);
    await opening;
  })();

  return {
    tree,
    pane,
    confirm,
    menu,
    fileOps,
    ready,
    navigate,
    refresh,
    destroy() {
      controller.abort();
      unwatch();
      menu.destroy();
      fileOps.destroy();
    },
  };
}
