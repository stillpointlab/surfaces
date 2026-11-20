// @vitest-environment jsdom
// Undo and redo in the page: the explorer header's buttons and their titles, the
// keys inside and outside an editor, the open file following an undo with no
// banner, a refusal in the notice, and the delete dialog's question for a delete
// that cannot be undone. An app's op written with no step is in `apps/apps.test.ts`.

import { afterEach, describe, expect, it } from 'vitest';

import { startPage } from './page';
import { BINARY, fakeHost, fakeRegistry } from './test-support';
import { words } from './words';

import type { HostPage } from './page';
import type { FakeEditor, FakeHost } from './test-support';
import type { ModalDialog } from '@stillpointlab/modal-dialog-component';

let host: FakeHost;
let page: HostPage;

async function start(): Promise<void> {
  history.replaceState(null, '', '/');
  host = fakeHost({
    'a.md': '# A\n',
    'docs/b.md': 'b',
    'pics/dot.png': BINARY,
    'pics/note.md': 'n',
  });
  page = startPage({ client: host, registry: fakeRegistry(), root: document.body });
  await page.ready;
  await settle();
}

afterEach(() => {
  page?.destroy();
  document.body.replaceChildren();
  localStorage.clear();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await new Promise((done) => setTimeout(done, 0));
}

const $ = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T & Element>(selector)!;
const undoButton = () => $<HTMLButtonElement>('.explorer-undo');
const redoButton = () => $<HTMLButtonElement>('.explorer-redo');
const shown = () => $('.pane-body').firstElementChild as HTMLElement & { content?: string };
const editor = () => shown() as unknown as FakeEditor;
const banner = () => ($('.pane-banner').hidden ? null : $('.pane-banner-text').textContent);
const notice = () => $('.page-notice .page-notice-text span')?.textContent ?? null;
const fileOp = () => $<ModalDialog>('modal-dialog.file-op');

/** A write as the explorer sends it, through the page's client. */
async function explorerWrite(changes: Parameters<FakeHost['put']>[0]): Promise<void> {
  const written = await host.put(changes);
  expect(written.ok).toBe(true);
  await settle();
}

function key(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'z',
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe('the buttons', () => {
  it('are disabled with nothing to do, and titled with their step’s label', async () => {
    await start();
    expect(undoButton().disabled).toBe(true);
    expect(redoButton().disabled).toBe(true);
    expect(undoButton().title).toBe(words.journal.nothingToUndo);

    await explorerWrite([{ kind: 'create', path: 'new.md', content: '' }]);
    expect(undoButton().disabled).toBe(false);
    expect(undoButton().title).toBe('Undo: Step 1');
    expect(undoButton().getAttribute('aria-label')).toBe('Undo: Step 1');
    expect(redoButton().disabled).toBe(true);

    undoButton().click();
    await settle();
    expect(host.disk.has('new.md')).toBe(false);
    expect(undoButton().disabled).toBe(true);
    expect(redoButton().title).toBe('Redo: Step 1');
    expect(notice()).toBe('Undone: Step 1');

    redoButton().click();
    await settle();
    expect(host.disk.has('new.md')).toBe(true);
    expect(notice()).toBe('Redone: Step 1');
    expect(undoButton().title).toBe('Undo: Step 1');
  });

  it('a refused undo says why in the notice, and the step stays', async () => {
    await start();
    await explorerWrite([{ kind: 'delete', path: 'a.md' }]);
    host.refuseNextStep = {
      code: 'HOST_UNDO_CONFLICT',
      message: '“Step 1” cannot be undone: "a.md" changed since. Nothing was written.',
      path: 'a.md',
    };
    expect(await page.undo()).toBe(false);
    expect(notice()).toBe('“Step 1” cannot be undone: "a.md" changed since. Nothing was written.');
    expect($('.page-notice').dataset.tone).toBe('error');
    expect(undoButton().disabled).toBe(false);
  });

  it('two undos at once run one after the other', async () => {
    await start();
    await explorerWrite([{ kind: 'create', path: 'one.md', content: '' }]);
    await explorerWrite([{ kind: 'create', path: 'two.md', content: '' }]);
    const both = await Promise.all([page.undo(), page.undo()]);
    expect(both).toEqual([true, true]);
    expect(host.disk.has('one.md')).toBe(false);
    expect(host.disk.has('two.md')).toBe(false);
  });
});

describe('the open file', () => {
  it('follows an undone rename, keeping its element and its edits, with no banner', async () => {
    await start();
    await page.navigate({ path: 'a.md', view: 'edit' });
    await settle();
    await explorerWrite([{ kind: 'move', from: 'a.md', path: 'docs/a.md' }]);
    // The page's own rename is followed by the explorer; here the step is the fake's.
    await page.navigate({ path: 'docs/a.md', view: 'edit' });
    await settle();
    const element = shown();
    editor().type(' and more');
    await settle();

    expect(await page.undo()).toBe(true);
    await settle();
    expect(page.pane.current).toMatchObject({ path: 'a.md', dirty: true });
    expect(shown()).toBe(element);
    expect(editor().getContent()).toBe('# A\n and more');
    expect(banner()).toBeNull();
    expect(location.hash).toBe('#/edit/a.md');
  });

  it('closes on an undone create, with no banner', async () => {
    await start();
    await explorerWrite([{ kind: 'create', path: 'new.md', content: 'fresh' }]);
    await page.navigate({ path: 'new.md', view: 'edit' });
    await settle();
    expect(await page.undo()).toBe(true);
    await settle();
    expect(page.pane.current).toBeNull();
    expect(banner()).toBeNull();
    expect(location.hash).toBe('');
  });

  it('keeps unsaved edits to a file an undo deletes, under the banner', async () => {
    await start();
    await explorerWrite([{ kind: 'create', path: 'new.md', content: 'fresh' }]);
    await page.navigate({ path: 'new.md', view: 'edit' });
    await settle();
    editor().type(' edits');
    await settle();
    expect(await page.undo()).toBe(true);
    await settle();
    expect(page.pane.current).toMatchObject({ path: 'new.md', dirty: true });
    expect(banner()).toBe(words.banner.deleted);
  });
});

describe('the keys', () => {
  it('Ctrl+Z undoes and Ctrl+Shift+Z redoes, with focus outside an editor', async () => {
    await start();
    await explorerWrite([{ kind: 'create', path: 'new.md', content: '' }]);
    const event = key(document.body, { ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    await settle();
    expect(host.disk.has('new.md')).toBe(false);
    key(document.body, { ctrlKey: true, shiftKey: true, key: 'Z' });
    await settle();
    expect(host.disk.has('new.md')).toBe(true);
  });

  it('are the editor’s inside an editor, and a text field’s in a field', async () => {
    await start();
    await explorerWrite([{ kind: 'create', path: 'new.md', content: '' }]);
    await page.navigate({ path: 'a.md', view: 'edit' });
    await settle();
    const event = key(shown(), { ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    await settle();
    expect(host.disk.has('new.md')).toBe(true);

    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    key(field, { ctrlKey: true });
    await settle();
    expect(host.disk.has('new.md')).toBe(true);
    field.remove();

    // In the preview the key is the page's again.
    await page.navigate({ path: 'a.md', view: 'preview' });
    await settle();
    key(shown(), { ctrlKey: true });
    await settle();
    expect(host.disk.has('new.md')).toBe(false);
  });

  it('do nothing while a dialog is open, or with Alt', async () => {
    await start();
    await explorerWrite([{ kind: 'create', path: 'new.md', content: '' }]);
    key(document.body, { ctrlKey: true, altKey: true });
    await settle();
    expect(host.disk.has('new.md')).toBe(true);
    void page.fileOps.newFile('');
    await settle();
    expect(fileOp().isOpen).toBe(true);
    key(document.body, { ctrlKey: true });
    await settle();
    expect(host.disk.has('new.md')).toBe(true);
    fileOp().close();
  });
});

describe('the delete dialog', () => {
  async function deleteFolder(path: string): Promise<void> {
    page.tree.reveal(path);
    page.tree.dispatchEvent(
      new CustomEvent('tree-menu', { bubbles: true, detail: { path, kind: 'folder', x: 0, y: 0 } })
    );
    const item = [...document.querySelectorAll<HTMLElement>('.host-menu [role="menuitem"]')].find(
      (each) => each.textContent === 'Delete…'
    );
    item!.click();
    await settle();
    expect(fileOp().isOpen).toBe(true);
  }
  const confirm = async () => {
    fileOp().querySelector<HTMLButtonElement>('[data-answer="confirm"]')!.click();
    await settle();
  };
  const question = () => {
    const shown = fileOp().querySelector<HTMLElement>('.file-op-question')!;
    return shown.hidden ? null : shown.textContent;
  };

  it('asks once more for a delete that cannot be undone; Cancel writes nothing', async () => {
    await start();
    await deleteFolder('pics');
    await confirm();
    expect(fileOp().isOpen).toBe(true);
    expect(question()).toBe(words.fileOps.cannotUndo['not-text']);
    expect(host.disk.has('pics/dot.png')).toBe(true);
    fileOp().querySelector<HTMLButtonElement>('[data-answer="cancel"]')!.click();
    await settle();
    expect(fileOp().isOpen).toBe(false);
    expect(host.disk.has('pics/dot.png')).toBe(true);
    expect(host.putOptions).toEqual([undefined]);
  });

  it('Delete sends it again, saying so, and the journal empties', async () => {
    await start();
    await explorerWrite([{ kind: 'create', path: 'new.md', content: '' }]);
    await deleteFolder('pics');
    await confirm();
    expect(question()).not.toBeNull();
    await confirm();
    expect(fileOp().isOpen).toBe(false);
    expect(host.disk.has('pics/dot.png')).toBe(false);
    expect(host.putOptions.at(-1)).toEqual({ unjournaled: true });
    await settle();
    expect(undoButton().disabled).toBe(true);
  });
});
