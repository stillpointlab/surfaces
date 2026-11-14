// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startPage } from './page';
import { BINARY, fakeHost, fakeRegistry } from './test-support';

import type { HostPage } from './page';
import type { FakeEditor, FakeHost } from './test-support';
import type { ModalDialog } from '@stillpointlab/modal-dialog-component';

let host: FakeHost;
let page: HostPage;
let prepared: string[];

function start(hash = ''): void {
  history.replaceState(null, '', `/${hash}`);
  host = fakeHost({
    'a.md': '# A\n',
    'docs/b.md': 'b',
    'docs/c.txt': 'c',
    'pic.png': BINARY,
    'blob.bin': BINARY,
    Makefile: 'all:\n',
  });
  prepared = [];
  page = startPage({
    client: host,
    registry: fakeRegistry(),
    prepare: async (format) => void prepared.push(format.id),
    root: document.body,
  });
}

afterEach(() => {
  page?.destroy();
  document.body.replaceChildren();
  localStorage.clear();
});

const $ = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T & Element>(selector)!;
const shown = () => $('.pane-body').firstElementChild as HTMLElement & { content?: string };
const message = () => $('.pane-message')?.textContent;
const editor = () => shown() as unknown as FakeEditor;
const unsaved = () => !$('.pane-unsaved').hidden;
const banner = () => ($('.pane-banner').hidden ? null : $('.pane-banner-text').textContent);
const dialog = () => $<ModalDialog>('modal-dialog.confirm');

/** Settle the page's promises and the fake host's microtasks. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await new Promise((done) => setTimeout(done, 0));
}

/** The open confirmation's question, or null. */
function asking(): string | null {
  return dialog().isOpen ? dialog().title : null;
}

async function answer(which: 'confirm' | 'cancel'): Promise<void> {
  dialog().querySelector<HTMLButtonElement>(`[data-answer="${which}"]`)!.click();
  await settle();
}

function treeEvent(type: string, path: string, kind = 'file'): void {
  page.tree.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { path, kind } }));
}

async function openInEditor(path: string): Promise<void> {
  treeEvent('tree-activate', path);
  await settle();
  expect(shown().localName).toBe('fake-editor');
}

describe('opening', () => {
  it('opens what the address names, after the first listing', async () => {
    start('#/file/docs/b.md');
    await page.ready;
    expect(shown().localName).toBe('fake-preview');
    expect(shown().content).toBe('b');
    expect($('.pane-path').textContent).toBe('docs/b.md');
    expect(page.tree.selected).toBe('docs/b.md');
    expect(page.tree.openPaths).toContain('docs');
    expect(document.title).toBe('b.md — served');
  });

  it('opens the editor from #/edit/, and the preview of a format without one', async () => {
    start('#/edit/a.md');
    await page.ready;
    expect(shown().localName).toBe('fake-editor');
    await page.navigate({ path: 'pic.png', view: 'edit' });
    await settle();
    expect(shown().localName).toBe('fake-image');
    expect(shown().getAttribute('src')).toBe('/api/raw?path=pic.png');
    expect(location.hash).toBe('#/file/pic.png');
    expect($('.pane-views').hidden).toBe(true);
  });

  it('says so in the address when a link asks for an editor the format does not have', async () => {
    start('#/edit/pic.png');
    await page.ready;
    expect(shown().localName).toBe('fake-image');
    expect(location.hash).toBe('#/file/pic.png');
  });

  it('prepares a format before its element mounts', async () => {
    start('#/file/a.md');
    await page.ready;
    expect(prepared).toEqual(['text']);
  });

  it('opens on tree-select in the preview and on tree-activate in the editor', async () => {
    start();
    await page.ready;
    expect(message()).toBe('Select a file in the explorer.');
    treeEvent('tree-select', 'docs/c.txt');
    await settle();
    expect(shown().localName).toBe('fake-preview');
    expect(location.hash).toBe('#/file/docs/c.txt');
    treeEvent('tree-activate', 'docs/c.txt');
    await settle();
    expect(shown().localName).toBe('fake-editor');
    expect(location.hash).toBe('#/edit/docs/c.txt');
    expect(shown().dataset.focused).toBe('true');
  });

  it('opens nothing for a folder row', async () => {
    start();
    await page.ready;
    treeEvent('tree-select', 'docs', 'folder');
    treeEvent('tree-activate', 'docs', 'folder');
    await settle();
    expect(host.gets).toEqual([]);
    expect(message()).toBe('Select a file in the explorer.');
  });

  it('opens a text file nothing matched with the fallback', async () => {
    start('#/file/Makefile');
    await page.ready;
    expect(shown().content).toBe('all:\n');
  });

  it.each([
    ['blob.bin', 'No format opens this file, and it is not text.'],
    ['nothing.md', 'There is no file at this path.'],
    ['../outside.md', 'This path leads outside the served folder.'],
  ])('says why it cannot open %s', async (path, words) => {
    start(`#/file/${path}`);
    await page.ready;
    expect(message()).toBe(words);
  });

  it("says the server's own message for a refusal it has no words for", async () => {
    start();
    await page.ready;
    host.get = async () => ({ ok: false, code: 'HOST_FORBIDDEN', message: 'Not from here.' });
    await page.navigate({ path: 'a.md', view: 'preview' });
    await settle();
    expect(message()).toBe('This file could not be opened. Not from here.');
  });

  it('a late answer for a file no longer selected never lands, and reads do not pile up', async () => {
    start();
    await page.ready;
    host.hold = true;
    for (const path of ['a.md', 'docs/b.md', 'docs/c.txt', 'Makefile', 'a.md', 'docs/c.txt']) {
      treeEvent('tree-select', path);
      await settle();
    }
    host.release();
    await settle();
    host.release();
    await settle();
    // The first read, then only the newest.
    expect(host.gets).toEqual(['a.md', 'docs/c.txt']);
    expect($('.pane-path').textContent).toBe('docs/c.txt');
    expect(shown().content).toBe('c');
    expect(location.hash).toBe('#/file/docs/c.txt');
  });

  it('lists the folder again on a listed event, and keeps the open folders by root', async () => {
    start();
    await page.ready;
    page.tree.reveal('docs/b.md');
    expect(JSON.parse(localStorage.getItem('surfaces.open-folders.root-1')!)).toEqual(['docs']);
    host.disk.set('new/d.md', 'd');
    host.emit({ type: 'listed' });
    await settle();
    page.tree.reveal('new/d.md');
    expect(page.tree.shadowRoot!.querySelector('[data-path="new/d.md"]')).not.toBeNull();
    page.destroy();
    document.body.replaceChildren();
    start();
    await page.ready;
    expect([...page.tree.openPaths].sort()).toEqual(['docs', 'new']);
  });
});

describe('editing and saving', () => {
  beforeEach(async () => {
    start('#/file/a.md');
    await page.ready;
  });

  it('marks the file unsaved on a content-change, and clears the mark when the text is back', async () => {
    await openInEditor('a.md');
    expect(unsaved()).toBe(false);
    expect(($('.pane-save') as HTMLButtonElement).disabled).toBe(true);
    editor().type('more');
    expect(unsaved()).toBe(true);
    expect(document.title).toBe('● a.md — served');
    expect(($('.pane-save') as HTMLButtonElement).disabled).toBe(false);
    editor().setContent('# A\n');
    editor().type('');
    expect(unsaved()).toBe(false);
  });

  it('saves with one write based on the version it opened, and takes the new version', async () => {
    await openInEditor('a.md');
    const opened = host.versions.get('a.md');
    editor().type('more');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
    await settle();
    expect(host.puts).toEqual([
      [{ kind: 'write', path: 'a.md', content: '# A\nmore', base: opened }],
    ]);
    expect(host.disk.get('a.md')).toBe('# A\nmore');
    expect(unsaved()).toBe(false);
    // The server reported the page's own write: nothing changes.
    expect(banner()).toBeNull();
    const saved = host.versions.get('a.md');
    editor().type('!');
    $<HTMLButtonElement>('.pane-save').click();
    await settle();
    expect(host.puts[1][0]).toMatchObject({ base: saved });
    expect(host.disk.get('a.md')).toBe('# A\nmore!');
  });

  it('Cmd+S saves as well, and a save in the preview does nothing', async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true }));
    await settle();
    expect(host.puts).toEqual([]);
    await openInEditor('a.md');
    editor().type('x');
    const event = new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true });
    window.dispatchEvent(event);
    await settle();
    expect(event.defaultPrevented).toBe(true);
    expect(host.puts).toHaveLength(1);
  });

  it('a save refused with HOST_FILE_CHANGED shows the banner, with no event', async () => {
    await openInEditor('a.md');
    editor().type('mine');
    host.disk.set('a.md', 'theirs');
    host.versions.set('a.md', 'v-theirs');
    await page.pane.save();
    await settle();
    expect(banner()).toBe(
      'This file changed on disk after you opened it. Your edits are not saved.'
    );
    expect(host.disk.get('a.md')).toBe('theirs');
    expect(unsaved()).toBe(true);
  });

  it('a save refused for another reason says why and keeps the edits', async () => {
    await openInEditor('a.md');
    editor().type('mine');
    host.refuseNextPut = { code: 'HOST_WRITE_FAILED', message: 'The disk is full.' };
    await page.pane.save();
    expect($('.pane-error').textContent).toBe('Your edits could not be saved. The disk is full.');
    expect(unsaved()).toBe(true);
    await page.pane.save();
    expect($('.pane-error').hidden).toBe(true);
  });

  it('its own save raises no banner, even with edits made while it was saving', async () => {
    await openInEditor('a.md');
    editor().type('mine');
    const saving = page.pane.save();
    editor().type(' and more');
    await saving;
    await settle();
    expect(host.disk.get('a.md')).toBe('# A\nmine');
    expect(banner()).toBeNull();
    expect(unsaved()).toBe(true);
    // An event naming the file with its version unchanged raises nothing either.
    host.emit({ type: 'changed', paths: ['a.md'] });
    await settle();
    expect(banner()).toBeNull();
    expect(editor().getContent()).toBe('# A\nmine and more');
  });
});

describe('a change on disk', () => {
  beforeEach(async () => {
    start('#/file/a.md');
    await page.ready;
  });

  it('with no unsaved edits, gives the element the new content in place', async () => {
    const preview = shown();
    host.writeOutside('a.md', 'new');
    await settle();
    expect(shown()).toBe(preview);
    expect(preview.content).toBe('new');
    await openInEditor('a.md');
    const open = shown();
    host.writeOutside('a.md', 'newer');
    await settle();
    expect(shown()).toBe(open);
    expect(editor().getContent()).toBe('newer');
    expect(banner()).toBeNull();
  });

  it('ignores a change to another file, and one that leaves the version as it was', async () => {
    host.writeOutside('docs/b.md', 'other');
    host.emit({ type: 'changed', paths: ['a.md'] });
    await settle();
    expect(shown().content).toBe('# A\n');
  });

  it('with unsaved edits, shows the banner; Reload asks, and Cancel keeps the edits', async () => {
    await openInEditor('a.md');
    editor().type('mine');
    host.writeOutside('a.md', 'theirs');
    await settle();
    expect(banner()).toBe(
      'This file changed on disk after you opened it. Your edits are not saved.'
    );
    expect(editor().getContent()).toBe('# A\nmine');
    $<HTMLButtonElement>('.pane-reload').click();
    await settle();
    expect(asking()).toBe('Reload from disk?');
    expect(dialog().textContent).toContain('Your unsaved edits will be lost.');
    await answer('cancel');
    expect(editor().getContent()).toBe('# A\nmine');
    expect(banner()).not.toBeNull();
    $<HTMLButtonElement>('.pane-reload').click();
    await settle();
    await answer('confirm');
    expect(editor().getContent()).toBe('theirs');
    expect(unsaved()).toBe(false);
    expect(banner()).toBeNull();
  });

  it('Save under the banner asks, and Save anyway sends the newer version as the base', async () => {
    await openInEditor('a.md');
    editor().type('mine');
    host.writeOutside('a.md', 'theirs');
    await settle();
    const newer = host.versions.get('a.md');
    void page.pane.save();
    await settle();
    expect(asking()).toBe('Save over the newer file?');
    expect(dialog().textContent).toContain(
      'The file on disk changed after you opened it, and saving replaces those changes with yours.'
    );
    await answer('cancel');
    expect(host.puts).toEqual([]);
    void page.pane.save();
    await settle();
    await answer('confirm');
    expect(host.puts).toEqual([
      [{ kind: 'write', path: 'a.md', content: '# A\nmine', base: newer }],
    ]);
    expect(host.disk.get('a.md')).toBe('# A\nmine');
    expect(banner()).toBeNull();
    expect(unsaved()).toBe(false);
  });

  it('when the disk now holds exactly the edits, nothing is unsaved', async () => {
    await openInEditor('a.md');
    editor().type('same');
    host.writeOutside('a.md', '# A\nsame');
    await settle();
    expect(banner()).toBeNull();
    expect(unsaved()).toBe(false);
  });

  it('deleted with no edits: the pane says so, and opens the file when it comes back', async () => {
    host.writeOutside('a.md', null);
    await settle();
    expect(message()).toBe('This file was deleted on disk.');
    host.writeOutside('a.md', 'back');
    await settle();
    expect(shown().content).toBe('back');
  });

  it('deleted under edits: the banner, and Save asks before it creates the file again', async () => {
    await openInEditor('a.md');
    editor().type('mine');
    host.writeOutside('a.md', null);
    await settle();
    expect(banner()).toBe('This file was deleted on disk. Your edits are not saved.');
    expect($('.pane-reload').hidden).toBe(true);
    void page.pane.save();
    await settle();
    expect(asking()).toBe('Create the file again?');
    await answer('confirm');
    expect(host.puts).toEqual([[{ kind: 'create', path: 'a.md', content: '# A\nmine' }]]);
    expect(host.disk.get('a.md')).toBe('# A\nmine');
    expect(banner()).toBeNull();
  });

  it('an image is given a new element on a change, and says so when it is deleted', async () => {
    await page.navigate({ path: 'pic.png', view: 'preview' });
    await settle();
    const before = shown();
    host.writeOutside('pic.png', 'still binary');
    host.disk.set('pic.png', BINARY);
    await settle();
    expect(shown()).not.toBe(before);
    expect(shown().localName).toBe('fake-image');
    host.writeOutside('pic.png', null);
    await settle();
    expect(message()).toBe('This file was deleted on disk.');
  });
});

describe('leaving unsaved edits', () => {
  beforeEach(async () => {
    start('#/edit/a.md');
    await page.ready;
    editor().type('mine');
  });

  it('another row asks; Cancel keeps the file, its edits and the selection', async () => {
    page.tree.selected = 'docs/b.md';
    treeEvent('tree-select', 'docs/b.md');
    await settle();
    expect(asking()).toBe('Discard your unsaved edits to a.md?');
    expect([...dialog().querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Cancel',
      'Discard',
    ]);
    await answer('cancel');
    expect($('.pane-path').textContent).toBe('a.md');
    expect(editor().getContent()).toBe('# A\nmine');
    expect(page.tree.selected).toBe('a.md');
    expect(location.hash).toBe('#/edit/a.md');
  });

  it('Discard opens the other file and writes nothing', async () => {
    treeEvent('tree-select', 'docs/b.md');
    await settle();
    await answer('confirm');
    expect($('.pane-path').textContent).toBe('docs/b.md');
    expect(location.hash).toBe('#/file/docs/b.md');
    expect(host.puts).toEqual([]);
    expect(host.disk.get('a.md')).toBe('# A\n');
  });

  it('the switch to Preview asks', async () => {
    $<HTMLButtonElement>('.pane-views [data-view="preview"]').click();
    await settle();
    expect(asking()).toBe('Discard your unsaved edits to a.md?');
    await answer('confirm');
    expect(shown().localName).toBe('fake-preview');
    expect(shown().content).toBe('# A\n');
  });

  it('Back asks, and Cancel puts the address back', async () => {
    await page.pane.save();
    await page.navigate({ path: 'docs/b.md', view: 'edit' });
    await settle();
    editor().type('mine');
    history.back();
    await vi.waitFor(() => expect(asking()).toBe('Discard your unsaved edits to b.md?'));
    await answer('cancel');
    await vi.waitFor(() => expect(location.hash).toBe('#/edit/docs/b.md'));
    await settle();
    expect(asking()).toBeNull();
    expect($('.pane-path').textContent).toBe('docs/b.md');
    history.back();
    await vi.waitFor(() => expect(asking()).not.toBeNull());
    await answer('confirm');
    await vi.waitFor(() => expect($('.pane-path').textContent).toBe('a.md'));
    expect(location.hash).toBe('#/edit/a.md');
  });

  it('closing the tab is held by beforeunload', () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
