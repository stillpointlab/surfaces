// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { startPage } from '../page';
import { BINARY, fakeHost, fakeRegistry } from '../test-support';

import type { HostPage } from '../page';
import type { FakeEditor, FakeHost } from '../test-support';
import type { ModalDialog } from '@stillpointlab/modal-dialog-component';

let host: FakeHost;
let page: HostPage;

async function start(hash = ''): Promise<void> {
  history.replaceState(null, '', `/${hash}`);
  host = fakeHost({
    'a.md': '# A\n',
    'docs/b.md': 'b',
    'docs/c.txt': 'c',
    'pic.png': BINARY,
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
const dialog = () => $<ModalDialog>('modal-dialog.file-op');
const field = () => dialog().querySelector<HTMLInputElement>('input')!;
const error = () => {
  const shown = dialog().querySelector<HTMLElement>('.file-op-error')!;
  return shown.hidden ? null : shown.textContent;
};
const menuItems = () =>
  [...document.querySelectorAll<HTMLElement>('.host-menu [role="menuitem"]')].map((item) => ({
    label: item.textContent,
    disabled: item.getAttribute('aria-disabled') === 'true',
  }));
const shown = () => $('.pane-body').firstElementChild as HTMLElement & { content?: string };
const editor = () => shown() as unknown as FakeEditor;
const banner = () => ($('.pane-banner').hidden ? null : $('.pane-banner-text').textContent);
const focusedRow = () =>
  (page.tree.shadowRoot!.activeElement as HTMLElement | null)?.dataset.path ?? null;
const row = (path: string) =>
  page.tree.shadowRoot!.querySelector<HTMLElement>(`[data-path="${path}"]`)!;

/** The menu as the tree asks for it. */
function askMenu(path: string, kind = 'file'): void {
  page.tree.dispatchEvent(
    new CustomEvent('tree-menu', { bubbles: true, detail: { path, kind, x: 10, y: 20 } })
  );
}

async function choose(path: string, kind: string, label: string): Promise<void> {
  if (path !== '') {
    page.tree.reveal(path);
    row(path).focus();
  }
  askMenu(path, kind);
  const item = [...document.querySelectorAll<HTMLElement>('.host-menu [role="menuitem"]')].find(
    (each) => each.textContent === label
  );
  expect(item, `${label} for ${path}`).toBeDefined();
  item!.click();
  await settle();
  expect(dialog().isOpen).toBe(true);
}

function type(value: string): void {
  field().value = value;
  field().dispatchEvent(new Event('input', { bubbles: true }));
}

async function enter(): Promise<void> {
  field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await settle();
}

async function press(which: 'confirm' | 'cancel'): Promise<void> {
  dialog().querySelector<HTMLButtonElement>(`[data-answer="${which}"]`)!.click();
  await settle();
}

async function openInEditor(path: string): Promise<void> {
  await page.navigate({ path, view: 'edit' });
  await settle();
  expect(shown().localName).toBe('fake-editor');
}

describe('the menu on a row', () => {
  it('offers each kind of row its entries, and none for an app', async () => {
    await start();
    askMenu('a.md', 'file');
    expect(menuItems().map((item) => item.label)).toEqual(['Rename…', 'Delete…']);
    askMenu('docs', 'folder');
    expect(menuItems().map((item) => item.label)).toEqual(['New file…', 'Rename…', 'Delete…']);
    askMenu('', 'folder');
    expect(menuItems().map((item) => item.label)).toEqual(['New file…']);
    expect($('.host-menu').getAttribute('aria-label')).toBe('Options for the served folder');
    askMenu('docs', 'app');
    expect(page.menu.isOpen).toBe(false);
  });

  it('opens from the tree’s own right click, and Escape gives focus back to the row', async () => {
    await start();
    row('a.md').focus();
    row('a.md').firstElementChild!.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, composed: true, clientX: 30, clientY: 40 })
    );
    expect(page.menu.isOpen).toBe(true);
    expect($('.host-menu').style.left).toBe('30px');
    expect(document.activeElement?.textContent).toBe('Rename…');
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(page.menu.isOpen).toBe(false);
    expect(focusedRow()).toBe('a.md');
    // It never selected the row.
    expect(page.tree.selected).toBeNull();
  });

  it('a press outside closes it', async () => {
    await start();
    askMenu('a.md');
    $('.pane').dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(page.menu.isOpen).toBe(false);
    expect(dialog().isOpen).toBe(false);
  });

  it('turns off a separate repository’s writes, and a folder’s when the list is cut', async () => {
    await start();
    host.separate.add('ext');
    host.separate.add('docs/sub');
    await page.refresh();
    askMenu('ext', 'folder');
    expect(menuItems().every((item) => item.disabled)).toBe(true);
    askMenu('docs', 'folder');
    expect(menuItems().map((item) => item.disabled)).toEqual([false, true, true]);
    host.separate.clear();
    host.truncated = true;
    await page.refresh();
    askMenu('docs', 'folder');
    expect(menuItems().map((item) => item.disabled)).toEqual([false, true, true]);
    askMenu('docs/b.md', 'file');
    expect(menuItems().map((item) => item.disabled)).toEqual([false, false]);
  });
});

describe('New file', () => {
  it('starts with the folder’s path and a slash, creates an empty file, and opens it in its editor', async () => {
    await start();
    await choose('docs', 'folder', 'New file…');
    expect(dialog().title).toBe('New file');
    expect(field().value).toBe('docs/');
    expect(document.activeElement).toBe(field());
    type('docs/new.md');
    await enter();
    expect(host.puts).toEqual([[{ kind: 'create', path: 'docs/new.md', content: '' }]]);
    expect(dialog().isOpen).toBe(false);
    expect(host.disk.get('docs/new.md')).toBe('');
    expect($('.pane-path').textContent).toBe('docs/new.md');
    expect(shown().localName).toBe('fake-editor');
    expect(shown().dataset.focused).toBe('true');
    expect(location.hash).toBe('#/edit/docs/new.md');
    expect(page.tree.selected).toBe('docs/new.md');
    expect(row('docs/new.md')).not.toBeNull();
  });

  it('from the space under the rows, starts empty, and makes the folders it needs', async () => {
    await start();
    await choose('', 'folder', 'New file…');
    expect(field().value).toBe('');
    type('notes/today.md');
    await press('confirm');
    expect(host.puts).toEqual([[{ kind: 'create', path: 'notes/today.md', content: '' }]]);
    expect(page.tree.openPaths).toContain('notes');
  });

  it.each([
    ['', 'Enter a path.'],
    ['/x.md', 'Start the path inside the served folder, without a leading slash.'],
    ['docs/../x.md', 'A path cannot have a “..” segment.'],
    ['docs/', 'Enter a name after the last slash.'],
    ['a.md', 'There is already a file at a.md.'],
    ['docs', 'There is already a folder at docs.'],
    ['a.md/x.md', 'a.md is a file, so it cannot hold another.'],
  ])('checks %j before sending anything', async (path, message) => {
    await start();
    await choose('', 'folder', 'New file…');
    type(path);
    await enter();
    expect(error()).toBe(message);
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(host.puts).toEqual([]);
    expect(dialog().isOpen).toBe(true);
    expect(field().value).toBe(path);
    // Typing clears it.
    type(`${path}x`);
    expect(error()).toBeNull();
  });

  it('shows the server’s refusal under the field, and keeps the dialog and what was typed', async () => {
    await start();
    await choose('docs', 'folder', 'New file…');
    host.refuseNextPut = { code: 'HOST_BAD_REQUEST', message: 'The path has a "." segment.' };
    type('docs/./x.md');
    await enter();
    expect(error()).toBe('The path has a "." segment.');
    expect(dialog().isOpen).toBe(true);
    expect(field().value).toBe('docs/./x.md');
    expect(document.activeElement).toBe(field());
    type('docs/x.md');
    await enter();
    expect(dialog().isOpen).toBe(false);
    expect(host.disk.has('docs/x.md')).toBe(true);
  });

  it('takes no second confirm while a write is in flight, and Escape waits for it', async () => {
    await start();
    await choose('', 'folder', 'New file…');
    host.holdPut = true;
    type('one.md');
    await enter();
    await enter();
    await press('confirm');
    expect(host.puts).toHaveLength(1);
    expect(dialog().getAttribute('aria-busy')).toBe('true');
    expect(field().readOnly).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dialog().isOpen).toBe(true);
    host.releasePut();
    await settle();
    expect(dialog().isOpen).toBe(false);
    expect(host.puts).toHaveLength(1);
  });

  it('Cancel sends nothing and gives focus back to the row', async () => {
    await start();
    await choose('docs', 'folder', 'New file…');
    await press('cancel');
    expect(dialog().isOpen).toBe(false);
    expect(host.puts).toEqual([]);
    expect(focusedRow()).toBe('docs');
  });

  it('with unsaved edits elsewhere, asks before opening it; declined, its row has focus', async () => {
    await start();
    await openInEditor('a.md');
    editor().type('mine');
    await choose('', 'folder', 'New file…');
    type('n.md');
    await enter();
    expect(host.disk.get('n.md')).toBe('');
    const ask = $<ModalDialog>('modal-dialog.confirm');
    expect(ask.isOpen).toBe(true);
    expect(ask.title).toBe('Discard your unsaved edits to a.md?');
    ask.querySelector<HTMLButtonElement>('[data-answer="cancel"]')!.click();
    await settle();
    expect($('.pane-path').textContent).toBe('a.md');
    expect(editor().getContent()).toBe('# A\nmine');
    expect(focusedRow()).toBe('n.md');
  });
});

describe('Rename', () => {
  it('holds the path with the name selected, and sends one move; the tree reveals and focuses it', async () => {
    await start();
    await choose('docs/c.txt', 'file', 'Rename…');
    expect(dialog().title).toBe('Rename');
    expect(field().value).toBe('docs/c.txt');
    expect([field().selectionStart, field().selectionEnd]).toEqual([5, 10]);
    type('notes/c.txt');
    await enter();
    expect(host.puts).toEqual([[{ kind: 'move', from: 'docs/c.txt', path: 'notes/c.txt' }]]);
    expect(host.disk.get('notes/c.txt')).toBe('c');
    expect(host.disk.has('docs/c.txt')).toBe(false);
    expect(page.tree.selected).toBe('notes/c.txt');
    expect(focusedRow()).toBe('notes/c.txt');
  });

  it('sends nothing when the path is unchanged', async () => {
    await start();
    await choose('a.md', 'file', 'Rename…');
    await enter();
    expect(dialog().isOpen).toBe(false);
    expect(host.puts).toEqual([]);
  });

  it('renames a folder with one move per file, in one put', async () => {
    await start();
    await choose('docs', 'folder', 'Rename…');
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, 4]);
    type('guide');
    await enter();
    expect(host.puts).toEqual([
      [
        { kind: 'move', from: 'docs/b.md', path: 'guide/b.md' },
        { kind: 'move', from: 'docs/c.txt', path: 'guide/c.txt' },
      ],
    ]);
    expect(focusedRow()).toBe('guide');
  });

  it('refuses a folder moved inside itself, or onto a folder that is there', async () => {
    await start();
    host.disk.set('other/x.md', 'x');
    await page.refresh();
    await choose('docs', 'folder', 'Rename…');
    type('docs/inner');
    await enter();
    expect(error()).toBe('A folder cannot move inside itself.');
    type('other');
    await enter();
    expect(error()).toBe('There is already a folder at other.');
    expect(host.puts).toEqual([]);
  });

  it('moves an image without its content, so its bytes are kept', async () => {
    await start();
    await choose('pic.png', 'file', 'Rename…');
    type('img/pic.png');
    await enter();
    expect(host.puts).toEqual([[{ kind: 'move', from: 'pic.png', path: 'img/pic.png' }]]);
    expect(host.disk.get('img/pic.png')).toBe(BINARY);
  });

  it('the open file follows, keeping its element and its unsaved edits; Save writes the new path', async () => {
    await start();
    await openInEditor('a.md');
    const element = shown();
    const version = host.versions.get('a.md');
    editor().type('mine');
    await choose('a.md', 'file', 'Rename…');
    type('notes/a.md');
    await enter();
    expect(host.puts).toEqual([
      [{ kind: 'move', from: 'a.md', path: 'notes/a.md', base: version }],
    ]);
    expect(shown()).toBe(element);
    expect(editor().getContent()).toBe('# A\nmine');
    expect($('.pane-path').textContent).toBe('notes/a.md');
    expect($('.pane-unsaved').hidden).toBe(false);
    expect(location.hash).toBe('#/edit/notes/a.md');
    expect(document.title).toBe('● a.md — served');
    // The server's event for the move came before its answer: no banner.
    expect(banner()).toBeNull();
    host.emit({ type: 'changed', paths: ['a.md', 'notes/a.md'] });
    await settle();
    expect(banner()).toBeNull();
    await page.pane.save();
    expect(host.puts[1]).toEqual([
      { kind: 'write', path: 'notes/a.md', content: '# A\nmine', base: version },
    ]);
    expect(host.disk.get('notes/a.md')).toBe('# A\nmine');
    expect(banner()).toBeNull();
  });

  it('the open file follows its folder, and shows no message about a deleted file', async () => {
    await start('#/file/docs/b.md');
    await choose('docs', 'folder', 'Rename…');
    type('guide');
    await enter();
    expect(host.puts[0]![0]).toEqual({
      kind: 'move',
      from: 'docs/b.md',
      path: 'guide/b.md',
      base: host.versions.get('guide/b.md'),
    });
    expect($('.pane-path').textContent).toBe('guide/b.md');
    expect(shown().content).toBe('b');
    expect(location.hash).toBe('#/file/guide/b.md');
    expect($('.pane-message')).toBeNull();
    expect(banner()).toBeNull();
  });

  it('the open file renamed to another format opens again in that format', async () => {
    await start('#/file/docs/c.txt');
    await choose('docs/c.txt', 'file', 'Rename…');
    type('docs/c.png');
    await enter();
    expect(shown().localName).toBe('fake-image');
    expect(shown().getAttribute('src')).toBe('/api/raw?path=docs%2Fc.png');
    expect($('.pane-path').textContent).toBe('docs/c.png');
    expect(location.hash).toBe('#/file/docs/c.png');
  });

  it('with unsaved edits, a rename to another format keeps the element and the edits', async () => {
    await start();
    await openInEditor('docs/c.txt');
    const element = shown();
    editor().type('mine');
    await choose('docs/c.txt', 'file', 'Rename…');
    type('docs/c.png');
    await enter();
    expect(shown()).toBe(element);
    expect(editor().getContent()).toBe('cmine');
    expect($('.pane-path').textContent).toBe('docs/c.png');
  });

  it('a refusal for a file that changed on disk shows the server’s message', async () => {
    await start();
    await openInEditor('a.md');
    editor().type('mine');
    host.disk.set('a.md', 'theirs');
    host.versions.set('a.md', 'v-theirs');
    await choose('a.md', 'file', 'Rename…');
    type('b.md');
    await enter();
    expect(error()).toBe('changed');
    expect($('.pane-path').textContent).toBe('a.md');
  });
});

describe('Delete', () => {
  it('asks “Delete <name>?”, sends one delete, and gives focus to the folder above', async () => {
    await start();
    await choose('docs/c.txt', 'file', 'Delete…');
    expect(dialog().title).toBe('Delete c.txt?');
    const buttons = [...dialog().querySelectorAll('button')].map((button) => button.textContent);
    expect(buttons).toEqual(['Cancel', 'Delete']);
    // Enter confirms: the Delete button has focus.
    expect(document.activeElement?.textContent).toBe('Delete');
    await press('confirm');
    expect(host.puts).toEqual([[{ kind: 'delete', path: 'docs/c.txt' }]]);
    expect(host.disk.has('docs/c.txt')).toBe(false);
    expect(row('docs/c.txt')).toBeNull();
    expect(focusedRow()).toBe('docs');
  });

  it('a folder: “Delete <name> and the <n> files in it?”, one delete per file in one put', async () => {
    await start();
    await choose('docs', 'folder', 'Delete…');
    expect(dialog().title).toBe('Delete docs and the 2 files in it?');
    await press('confirm');
    expect(host.puts).toEqual([
      [
        { kind: 'delete', path: 'docs/b.md' },
        { kind: 'delete', path: 'docs/c.txt' },
      ],
    ]);
    expect(row('docs')).toBeNull();
  });

  it('the open file with unsaved edits: asks with the warning, and Cancel keeps everything', async () => {
    await start();
    await openInEditor('a.md');
    editor().type('mine');
    await choose('a.md', 'file', 'Delete…');
    expect(dialog().title).toBe('a.md has unsaved edits. Delete it anyway?');
    await press('cancel');
    expect(host.puts).toEqual([]);
    expect(editor().getContent()).toBe('# A\nmine');
    expect(focusedRow()).toBe('a.md');
  });

  it('the open file with unsaved edits, confirmed: sends its base, and the pane closes', async () => {
    await start();
    await openInEditor('a.md');
    const version = host.versions.get('a.md');
    editor().type('mine');
    await choose('a.md', 'file', 'Delete…');
    await press('confirm');
    expect(host.puts).toEqual([[{ kind: 'delete', path: 'a.md', base: version }]]);
    expect($('.pane-message').textContent).toBe('Select a file in the explorer.');
    expect($('.pane-header').hidden).toBe(true);
    expect(location.hash).toBe('');
    // No second question about the lost edits, and nothing about a file deleted on disk.
    expect($<ModalDialog>('modal-dialog.confirm').isOpen).toBe(false);
    host.emit({ type: 'changed', paths: ['a.md'] });
    await settle();
    expect($('.pane-message').textContent).toBe('Select a file in the explorer.');
  });

  it('a folder holding the open file with unsaved edits says so too', async () => {
    await start();
    await openInEditor('docs/b.md');
    editor().type('mine');
    await choose('docs', 'folder', 'Delete…');
    expect(dialog().title).toBe('Delete docs and the 2 files in it?');
    expect(dialog().querySelector('.confirm-detail')!.textContent).toBe(
      'b.md has unsaved edits, which will be lost.'
    );
    await press('confirm');
    expect($('.pane-header').hidden).toBe(true);
  });

  it('shows a refusal in the dialog and deletes nothing', async () => {
    await start();
    await choose('docs', 'folder', 'Delete…');
    host.refuseNextPut = {
      code: 'HOST_FILE_NOT_FOUND',
      message: 'There is no file at "docs/b.md".',
    };
    await press('confirm');
    expect(error()).toBe('There is no file at "docs/b.md".');
    expect(dialog().isOpen).toBe(true);
    expect(host.disk.has('docs/b.md')).toBe(true);
  });
});
