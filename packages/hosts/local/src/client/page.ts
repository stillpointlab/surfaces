// The local host's page: the explorer on the left, the pane on the right, the
// address in the fragment, and the host's events. Everything reaches the server
// through the `HostClient` it is given.
//
// The wiring, for the specs that build on it:
// - `tree-select` and `tree-activate` open files, and an app's row opens the app;
//   `tree-toggle` keeps the open folders; `tree-menu` opens the host's menu
//   (`menu/`) with the row's entries from `file-ops/`, or an app row's own, in
//   `wire`. Another kind of row adds its entries there.
// - `menu` is the page's one options menu: anything that asks for a menu opens
//   it with `menu.open({ x, y, entries })`.
// - `navigate` is the one way to open something: it asks before unsaved edits are
//   lost, writes the address, and tells the pane. A new view (`#/diff/<path>`) is
//   an entry in `address.ts` and a case in the pane. An app's address
//   (`#/app/<manifestPath>…`) shows the app pane in place of the file pane.
// - `refresh` lists the folder again, with its statuses and its apps, as a
//   `listed` or an `apps` event does.
// - git: the page asks `client.git()` once. In `repository` the statuses mark the
//   tree and tell the pane which files offer the Changes view (`statusOf`); a
//   `status` event reads them again. In `no-git` the explorer's note says git was
//   not found. Outside `repository` nothing calls the git routes.
// - commit: in `repository` the Commit button in `.explorer-header` shows how many
//   files changed (the statuses' count: one per moved file, deleted files
//   included), and is disabled when none has. It opens `commit/`'s review, the
//   check-in review an app's shell holds too, which reads the changes again while
//   it is open when the host says they moved. The page's one commit
//   (`commitChosen`) answers the explorer's review and every app's check-in: after
//   it the marks are read at once (not only on the `status` event the commit
//   raises), and the branch is the commit's. The app pane gives each shell the
//   commit's words and the branch, read again each time it sets the input.
// - the notice under the header is the page's one: the commit's message, an
//   app's `notification` and the problems a lock reports all show there, a line
//   and a short list, the newest in place of the last, until it is dismissed. It
//   is a live region, so a screen reader says it.
// - apps (`apps/`): the page reads the instances with the listing. A locked
//   instance's files are left out of the tree, and its folder is the app's row;
//   an instance at the served root has a row above the tree. The row's menu
//   shows or locks the files. A file in a locked region opens in its preview, and
//   a folder above one cannot be renamed or deleted here. A folder's menu, and
//   the space under the rows, offer to create each app that can be created
//   (`apps/create-dialog.ts`); the new instance's row shows and the pane opens it.
// - an app's `open-options-menu` opens the page's one menu at its anchor.
// - undo and redo: the Undo and Redo buttons in `.explorer-header` take back, or
//   do again, the host's last step (the explorer's create, rename or delete, an
//   app's op, a create), each titled with its step's label and disabled with
//   nothing to do; a `journal` event reads the labels again. Ctrl+Z and
//   Ctrl+Shift+Z (Cmd on a Mac) do the same when focus is in neither an editor
//   nor a text field, nor in a dialog or a menu: there the key is theirs. The open
//   file follows an undo as it follows the explorer's write
//   (`FilePane.followWrite`), so no banner shows for it; a file with unsaved edits
//   that an undo deletes keeps them, under the banner. What else moved, the
//   events the page already handles bring up to date.

import '@stillpointlab/modal-dialog-component';
import '@stillpointlab/spl-icon-component';
import { fileNameOf } from '@stillpointlab/common-format/format';
import { html, render } from '@stillpointlab/common-format/html';

import { inRegion } from '../shared/apps';

import { appAddress, formatAddress, parseAddress } from './address';
import { AppPane } from './apps/app-pane';
import { CreateDialog } from './apps/create-dialog';
import { appTreeView, holdsChanges, holdsLocked, lockedBy } from './apps/tree-view';
import { CommitReview } from './commit/review';
import { createConfirm } from './confirm';
import { createFileOps } from './file-ops/file-ops';
import { filesUnder, indexListing } from './file-ops/paths';
import { deepActiveElement, HostMenu } from './menu/menu';
import { pageStyles } from './page.styles';
import { FilePane } from './pane';
import {
  readDiffWhitespace,
  readOpenFolders,
  writeDiffWhitespace,
  writeOpenFolders,
} from './stored';
import './tree/host-file-tree';
import { words } from './words';

import type { Address, AppAddress, View } from './address';
import type { Notice } from './apps/app-pane';
import type { ClientApps } from './apps/registry';
import type { Confirm } from './confirm';
import type { FileOps } from './file-ops/file-ops';
import type {
  FoundInstance,
  HostClient,
  HostGit,
  JournalLabels,
  WatchedEvent,
} from './host-client';
import type { MenuEntry } from './menu/menu';
import type { PaneState } from './pane';
import type { HostFileTree, TreeEventDetail, TreeMenuDetail } from './tree/host-file-tree';
import type { FolderNode } from '@stillpointlab/common-format/app';
import type { Result } from '@stillpointlab/common-format/app';
import type { FormatDescriptor, FormatRegistry } from '@stillpointlab/common-format/format';
import type { FileStatus, HostCommit, HostCommitRequest } from '@stillpointlab/common-format/host';

export type { Notice } from './apps/app-pane';

export interface PageOptions {
  client: HostClient;
  registry: FormatRegistry;
  /** The apps the page can show, by id (`createAppRegistry()`); none by default. */
  apps?: ClientApps;
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
  /** The app pane: one instance's shell. */
  readonly appPane: AppPane;
  readonly confirm: Confirm;
  /** The page's one options menu. */
  readonly menu: HostMenu;
  /** Create, rename and delete: the explorer's entries, dialogs and writes. */
  readonly fileOps: FileOps;
  /** The explorer's commit: the check-in review, over the folder's changes. */
  readonly commit: CommitReview;
  /** The dialog that creates an app's instance. */
  readonly createDialog: CreateDialog;
  /** The instances, as last read. */
  readonly instances: readonly FoundInstance[];
  /**
   * Open the commit, as the Commit button does: read the changes, then open the
   * review on them. Settles when the review closes, with the commit made, or
   * null (none made, nothing changed, the read failed, or not a repository).
   */
  openCommit(): Promise<HostCommit | null>;
  /** Show a notice in the page's one notice; `null` clears it. */
  notify(notice: Notice | null): void;
  /** Settles once the first listing and the first address have been handled. */
  readonly ready: Promise<void>;
  /** Open what an address names, asking first when edits would be lost; false if declined. */
  navigate(address: Address | null, how?: 'push' | 'replace'): Promise<boolean>;
  /** "Show files…": ask, then unlock the instance's files. True when they were shown. */
  showFiles(instance: FoundInstance): Promise<boolean>;
  /** "Lock files": lock the instance's files again, and show what the lock reports. */
  lockFiles(instance: FoundInstance): Promise<boolean>;
  /** Create an instance of an app, starting from `folder`; then open it. Its manifest path, or null. */
  createApp(appId: string, folder: string): Promise<string | null>;
  /** List the folder again. */
  refresh(): Promise<void>;
  /**
   * Take back the host's last step, or do the last one undone again, as the
   * buttons and the keys do. True when it landed; a refusal shows in the notice.
   */
  undo(): Promise<boolean>;
  redo(): Promise<boolean>;
  /** Stop listening to the host and the window. */
  destroy(): void;
}

/** How long a read runs before the Commit button shows its spinner. */
export const SPINNER_DELAY_MS = 150;

/** The history entries the page writes carry their place, so a declined Back can be undone. */
interface EntryState {
  surfacesIndex: number;
}

function indexOf(state: unknown): number | null {
  const index = (state as Partial<EntryState> | null)?.surfacesIndex;
  return typeof index === 'number' ? index : null;
}

let styled = false;

/**
 * The letter a key event means for one of the page's shortcuts: the key's own,
 * or, on a layout with no Latin letters (Cyrillic, Greek), the letter on the
 * physical key, as the browser's own shortcuts take it. A Latin layout that
 * moves the letters (Dvorak) keeps its own.
 */
function shortcutLetter(event: Pick<KeyboardEvent, 'key' | 'code'>): string {
  const key = event.key.toLowerCase();
  const physical = /^Key([A-Z])$/.exec(event.code);
  return physical && key.length === 1 && key.charCodeAt(0) > 0x7f ? physical[1].toLowerCase() : key;
}

/** Cmd, not Ctrl, is the key a Mac undoes with. */
const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function startPage(options: PageOptions): HostPage {
  const { client, registry } = options;
  const apps = options.apps ?? {};
  const host = options.root ?? document.body;
  if (!styled) {
    styled = true;
    const style = document.createElement('style');
    style.textContent = pageStyles;
    document.head.append(style);
  }

  render(
    host,
    html`<div class="host-page"><nav class="explorer" aria-label="${words.explorer}"><header class="explorer-header"><span class="explorer-name"></span><button type="button" class="button explorer-undo" data-step="undo" disabled><spl-icon icon-name="undo" data-size="small" data-padding="none" aria-hidden="true"></spl-icon></button><button type="button" class="button explorer-redo" data-step="redo" disabled><spl-icon icon-name="redo" data-size="small" data-padding="none" aria-hidden="true"></spl-icon></button><button type="button" class="button explorer-commit" hidden>${words.commit.button}<span class="explorer-commit-count"></span><spl-icon class="explorer-commit-spinner" icon-name="spinner" data-size="small" data-padding="none" aria-hidden="true"></spl-icon></button></header><div class="page-notice" role="status"></div><p class="explorer-note" hidden></p><div class="app-roots" role="group" aria-label="${words.apps.rootRows}" hidden></div><host-file-tree></host-file-tree></nav><main class="pane"><div class="file-pane"></div><div class="app-pane" hidden></div></main></div>`
  );
  const tree = host.querySelector('host-file-tree') as HostFileTree;
  const rootName = host.querySelector<HTMLElement>('.explorer-name')!;
  const note = host.querySelector<HTMLElement>('.explorer-note')!;
  const commitButton = host.querySelector<HTMLButtonElement>('.explorer-commit')!;
  const commitCount = host.querySelector<HTMLElement>('.explorer-commit-count')!;
  const undoButton = host.querySelector<HTMLButtonElement>('.explorer-undo')!;
  const redoButton = host.querySelector<HTMLButtonElement>('.explorer-redo')!;
  const notice = host.querySelector<HTMLElement>('.page-notice')!;
  const rootRows = host.querySelector<HTMLElement>('.app-roots')!;
  const filePaneElement = host.querySelector<HTMLElement>('.file-pane')!;
  const appPaneElement = host.querySelector<HTMLElement>('.app-pane')!;
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
  /** The app instances, as last read. */
  let instances: FoundInstance[] = [];
  /** The explorer's note: one line each for git and the listing. */
  const notes: { git: string | null; list: string | null } = { git: null, list: null };
  /** Which pane shows: a file's, or an app's. */
  let showing: 'file' | 'app' = 'file';
  /** The labels of the steps undo and redo would take, as last read. */
  let journal: JournalLabels = { undo: null, redo: null };
  /** An undo or a redo on its way: the next waits for it to land. */
  let stepping: Promise<boolean> | null = null;

  const pane: FilePane = new FilePane(filePaneElement, {
    client,
    registry,
    confirm,
    prepare: options.prepare,
    diff: options.diff,
    diffWhitespace: readDiffWhitespace(),
    onDiffWhitespace: writeDiffWhitespace,
    onViewRequest: (view, how = 'push') => {
      const current = pane.current;
      if (current) void navigate({ path: current.path, view }, how);
    },
    statusOf: (path) =>
      git?.state === 'repository' && Object.hasOwn(statuses, path) ? statuses[path] : undefined,
    onState: showState,
    lockedBy: (path) => lockedBy(instances, path)?.label ?? null,
  });

  const appPane = new AppPane(appPaneElement, {
    client,
    apps,
    location: () => folderName,
    navigate: (hash, how = 'push') => {
      const address = parseAddress(hash, manifests());
      if (address) void navigate(address, how);
    },
    notify: (shown) => showNotice(shown),
    refresh: () => refresh(),
    showFiles: (instance) => void showFiles(instance),
    git: () => readGit(),
    commit: (request) => commitChosen(request),
    openMenu: ({ anchor, items, choose }) => {
      const box = anchor.getBoundingClientRect();
      menu.open({
        x: box.left,
        y: box.bottom,
        entries: items.map((item) => ({
          label: item.label,
          action: () => choose(item.id),
          ...(item.disabled ? { disabled: true } : {}),
          ...(item.title !== undefined ? { title: item.title } : {}),
        })),
        returnFocus: () => (anchor as HTMLElement).focus?.(),
      });
    },
    onTitle: () => showTitle(),
  });

  const manifests = (): string[] => instances.map((instance) => instance.manifestPath);
  const instanceAt = (manifestPath: string | null): FoundInstance | null =>
    instances.find((instance) => instance.manifestPath === manifestPath) ?? null;

  /** The Commit button: in a repository, with the number of changed files; disabled with none. */
  function showCommit(): void {
    commitButton.hidden = git?.state !== 'repository';
    const count = Object.keys(statuses).length;
    commitButton.disabled = count === 0;
    commitCount.textContent = count === 0 ? '' : String(count);
    commitButton.setAttribute('aria-label', words.commit.buttonLabel(count));
  }

  /** The Undo and Redo buttons: each titled with its step's label, disabled with none. */
  function showJournal(): void {
    // Not disabled while one runs: a button with focus would lose it, and the
    // next waits for the one before anyway.
    const show = (button: HTMLButtonElement, label: string | null, which: 'undo' | 'redo') => {
      button.disabled = label === null;
      const title =
        label === null
          ? words.journal[which === 'undo' ? 'nothingToUndo' : 'nothingToRedo']
          : words.journal[which === 'undo' ? 'undoTitle' : 'redoTitle'](label);
      button.title = title;
      button.setAttribute('aria-label', title);
    };
    show(undoButton, journal.undo, 'undo');
    show(redoButton, journal.redo, 'redo');
  }

  /** Read the labels again: after a step, an undo or a redo, or a `journal` event. */
  async function readJournal(): Promise<void> {
    try {
      const answer = await client.journal();
      if (answer.ok) journal = { undo: answer.undo, redo: answer.redo };
    } catch {
      // the buttons keep what they last showed
    }
    showJournal();
  }

  /**
   * Undo or redo the host's last step. The open file follows what it moved and
   * deleted; one with unsaved edits that it deleted keeps them, and the banner
   * says the file is gone. A refusal (a file changed since, nothing to do) shows
   * in the notice.
   */
  function step(which: 'undo' | 'redo'): Promise<boolean> {
    if (stepping) return stepping.then(() => step(which));
    stepping = (async () => {
      const before = pane.current;
      const openApp = showing === 'app' ? (appPane.current?.manifestPath ?? null) : null;
      const answer = await pane.followWrite(
        which === 'undo' ? client.undo() : client.redo(),
        (path, done) => {
          const moved = done.moved.find((move) => move.from === path);
          if (moved) return moved.path;
          if (done.deleted.includes(path)) return pane.current?.dirty ? undefined : null;
          return undefined;
        }
      );
      if (!answer.ok) {
        showNotice({
          text: words.journal.failed(which, answer.code, answer.message),
          tone: 'error',
        });
        await readJournal();
        return false;
      }
      const now = pane.current;
      if (showing === 'file' && before && now?.path !== before.path) writeAddress(now, 'replace');
      showNotice({ text: words.journal.done(which, answer.label), tone: 'info' });
      await Promise.all([refresh(), readJournal()]);
      // The step took the open app away (its create, undone): nothing is open
      // now, and the notice says what was undone. An app that went some other
      // way keeps its address, and its pane says there is no app there.
      if (openApp !== null && showing === 'app' && !instanceAt(openApp)) {
        await navigate(null, 'replace');
      }
      return true;
    })().finally(() => {
      stepping = null;
    });
    return stepping;
  }

  /** Whether Ctrl+Z (Cmd+Z) is the page's: focus is in no editor, text field, dialog or menu. */
  function keyIsThePage(event: KeyboardEvent): boolean {
    if (event.defaultPrevented) return false;
    if (host.querySelector('modal-dialog[is-open]')) return false;
    const path = event.composedPath();
    const inside = path.some(
      (node) =>
        node instanceof Element &&
        (node.localName === 'modal-dialog' ||
          node.localName === 'dialog' ||
          node.getAttribute('role') === 'dialog' ||
          node.getAttribute('role') === 'menu')
    );
    if (inside) return false;
    // An editor's key is its own: anything in the file pane's body while it edits.
    const editor = filePaneElement.querySelector('.pane-body');
    if (
      showing === 'file' &&
      pane.current?.view === 'edit' &&
      path.some((node) => node === editor)
    ) {
      return false;
    }
    const active = deepActiveElement();
    if (!active) return true;
    if (active.isContentEditable) return false;
    const tag = active.localName;
    if (tag === 'textarea' || tag === 'select') return false;
    if (tag === 'input') {
      const type = (active as HTMLInputElement).type;
      return ['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(
        type
      );
    }
    return true;
  }

  /** The page's one notice: a line and a short list, or nothing. */
  function showNotice(shown: Notice | null): void {
    notice.dataset.tone = shown?.tone ?? 'info';
    render(
      notice,
      shown === null
        ? html``
        : html`<div class="page-notice-text"><span>${shown.text}</span>${
            shown.lines && shown.lines.length > 0
              ? html`<ul class="page-notice-lines">${shown.lines.map((line) => html`<li>${line}</li>`)}</ul>`
              : ''
          }</div><button type="button" class="page-notice-close" aria-label="${words.commit.dismiss}" title="${words.commit.dismiss}">×</button>`
    );
  }

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

  /** Whether the file pane already shows what a file address names. */
  function showsFile(address: Address | null): boolean {
    const current = pane.current;
    return (
      showing === 'file' &&
      address !== null &&
      address.view !== 'app' &&
      current !== null &&
      current.path === address.path &&
      current.view === pane.viewFor(address.path, address.view)
    );
  }

  async function navigate(
    address: Address | null,
    how: 'push' | 'replace' = 'push',
    focus = false
  ): Promise<boolean> {
    if (address?.view === 'app') {
      // Leaving a file with unsaved edits for an app asks first.
      if (!(await pane.confirmLeave())) return false;
      writeAddress(address, how);
      showApp(address);
      return true;
    }
    if (!showsFile(address) && !(await pane.confirmLeave())) return false;
    writeAddress(
      address ? { ...address, view: pane.viewFor(address.path, address.view) } : null,
      how
    );
    showFilePane();
    if (address) void pane.open(address.path, address.view, { focus });
    else pane.close();
    return true;
  }

  /** The app pane in place of the file pane, at an app's address. */
  function showApp(address: AppAddress): void {
    showing = 'app';
    pane.close();
    filePaneElement.hidden = true;
    appPaneElement.hidden = false;
    const instance = instanceAt(address.manifestPath);
    tree.selected = instance && instance.folder !== '' ? instance.folder : null;
    void appPane.open(address, instance);
    showRoots();
    showTitle();
  }

  function showFilePane(): void {
    if (showing === 'file') return;
    showing = 'file';
    appPane.close();
    appPaneElement.hidden = true;
    filePaneElement.hidden = false;
    showRoots();
  }

  async function onPopState(event: PopStateEvent): Promise<void> {
    if (undoing) {
      undoing = false;
      return;
    }
    const address = parseAddress(location.hash, manifests());
    const current = pane.current;
    if (!showsFile(address) && !(await pane.confirmLeave())) {
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
    if (address?.view === 'app') {
      showApp(address);
    } else if (address) {
      showFilePane();
      tree.reveal(address.path);
      void openAddress(address);
    } else {
      showFilePane();
      pane.close();
    }
  }

  /** Open what the address already names, saying so when the format has no editor. */
  function openAddress(address: Address): Promise<void> {
    if (address.view === 'app') {
      showApp(address);
      return Promise.resolve();
    }
    showFilePane();
    const view = pane.viewFor(address.path, address.view);
    if (view !== address.view) writeAddress({ path: address.path, view }, 'replace');
    return pane.open(address.path, view);
  }

  /** The document's title: what the pane shows, then the folder. */
  function showTitle(state: PaneState | null = pane.current): void {
    let name: string;
    if (showing === 'app') {
      const title = appPane.current?.title;
      name = title ? `${title} — ` : '';
    } else {
      name = state ? `${state.dirty ? '● ' : ''}${fileNameOf(state.path)} — ` : '';
    }
    document.title = `${name}${folderName || 'Surfaces'}`;
  }

  /** Keep the title and the address in step with what the pane shows. */
  function showState(state: PaneState | null): void {
    if (showing !== 'file') return;
    showTitle(state);
    // An editor-less format opens in its preview: the address says so.
    const address = parseAddress(location.hash);
    if (
      state &&
      !pane.busy &&
      address?.view !== 'app' &&
      address?.path === state.path &&
      address.view !== state.view
    ) {
      writeAddress({ path: state.path, view: state.view }, 'replace');
    }
  }

  // ---- the tree ----

  let listing: Promise<void> | null = null;
  let listAgain = false;

  /** List the folder, its statuses and its apps into the tree; one listing at a time. */
  async function refresh(): Promise<void> {
    if (listing) {
      listAgain = true;
      return listing;
    }
    listing = (async () => {
      do {
        listAgain = false;
        try {
          const [list, status, found] = await Promise.all([
            client.list(),
            client.status(),
            client.apps(),
          ]);
          nodes = list.nodes;
          truncated = list.truncated;
          listingIndex = null;
          statuses = status;
          instances = found;
          showTree();
          notes.list = list.truncated ? words.explorerTruncated(nodes.length) : null;
          pane.statusChanged();
          pane.lockChanged();
          appPane.instancesChanged(instances);
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
      showTree();
      pane.statusChanged({ head });
    } catch {
      // the next listing tries again
    }
  }

  /** The tree, the rows above it and the Commit button, from what was last read. */
  function showTree(): void {
    const view = appTreeView(nodes, statuses, instances);
    tree.setNodes(view.nodes, view.marks);
    showRoots();
    showCommit();
  }

  /** The rows above the tree: one per instance at the served root. */
  function showRoots(): void {
    const roots = instances.filter((instance) => instance.folder === '');
    rootRows.hidden = roots.length === 0;
    const open = showing === 'app' ? appPane.current?.manifestPath : null;
    render(
      rootRows,
      html`${roots.map(
        (instance) =>
          html`<div class="app-root" data-manifest="${instance.manifestPath}"><button type="button" class="app-root-open" data-action="open" title="${instance.manifestPath}"${
            open === instance.manifestPath ? html` aria-current="page"` : ''
          }><spl-icon class="app-icon" icon-name="${instance.icon}" data-size="small" data-padding="none" aria-hidden="true" inert></spl-icon><span class="app-root-label">${instance.label}</span>${
            instance.unlocked
              ? html`<span class="app-root-unlocked" title="${words.apps.unlockedTitle}">${words.apps.unlocked}</span>`
              : ''
          }${
            holdsChanges(instance, statuses)
              ? html`<span class="app-root-dot" role="img" aria-label="${words.apps.holdsChanges}" title="${words.apps.holdsChanges}"></span>`
              : ''
          }</button><button type="button" class="app-root-menu" data-action="menu" aria-label="${words.apps.menuLabel(instance.label)}" aria-haspopup="menu">⋯</button></div>`
      )}`
    );
  }

  function onHostEvent(event: WatchedEvent): void {
    if (event.type === 'journal') {
      void readJournal();
      return;
    }
    if (event.type === 'reconnected') {
      // The `listed` before it read the list again; no event names the open file.
      void pane.recheckOpen();
      return;
    }
    if (event.type === 'apps' || event.type === 'listed') {
      void refresh();
    } else if (event.type === 'changed') {
      void pane.fileChanged(event.paths);
      void refreshMarks();
    } else if (event.type === 'status') {
      void refreshMarks(true);
    }
    if (event.type !== 'apps') {
      if (showing === 'app') appPane.hostEvent(event);
      void commit.changesMoved();
    }
  }

  async function openFromTree(detail: TreeEventDetail, view: View): Promise<void> {
    if (detail.kind === 'app') {
      const instance = instances.find((found) => found.folder === detail.path);
      if (instance) await openApp(instance);
      return;
    }
    if (detail.kind !== 'file') return;
    const current = pane.current;
    // Selecting the open file again keeps it as it is.
    if (showing === 'file' && view === 'preview' && current?.path === detail.path) return;
    const opened = await navigate({ path: detail.path, view }, 'push', view === 'edit');
    if (!opened) tree.selected = pane.current?.path ?? null;
  }

  /** Open an instance's first page, unless the app pane shows that instance already. */
  async function openApp(instance: FoundInstance): Promise<void> {
    if (showing === 'app' && appPane.current?.manifestPath === instance.manifestPath) return;
    const opened = await navigate(appAddress(instance.manifestPath));
    if (!opened) tree.selected = pane.current?.path ?? null;
  }

  /**
   * Commit was pressed and the review has not opened yet: the page is reading
   * the changes. The button says so at once (`aria-busy`), and shows a spinner
   * in place of its count once the read has taken a moment, so a quick read
   * does not flicker. It keeps the focus: a second press opens nothing.
   */
  let spinnerDue: ReturnType<typeof setTimeout> | null = null;
  function commitReading(reading: boolean): void {
    if (spinnerDue !== null) clearTimeout(spinnerDue);
    spinnerDue = null;
    if (reading) {
      commitButton.setAttribute('aria-busy', 'true');
      spinnerDue = setTimeout(() => (commitButton.dataset.reading = ''), SPINNER_DELAY_MS);
    } else {
      commitButton.removeAttribute('aria-busy');
      delete commitButton.dataset.reading;
    }
  }

  const commit = new CommitReview(host, {
    client,
    unsaved: () => {
      const current = pane.current;
      return current?.dirty ? current.path : null;
    },
    commit: (request) => commitChosen(request),
    notify: (shown) => showNotice(shown),
    reading: commitReading,
  });

  async function openCommit(): Promise<HostCommit | null> {
    if (git?.state !== 'repository') return null;
    return commit.open();
  }

  /**
   * The page's one commit, for the explorer's review and an app's check-in: on a
   * commit, the branch is the commit's and the marks are read at once.
   */
  async function commitChosen(request: HostCommitRequest): Promise<Result<HostCommit>> {
    const made = await client.commit(request);
    if (made.ok) {
      if (git) git = { ...git, branch: made.branch };
      await refreshMarks(true);
    }
    return made;
  }

  /** The folder's git, read again, for an app's review; `null` outside a repository. */
  async function readGit(): Promise<HostGit | null> {
    if (git?.state !== 'repository') return null;
    try {
      git = await client.git();
    } catch {
      // keep what was last read
    }
    return git;
  }

  // ---- the lock ----

  async function showFiles(instance: FoundInstance): Promise<boolean> {
    if (!(await confirm(words.apps.showFilesConfirm))) return false;
    const answer = await client.setAppLock(instance.manifestPath, false);
    if (!answer.ok) {
      showNotice({ text: words.apps.unlockFailed(answer.message), tone: 'error' });
      return false;
    }
    await refresh();
    // The files are under the row now: open it to show them.
    if (instance.folder !== '' && !tree.openPaths.includes(instance.folder)) {
      tree.openPaths = [...tree.openPaths, instance.folder];
      if (rootId !== null) writeOpenFolders(rootId, tree.openPaths);
    }
    return true;
  }

  async function lockFiles(instance: FoundInstance): Promise<boolean> {
    // An unsaved edit to one of its files would be refused once they are locked.
    const open = pane.current;
    const losing =
      showing === 'file' && open !== null && open.dirty && inRegion(instance, open.path);
    if (losing && !(await confirm(words.discard(fileNameOf(open.path))))) return false;
    const answer = await client.setAppLock(instance.manifestPath, true);
    if (!answer.ok) {
      showNotice({ text: words.apps.lockFailed(answer.message), tone: 'error' });
      return false;
    }
    const problems = [...answer.errors, ...answer.warnings];
    showNotice(
      problems.length === 0
        ? { text: words.apps.locked(instance.label), tone: 'success' }
        : { text: words.apps.lockedProblems(instance.label), lines: problems, tone: 'warning' }
    );
    await refresh();
    pane.lockChanged({ discard: losing });
    return true;
  }

  // ---- the menus ----

  const menu = new HostMenu(host);
  const fileOps = createFileOps(host, {
    client,
    tree,
    pane,
    listing: () => (listingIndex ??= indexListing(nodes, truncated)),
    refresh,
    navigate: (address, how, focus) => navigate(address, how, focus),
    showAddress: (state) => writeAddress(state, 'replace'),
    holdsLocked: (folder) => holdsLocked(instances, folder),
  });

  /** An app row's entries: Open, then the lock's, and New file… while its files are shown. */
  function appEntries(instance: FoundInstance): MenuEntry[] {
    const entries: MenuEntry[] = [{ label: words.apps.open, action: () => void openApp(instance) }];
    if (instance.unlocked) {
      entries.push(
        { label: words.apps.lockFiles, action: () => void lockFiles(instance) },
        { label: words.menu.newFile, action: () => void fileOps.newFile(instance.folder) }
      );
    } else {
      entries.push({ label: words.apps.showFiles, action: () => void showFiles(instance) });
    }
    return entries;
  }

  /** One entry per app that can be created, in a folder's menu or the space under the rows. */
  function createEntries(folder: string): MenuEntry[] {
    if (folder !== '' && (listingIndex ??= indexListing(nodes, truncated)).separate.has(folder)) {
      return [];
    }
    return Object.entries(apps).flatMap(([id, app]) =>
      app.meta.create && app.create
        ? [
            {
              label: words.apps.create.entry(app.meta.create.noun),
              action: () => void createApp(id, folder),
            },
          ]
        : []
    );
  }

  const createDialog = new CreateDialog(
    host,
    client,
    (folder) => filesUnder((listingIndex ??= indexListing(nodes, truncated)), folder).length
  );

  async function createApp(appId: string, folder: string): Promise<string | null> {
    const app = Object.hasOwn(apps, appId) ? apps[appId] : undefined;
    const create = app?.meta.create;
    if (!app || !create) return null;
    const start = folder === '' ? create.defaultFolder : `${folder}/${create.defaultFolder}`;
    const created = await createDialog.open(appId, app, start);
    if (created === null) return null;
    const { manifestPath } = created;
    // Written, but with no step: say it cannot be undone, as for an app's op.
    if (created.notice?.kind === 'cannot-undo') {
      showNotice({ text: words.journal.opCannotUndo(created.notice.reason), tone: 'warning' });
    }
    await refresh();
    await navigate(appAddress(manifestPath));
    const instance = instanceAt(manifestPath);
    if (instance && instance.folder !== '') tree.reveal(instance.folder);
    return manifestPath;
  }

  function openMenu(detail: TreeMenuDetail): void {
    const instance =
      detail.kind === 'app' ? instances.find((found) => found.folder === detail.path) : undefined;
    const entries = instance
      ? appEntries(instance)
      : [
          ...fileOps.entriesFor(detail),
          ...(detail.kind === 'folder' || detail.path === '' ? createEntries(detail.path) : []),
        ];
    menu.open({
      x: detail.x,
      y: detail.y,
      entries,
      label: instance ? words.apps.menuLabel(instance.label) : words.menu.label(detail.path),
      // Back to the row it was asked on; for the space under the rows, to what had focus.
      ...(detail.path === '' ? {} : { returnFocus: () => void fileOps.focusRow(detail.path) }),
    });
  }

  /** A root instance's menu, at its row above the tree. */
  function openRootMenu(row: HTMLElement, instance: FoundInstance): void {
    const box = row.getBoundingClientRect();
    const opener = row.querySelector<HTMLElement>('.app-root-open');
    menu.open({
      x: box.left,
      y: box.bottom,
      entries: appEntries(instance),
      label: words.apps.menuLabel(instance.label),
      returnFocus: () => {
        const again = rootRows.querySelector<HTMLElement>(
          `.app-root[data-manifest="${CSS.escape(instance.manifestPath)}"] .app-root-open`
        );
        (again ?? opener)?.focus();
      },
    });
  }

  function rootOf(event: Event): { row: HTMLElement; instance: FoundInstance } | null {
    const row = (event.target as Element).closest<HTMLElement>('.app-root');
    const instance = row ? instanceAt(row.dataset.manifest ?? null) : null;
    return row && instance ? { row, instance } : null;
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
    rootRows.addEventListener(
      'click',
      (event) => {
        const at = rootOf(event);
        if (!at) return;
        const action = (event.target as Element).closest<HTMLElement>('[data-action]')?.dataset
          .action;
        if (action === 'menu') openRootMenu(at.row, at.instance);
        else if (action === 'open') void openApp(at.instance);
      },
      { signal }
    );
    rootRows.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
        const at = rootOf(event);
        if (!at) return;
        event.preventDefault();
        openRootMenu(at.row, at.instance);
      },
      { signal }
    );
    rootRows.addEventListener(
      'contextmenu',
      (event) => {
        const at = rootOf(event);
        if (!at) return;
        event.preventDefault();
        openRootMenu(at.row, at.instance);
      },
      { signal }
    );
    commitButton.addEventListener('click', () => void openCommit(), { signal });
    undoButton.addEventListener('click', () => void step('undo'), { signal });
    redoButton.addEventListener('click', () => void step('redo'), { signal });
    window.addEventListener(
      'keydown',
      (event) => {
        const mod = IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
        if (!mod || event.altKey) return;
        const letter = shortcutLetter(event);
        // Ctrl+Y is redo too, where Ctrl is the key: on a Mac, Cmd+Y is the browser's.
        const redoKey = letter === 'y' && !IS_MAC && !event.shiftKey;
        if (letter !== 'z' && !redoKey) return;
        if (!keyIsThePage(event)) return;
        event.preventDefault();
        void step(redoKey || event.shiftKey ? 'redo' : 'undo');
      },
      { signal }
    );
    notice.addEventListener(
      'click',
      (event) => {
        if (!(event.target as Element).closest('.page-notice-close')) return;
        showNotice(null);
        // Back to the button, or, when nothing is left to commit, the tree's row.
        if (!commitButton.disabled) commitButton.focus();
        else tree.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')?.focus();
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
          shortcutLetter(event) === 's'
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
      showCommit();
    })();
    let listed: () => void = () => undefined;
    const firstListing = new Promise<void>((done) => (listed = done));
    const opening = (async () => {
      const first = parseAddress(location.hash);
      // The Changes view is offered by status, an app is found among the
      // instances, and an editor is refused for a locked app's file, which the
      // instances say: all three wait for the first listing.
      if (first?.view === 'diff' || first?.view === 'app' || first?.view === 'edit') {
        await firstListing;
      }
      const address = parseAddress(location.hash, manifests());
      if (address) await openAddress(address);
    })();
    try {
      const root = await client.root();
      rootId = root.id;
      folderName = root.name;
      rootName.textContent = root.name;
      rootName.title = root.name;
      showTitle();
    } catch (error) {
      notes.list = words.explorerFailed(String(error));
      showNote();
    }
    await asked;
    await Promise.all([refresh(), readJournal()]);
    listed();
    if (rootId !== null) tree.openPaths = readOpenFolders(rootId);
    const address = parseAddress(location.hash, manifests());
    if (address?.view === 'app') {
      const instance = instanceAt(address.manifestPath);
      if (instance && instance.folder !== '') tree.reveal(instance.folder);
    } else if (address) {
      tree.reveal(address.path);
    }
    await opening;
  })();

  return {
    tree,
    pane,
    appPane,
    confirm,
    menu,
    fileOps,
    commit,
    createDialog,
    createApp,
    get instances() {
      return instances;
    },
    openCommit,
    notify: showNotice,
    ready,
    navigate,
    showFiles,
    lockFiles,
    refresh,
    undo: () => step('undo'),
    redo: () => step('redo'),
    destroy() {
      controller.abort();
      if (spinnerDue !== null) clearTimeout(spinnerDue);
      unwatch();
      appPane.close();
      menu.destroy();
      fileOps.destroy();
      commit.destroy();
      createDialog.destroy();
    },
  };
}
