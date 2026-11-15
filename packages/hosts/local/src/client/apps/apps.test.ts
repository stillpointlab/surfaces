// @vitest-environment jsdom
// The apps in the page, with a fake HostClient and a fake shell: the rows, the
// lock and its confirmations, the app's address, the app pane's ops and events,
// a locked file in its preview, and the notice.
import { requestOp } from '@stillpointlab/common-format/app';
import { afterEach, describe, expect, it } from 'vitest';

import { startPage } from '../page';
import { fakeHost, fakeRegistry } from '../test-support';

import { editorLink } from './page-ops';
import { appTreeView } from './tree-view';

import type { FoundInstance } from '../host-client';
import type { HostPage } from '../page';
import type { FakeEditor, FakeHost } from '../test-support';
import type { ClientApps } from './registry';
import type { AppShellElement, AppShellInput } from '@stillpointlab/common-format/app';
import type { ModalDialog } from '@stillpointlab/modal-dialog-component';

/** A shell that keeps what it was set and taught. */
class FakeShell extends HTMLElement implements AppShellElement {
  inputs: AppShellInput[] = [];
  learned: { op: { type: string }; reply: object }[] = [];
  setState(input: AppShellInput): void {
    this.inputs.push(input);
  }
  learn(op: { type: string }, reply: object): void {
    this.learned.push({ op, reply });
  }
  opView(op: { type: string }) {
    return op.type === 'add-item' ? { type: 'zone', slug: 'kitchen' } : undefined;
  }
  async whenReady(): Promise<void> {}
}
if (!customElements.get('fake-shell')) customElements.define('fake-shell', FakeShell);

let loads = 0;
const apps: ClientApps = {
  fake: {
    meta: { label: 'Fake', icon: 'inventory' },
    shell: { tag: 'fake-shell', load: async () => void (loads += 1) },
    pageOps: { 'link-editor': editorLink },
  },
};

const HOME: FoundInstance = {
  app: 'fake',
  manifestPath: 'places/home/inventory.yaml',
  folder: 'places/home',
  label: 'Maple St House',
  icon: 'inventory',
  valid: true,
  errors: [],
  unlocked: false,
};
const ROOT: FoundInstance = {
  app: 'fake',
  manifestPath: 'tasks.yaml',
  folder: '',
  label: 'Release board',
  icon: 'task',
  valid: true,
  errors: [],
  unlocked: false,
  scope: ['tasks.yaml', 'todo/a.md'],
};

let host: FakeHost;
let page: HostPage;

function start(
  hash = '',
  instances: FoundInstance[] = [HOME, ROOT],
  before: (host: FakeHost) => void = () => undefined
): void {
  history.replaceState(null, '', `/${hash}`);
  host = fakeHost({
    'places/home/inventory.yaml': 'label: House\n',
    'places/home/rooms/kitchen.md': 'kitchen',
    'places/notes.md': 'notes',
    'tasks.yaml': 'tasks',
    'todo/a.md': 'a',
    'docs/b.md': 'b',
  });
  host.instances = instances.map((instance) => ({ ...instance }));
  before(host);
  page = startPage({ client: host, registry: fakeRegistry(), apps, root: document.body });
}

afterEach(() => {
  page?.destroy();
  document.body.replaceChildren();
  localStorage.clear();
});

const $ = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T & Element>(selector)!;
const row = (path: string) =>
  page.tree.shadowRoot!.querySelector<HTMLElement>(`[role="treeitem"][data-path="${path}"]`);
const shell = () => $('fake-shell') as unknown as FakeShell;
const dialog = () => $<ModalDialog>('modal-dialog.confirm');
const notice = () => $('.page-notice');

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await new Promise((done) => setTimeout(done, 0));
}

async function answer(which: 'confirm' | 'cancel'): Promise<void> {
  dialog().querySelector<HTMLButtonElement>(`[data-answer="${which}"]`)!.click();
  await settle();
}

function treeEvent(type: string, path: string, kind = 'file'): void {
  page.tree.dispatchEvent(
    new CustomEvent(type, { bubbles: true, detail: { path, kind, x: 10, y: 10 } })
  );
}

/** The menu's entries, as shown: label, and whether each is disabled. */
function entries(): { label: string; disabled: boolean; title: string | null }[] {
  return [...page.menu.element.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((item) => ({
    label: item.textContent ?? '',
    disabled: item.getAttribute('aria-disabled') === 'true',
    title: item.getAttribute('title'),
  }));
}

async function choose(label: string): Promise<void> {
  const item = [...page.menu.element.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (entry) => entry.textContent === label
  );
  item!.click();
  await settle();
}

async function openHome(sub = ''): Promise<void> {
  await page.navigate({ view: 'app', manifestPath: HOME.manifestPath, subPath: sub, query: '' });
  await settle();
}

describe('the row and the lock', () => {
  it('shows a locked instance as its app’s row, its files left out, its changes as the dot', async () => {
    start(
      '',
      [HOME, ROOT],
      (fake) => (fake.statuses = { 'places/home/rooms/kitchen.md': 'changed' })
    );
    await page.ready;
    page.tree.openPaths = ['places'];
    const home = row('places/home')!;
    expect(home.dataset.kind).toBe('app');
    expect(home.querySelector('.name')!.textContent).toBe('Maple St House');
    expect(home.querySelector('.unlocked')).toBeNull();
    expect(home.hasAttribute('aria-expanded')).toBe(false);
    expect(home.querySelector('.dot')).not.toBeNull();
    page.tree.reveal('places/home/rooms/kitchen.md');
    expect(row('places/home/rooms/kitchen.md')).toBeNull();
    expect(row('places/notes.md')).not.toBeNull();
  });

  it('opens the app from its row, on select and on activate', async () => {
    start();
    await page.ready;
    treeEvent('tree-select', 'places/home', 'app');
    await settle();
    expect(location.hash).toBe('#/app/places/home/inventory.yaml');
    expect(host.appCalls).toEqual(['page:places/home/inventory.yaml']);
    expect($('.app-pane').hidden).toBe(false);
    expect($('.file-pane').hidden).toBe(true);
    expect(shell().inputs[0]).toMatchObject({
      base: '#/app/places/home/inventory.yaml',
      location: 'served',
      view: { type: 'page', path: '' },
    });
    expect(shell().inputs[0].back).toBeUndefined();
    expect(document.title).toBe('Page / — served');
  });

  it('draws a root instance’s row above the tree, its scope left out', async () => {
    start();
    await page.ready;
    const root = $('.app-root');
    expect($('.app-roots').hidden).toBe(false);
    expect(root.querySelector('.app-root-label')!.textContent).toBe('Release board');
    expect(row('tasks.yaml')).toBeNull();
    expect(row('todo')).toBeNull();
    expect(row('docs')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('.app-root-open')!.click();
    await settle();
    expect(location.hash).toBe('#/app/tasks.yaml');
    expect(root.isConnected ? root : $('.app-root')).toBeTruthy();
    expect($('.app-root-open').getAttribute('aria-current')).toBe('page');
    $<HTMLButtonElement>('.app-root-menu').click();
    expect(entries().map((entry) => entry.label)).toEqual(['Open', 'Show files…']);
  });

  it('asks before showing the files, then lists them under the row', async () => {
    start();
    await page.ready;
    treeEvent('tree-menu', 'places/home', 'app');
    expect(entries().map((entry) => entry.label)).toEqual(['Open', 'Show files…']);
    await choose('Show files…');
    expect(dialog().title).toBe('Show this app’s files?');
    expect(dialog().textContent).toContain(
      'Changes made to them skip the app’s rules, and the app may report problems until they are fixed.'
    );
    await answer('cancel');
    expect(host.appCalls).toEqual([]);
    page.tree.openPaths = ['places'];
    treeEvent('tree-menu', 'places/home', 'app');
    await choose('Show files…');
    expect(dialog().querySelector('[data-answer="confirm"]')!.textContent).toBe('Show files');
    await answer('confirm');
    expect(host.appCalls).toEqual(['lock:places/home/inventory.yaml:false']);
    const home = row('places/home')!;
    expect(home.dataset.kind).toBe('app');
    expect(home.querySelector('.unlocked')).not.toBeNull();
    expect(row('places/home/inventory.yaml')).not.toBeNull();
    treeEvent('tree-menu', 'places/home', 'app');
    expect(entries().map((entry) => entry.label)).toEqual(['Open', 'Lock files', 'New file…']);
  });

  it('locks again, and shows what the lock reports in the notice', async () => {
    start('', [{ ...HOME, unlocked: true }]);
    await page.ready;
    host.lockAnswer = { errors: ['inventory.yaml: version must be 1'], warnings: [] };
    treeEvent('tree-menu', 'places/home', 'app');
    await choose('Lock files');
    expect(host.appCalls).toEqual(['lock:places/home/inventory.yaml:true']);
    expect(notice().textContent).toContain('Maple St House’s files are locked again.');
    expect([...notice().querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'inventory.yaml: version must be 1',
    ]);
    expect(notice().dataset.tone).toBe('warning');
    expect(row('places/home/inventory.yaml')).toBeNull();
  });

  it('asks before locking files when one of them has unsaved edits, and keeps them if declined', async () => {
    start('#/edit/places/home/rooms/kitchen.md', [{ ...HOME, unlocked: true }]);
    await page.ready;
    await settle();
    const editor = $('.pane-body').firstElementChild as unknown as FakeEditor;
    editor.type('!');
    treeEvent('tree-menu', 'places/home', 'app');
    await choose('Lock files');
    expect(dialog().title).toBe('Discard your unsaved edits to kitchen.md?');
    await answer('cancel');
    expect(host.appCalls).toEqual([]);
    treeEvent('tree-menu', 'places/home', 'app');
    await choose('Lock files');
    await answer('confirm');
    await settle();
    expect(host.appCalls).toEqual(['lock:places/home/inventory.yaml:true']);
    expect(location.hash).toBe('#/file/places/home/rooms/kitchen.md');
    expect($('.pane-locked').hidden).toBe(false);
  });

  it('disables Rename… and Delete… on a folder above a locked instance, with the reason', async () => {
    start();
    await page.ready;
    treeEvent('tree-menu', 'places', 'folder');
    const reason = 'This folder holds an app’s locked files. Show the files first.';
    expect(entries()).toEqual([
      { label: 'New file…', disabled: false, title: null },
      { label: 'Rename…', disabled: true, title: reason },
      { label: 'Delete…', disabled: true, title: reason },
    ]);
    // A root instance's scope holds `todo/a.md`; `docs` holds none of it.
    expect(page.fileOps.entriesFor({ path: 'docs', kind: 'folder' })[1].disabled).toBeUndefined();
  });

  it('opens a locked file by its address in the preview, with the locked line', async () => {
    start('#/edit/places/home/rooms/kitchen.md');
    await page.ready;
    await settle();
    expect(location.hash).toBe('#/file/places/home/rooms/kitchen.md');
    expect($('.pane-body').firstElementChild!.localName).toBe('fake-preview');
    expect($('.pane-locked').textContent).toBe(
      'This file is one of Maple St House’s files, which are locked, so it opens in its preview. Show the app’s files to edit it here.'
    );
    expect($('.pane-views').querySelector('[data-view="edit"]')).toBeNull();
    // Unlocked, it behaves as any other file.
    host.instances[0].unlocked = true;
    host.emit({ type: 'apps' });
    await settle();
    expect($('.pane-locked').hidden).toBe(true);
    expect($('.pane-views').querySelector('[data-view="edit"]')).not.toBeNull();
  });

  it('asks before leaving a file with unsaved edits for an app', async () => {
    start('#/edit/docs/b.md');
    await page.ready;
    await settle();
    ($('.pane-body').firstElementChild as unknown as FakeEditor).type('!');
    treeEvent('tree-select', 'places/home', 'app');
    await settle();
    expect(dialog().title).toBe('Discard your unsaved edits to b.md?');
    await answer('cancel');
    expect(location.hash).toBe('#/edit/docs/b.md');
    expect(host.appCalls).toEqual([]);
  });
});

describe('the app pane', () => {
  it('opens an app’s address after the first listing, with its sub-path and query', async () => {
    start('#/app/places/home/inventory.yaml/room/kitchen?x=1');
    await page.ready;
    await settle();
    expect(host.appCalls).toEqual(['page:places/home/inventory.yaml/room/kitchen?x=1']);
    expect(page.tree.selected).toBe('places/home');
  });

  it('says there is no app at an address no instance is at', async () => {
    start('#/app/elsewhere/inventory.yaml');
    await page.ready;
    await settle();
    expect($('.app-pane-message').textContent).toBe('There is no app at this address.');
    expect(host.appCalls).toEqual([]);
  });

  it('lists an invalid instance’s errors and offers Show files…, with no shell', async () => {
    start('', [{ ...HOME, valid: false, errors: ['Its files overlap the fake app at x.'] }]);
    await page.ready;
    await openHome();
    expect($('fake-shell')).toBeNull();
    expect($('.app-invalid-errors').textContent).toBe('Its files overlap the fake app at x.');
    $<HTMLButtonElement>('[data-action="show-files"]').click();
    await settle();
    expect(dialog().title).toBe('Show this app’s files?');
  });

  it('follows a redirect in place of the address', async () => {
    start();
    await page.ready;
    host.pageAnswer = (_m, path) =>
      path === ''
        ? { ok: true, redirect: '#/app/places/home/inventory.yaml/stage/1' }
        : { ok: true, view: { type: 'stage' }, state: {}, title: 'Stage', revision: 'r' };
    await openHome();
    expect(location.hash).toBe('#/app/places/home/inventory.yaml/stage/1');
    expect(shell().inputs.at(-1)!.view).toEqual({ type: 'stage' });
  });

  it('says so when the app has no page there', async () => {
    start();
    await page.ready;
    host.pageAnswer = () => ({ ok: false, code: 'HOST_APP_PAGE_NOT_FOUND', message: 'none' });
    await openHome('/nothing');
    expect($('.app-pane-message').textContent).toBe('The app has no page at this address.');
  });

  it('sends a core op with the shell’s view, and teaches the shell its reply', async () => {
    start();
    await page.ready;
    await openHome();
    const reply = await requestOp(shell(), { type: 'add-item', path: 'x.yaml' } as never);
    expect(reply).toEqual({ ok: true, done: 1 });
    expect(host.ops).toEqual([
      {
        manifestPath: HOME.manifestPath,
        op: { type: 'add-item', path: 'x.yaml' },
        view: { type: 'zone', slug: 'kitchen' },
      },
    ]);
    expect(shell().learned).toEqual([
      { op: { type: 'add-item', path: 'x.yaml' }, reply: { done: 1 } },
    ]);
  });

  it('answers project and refresh, and link-editor with the file’s editor address', async () => {
    start();
    await page.ready;
    await openHome();
    const projected = await requestOp(shell(), {
      type: 'project',
      view: { type: 'space' },
    } as never);
    expect(projected).toEqual({
      ok: true,
      state: { manifestPath: HOME.manifestPath, view: { type: 'space' } },
    });
    host.disk.set('docs/new.md', 'n');
    expect(await requestOp(shell(), { type: 'refresh' } as never)).toEqual({ ok: true });
    page.tree.reveal('docs/new.md');
    expect(row('docs/new.md')).not.toBeNull();
    const linked = await requestOp(shell(), {
      type: 'link-editor',
      path: 'places/home/rooms/kitchen.md',
    } as never);
    expect(linked).toEqual({ ok: true, href: '#/edit/places/home/rooms/kitchen.md' });
    expect(host.ops).toEqual([]);
  });

  it('claims a navigate to an address in the page, and leaves any other to the browser', async () => {
    start();
    await page.ready;
    await openHome();
    const inPage = new CustomEvent('navigate', {
      detail: { href: '#/app/places/home/inventory.yaml/room/kitchen' },
      bubbles: true,
      cancelable: true,
    });
    shell().dispatchEvent(inPage);
    expect(inPage.defaultPrevented).toBe(true);
    await settle();
    expect(location.hash).toBe('#/app/places/home/inventory.yaml/room/kitchen');
    expect(host.appCalls.at(-1)).toBe('page:places/home/inventory.yaml/room/kitchen');
    const away = new CustomEvent('navigate', {
      detail: { href: 'https://example.com/' },
      bubbles: true,
      cancelable: true,
    });
    shell().dispatchEvent(away);
    expect(away.defaultPrevented).toBe(false);
  });

  it('opens a card’s file in its preview, and a followed editor link in the preview of a locked file', async () => {
    start();
    await page.ready;
    await openHome();
    shell().dispatchEvent(
      new CustomEvent('open-card', { detail: { path: 'docs/b.md' }, bubbles: true })
    );
    await settle();
    expect(location.hash).toBe('#/file/docs/b.md');
    expect($('.file-pane').hidden).toBe(false);
    expect($('fake-shell')).toBeNull();
    await openHome();
    shell().dispatchEvent(
      new CustomEvent('navigate', {
        detail: { href: '#/edit/places/home/rooms/kitchen.md' },
        bubbles: true,
        cancelable: true,
      })
    );
    await settle();
    expect(location.hash).toBe('#/file/places/home/rooms/kitchen.md');
    expect($('.pane-locked').hidden).toBe(false);
  });

  it('shows an app’s notification in the page’s notice, the newest in place of the last', async () => {
    start();
    await page.ready;
    await openHome();
    const notify = (message: string, type: string) =>
      shell().dispatchEvent(
        new CustomEvent('notification', { detail: { message, type }, bubbles: true })
      );
    notify('Zone added.', 'success');
    expect(notice().querySelector('.page-notice-text')!.textContent).toBe('Zone added.');
    expect(notice().dataset.tone).toBe('success');
    expect(notice().getAttribute('role')).toBe('status');
    notify('Could not add.', 'error');
    expect(notice().querySelector('.page-notice-text')!.textContent).toBe('Could not add.');
    expect(notice().dataset.tone).toBe('error');
    $<HTMLButtonElement>('.page-notice-close').click();
    expect(notice().textContent).toBe('');
  });

  it('resolves the page again on reload-request', async () => {
    start();
    await page.ready;
    await openHome();
    shell().dispatchEvent(new CustomEvent('reload-request', { bubbles: true }));
    await settle();
    expect(host.appCalls).toEqual([
      'page:places/home/inventory.yaml',
      'page:places/home/inventory.yaml',
    ]);
  });
});

describe('the app pane staying current', () => {
  async function opened(): Promise<void> {
    start();
    await page.ready;
    await openHome();
    host.appCalls.length = 0;
  }

  const revisionWill = (revision: string) => {
    host.pageAnswer = (manifestPath, path) => ({
      ok: true,
      view: { type: 'page', path },
      state: { revision },
      title: 'Page',
      revision,
    });
  };

  it('reads the page again on a change in its region, and not on one outside it', async () => {
    await opened();
    host.emit({ type: 'changed', paths: ['docs/b.md'] });
    await settle();
    expect(host.appCalls).toEqual([]);
    revisionWill('r1');
    host.emit({ type: 'changed', paths: ['places/home/rooms/kitchen.md'] });
    await settle();
    expect(host.appCalls).toEqual(['page:places/home/inventory.yaml']);
    expect(shell().inputs.at(-1)!.state).toEqual({ revision: 'r1' });
  });

  it('reads the page again on listed and on status, and sets the input only when the revision moved', async () => {
    await opened();
    const before = shell().inputs.length;
    host.emit({ type: 'listed' });
    await settle();
    expect(host.appCalls.filter((call) => call.startsWith('page:'))).toHaveLength(1);
    // The same revision: nothing is set again.
    expect(shell().inputs).toHaveLength(before);
    revisionWill('after-commit');
    host.emit({ type: 'status' });
    await settle();
    expect(shell().inputs).toHaveLength(before + 1);
    expect(shell().inputs.at(-1)!.state).toEqual({ revision: 'after-commit' });
  });

  it('waits for its own op’s answer, then sets nothing the reply already showed', async () => {
    await opened();
    const before = shell().inputs.length;
    host.holdOp = true;
    const asked = requestOp(shell(), { type: 'add-zone', title: 'Attic' } as never);
    await settle();
    // The op's write is reported before its answer: the read waits.
    revisionWill('op1');
    host.emit({ type: 'changed', paths: ['places/home/rooms/attic.md'] });
    host.emit({ type: 'listed' });
    host.emit({ type: 'status' });
    await settle();
    expect(host.appCalls).toEqual(['op:add-zone']);
    host.releaseOp();
    await asked;
    await settle();
    expect(host.appCalls.filter((call) => call.startsWith('page:')).length).toBeGreaterThan(0);
    expect(shell().learned).toHaveLength(1);
    expect(shell().inputs).toHaveLength(before);
  });

  it('opens the explorer’s commit dialog for the app’s check-in', async () => {
    start('', [HOME, ROOT], (fake) => (fake.gitInfo = { state: 'repository', branch: 'main' }));
    await page.ready;
    await openHome();
    shell().dispatchEvent(new CustomEvent('checkin-request', { bubbles: true }));
    await settle();
    expect(host.gitCalls).toContain('changes');
  });
});

describe('the tree view', () => {
  it('keeps a separate repository, and the app’s row when the listing does not name its folder', () => {
    const view = appTreeView(
      [
        { path: 'sub', type: 'tree' },
        { path: 'inv/inventory.yaml', type: 'blob' },
      ],
      { 'inv/inventory.yaml': 'new' },
      [{ ...HOME, manifestPath: 'inv/inventory.yaml', folder: 'inv' }]
    );
    expect(view.nodes.map((node) => node.path).sort()).toEqual(['inv', 'sub']);
    expect(view.marks.inv.app).toEqual({ label: 'Maple St House', icon: 'inventory' });
    expect(view.marks['inv/inventory.yaml']).toEqual({ status: 'new' });
  });
});

it('loads an app’s shell once for the instance it shows', async () => {
  loads = 0;
  start();
  await page.ready;
  await openHome();
  await openHome('/room/kitchen');
  expect(loads).toBe(1);
  expect($('fake-shell')).not.toBeNull();
});
