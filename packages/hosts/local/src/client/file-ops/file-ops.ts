// Create, rename and delete, from the explorer's menu: the entries a row gets,
// the three dialogs, and the writes. Each write is one `put`, so a folder's
// rename or delete is all or nothing, and one step undo takes back. A delete the
// host cannot keep to undo (an image, or too much text) is refused, and the
// dialog asks once more before it is sent again with `unjournaled`. After one lands the tree lists again and
// reveals the new path, and the open file follows a rename or closes on a delete
// (`FilePane.followWrite`).
//
// Focus, for a keyboard: Escape on the menu, or Cancel on a dialog, goes back to
// the row the menu was asked on. After a write it goes to the new row (a rename),
// into the new file's editor (a new file, which opens there), or to the nearest
// folder still listed above what was deleted.

import { fileNameOf } from '@stillpointlab/common-format/format';

import { words } from '../words';

import { FileOpDialog } from './dialog';
import {
  deleteChanges,
  filesUnder,
  folderProblem,
  isWithin,
  movedTo,
  nameRange,
  pathProblem,
  renameChanges,
  type ListingIndex,
} from './paths';

import type { Address, View } from '../address';
import type { HostClient } from '../host-client';
import type { MenuEntry } from '../menu/menu';
import type { FilePane } from '../pane';
import type { HostFileTree, TreeMenuDetail } from '../tree/host-file-tree';

export interface FileOpsContext {
  client: HostClient;
  tree: HostFileTree;
  pane: FilePane;
  /** The listing the tree shows. */
  listing(): ListingIndex;
  /** List the folder again. */
  refresh(): Promise<void>;
  /** Open what an address names, asking first when edits would be lost. */
  navigate(address: Address, how: 'push', focus: boolean): Promise<boolean>;
  /** Make the address name what the pane shows now, in place of the current entry. */
  showAddress(state: { path: string; view: View } | null): void;
  /** Whether a folder holds an app's locked files, so its files cannot all be moved from here. */
  holdsLocked?(folder: string): boolean;
}

export interface FileOps {
  /** The menu entries for a row the tree asked about; none for an app's row. */
  entriesFor(detail: Pick<TreeMenuDetail, 'path' | 'kind'>): MenuEntry[];
  /** Focus a row by path, if it is shown. */
  focusRow(path: string): boolean;
  /** Ask for a new file's path in `folder`, write it and open it: the menu's New file…. */
  newFile(folder: string): Promise<void>;
  readonly dialog: FileOpDialog;
  destroy(): void;
}

export function createFileOps(host: HTMLElement, context: FileOpsContext): FileOps {
  const { client, tree, pane } = context;
  const dialog = new FileOpDialog(host);
  const baseOf = (path: string) => pane.versionOf(path);

  const focusRow = (path: string): boolean => tree.focusRow(path);

  /** The tree's own tab stop: the selected row, or the first. */
  function focusTree(): void {
    tree.shadowRoot?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')?.focus();
  }

  /** Back to the row the menu was asked on. */
  function restore(path: string): void {
    if (path === '' || !focusRow(path)) focusTree();
  }

  // ---- New file ----

  async function newFile(folder: string): Promise<void> {
    let created: string | null = null;
    const landed = await dialog.askPath({
      title: words.fileOps.newFile.title,
      confirm: words.fileOps.newFile.confirm,
      value: folder === '' ? '' : `${folder}/`,
      check: (path) => pathProblem(context.listing(), path),
      run: async (path) => {
        const result = await client.put([{ kind: 'create', path, content: '' }]);
        if (!result.ok) return result.message;
        created = path;
        await context.refresh();
        return null;
      },
    });
    if (!landed || created === null) return restore(folder);
    const path: string = created;
    tree.reveal(path);
    // It opens in its editor; declined (unsaved edits elsewhere), its row has focus.
    if (!(await context.navigate({ path, view: 'edit' }, 'push', true))) {
      tree.reveal(path);
      focusRow(path);
    }
  }

  // ---- Rename ----

  async function rename(from: string, kind: 'file' | 'folder'): Promise<void> {
    const renaming = { from, kind };
    let moved: string | null = null;
    const landed = await dialog.askPath({
      title: words.fileOps.rename.title,
      confirm: words.fileOps.rename.confirm,
      value: from,
      select: nameRange(from),
      // The same path again is no rename: the dialog closes and nothing is sent.
      check: (to) => (to === from ? null : pathProblem(context.listing(), to, renaming)),
      run: async (to) => {
        if (to === from) return null;
        const changes = renameChanges(context.listing(), renaming, to, baseOf);
        const before = pane.current?.path;
        const result = await pane.followWrite(client.put(changes), (open) =>
          movedTo(open, from, to)
        );
        if (!result.ok) return result.message;
        const now = pane.current;
        if (now && now.path !== before) context.showAddress(now);
        moved = to;
        await context.refresh();
        return null;
      },
    });
    if (!landed || moved === null) return restore(from);
    tree.reveal(moved);
    focusRow(moved);
  }

  // ---- Delete ----

  async function remove(path: string, kind: 'file' | 'folder'): Promise<void> {
    // What the person is asked about is what is sent: the listing as it is now.
    const index = context.listing();
    const name = fileNameOf(path);
    const open = pane.current;
    const openInside = open !== null && isWithin(open.path, path);
    const unsaved = openInside && open.dirty;
    const landed = await dialog.askMessage({
      title:
        kind === 'file'
          ? unsaved
            ? words.fileOps.deleteUnsaved(name)
            : words.fileOps.deleteFile(name)
          : words.fileOps.deleteFolder(name, filesUnder(index, path).length),
      ...(kind === 'folder' && unsaved
        ? { detail: words.fileOps.deleteUnsavedInside(fileNameOf(open.path)) }
        : {}),
      confirm: words.fileOps.deleteConfirm,
      danger: true,
      run: async () => {
        const changes = deleteChanges(index, path, kind, baseOf);
        const write = (unjournaled: boolean) =>
          pane.followWrite(
            client.put(changes, unjournaled ? { unjournaled: true } : undefined),
            (at) => (isWithin(at, path) ? null : undefined)
          );
        const landed = async (result: Awaited<ReturnType<typeof write>>) => {
          if (!result.ok) return result.message;
          if (openInside && pane.current === null) context.showAddress(null);
          await context.refresh();
          return null;
        };
        const result = await write(false);
        if (!result.ok && result.code === 'HOST_CANNOT_UNDO') {
          // The host cannot keep it to undo: ask, and send it again saying so.
          const { reason } = result as { reason?: unknown };
          return {
            question:
              words.fileOps.cannotUndo[
                reason === 'too-large' || reason === 'link' ? reason : 'not-text'
              ],
            confirm: words.fileOps.deleteConfirm,
            run: async () => landed(await write(true)),
          };
        }
        return landed(result);
      },
    });
    if (!landed) return restore(path);
    // The nearest folder above that is still listed (an emptied one is removed).
    const folders = context.listing().folders;
    for (let cut = path.lastIndexOf('/'); cut > 0; cut = path.lastIndexOf('/', cut - 1)) {
      const folder = path.slice(0, cut);
      if (folders.has(folder)) {
        tree.reveal(folder);
        focusRow(folder);
        return;
      }
    }
    tree.selected = pane.current?.path ?? null;
    focusTree();
  }

  // ---- the entries ----

  function entry(label: string, action: () => void, problem: string | null = null): MenuEntry {
    return problem === null ? { label, action } : { label, action, disabled: true, title: problem };
  }

  function entriesFor({ path, kind }: Pick<TreeMenuDetail, 'path' | 'kind'>): MenuEntry[] {
    const { menu } = words;
    if (kind === 'app') return [];
    if (kind === 'file') {
      return [
        entry(menu.rename, () => void rename(path, 'file')),
        { ...entry(menu.delete, () => void remove(path, 'file')), danger: true },
      ];
    }
    if (path === '') return [entry(menu.newFile, () => void newFile(''))];
    const index = context.listing();
    const problem =
      folderProblem(index, path) ?? (context.holdsLocked?.(path) ? words.menu.holdsLocked : null);
    return [
      // A separate repository takes no new file from here; a cut listing still can.
      entry(menu.newFile, () => void newFile(path), index.separate.has(path) ? problem : null),
      entry(menu.rename, () => void rename(path, 'folder'), problem),
      { ...entry(menu.delete, () => void remove(path, 'folder'), problem), danger: true },
    ];
  }

  return {
    entriesFor,
    focusRow,
    newFile,
    dialog,
    destroy: () => dialog.destroy(),
  };
}
