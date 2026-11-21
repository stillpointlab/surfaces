// @vitest-environment jsdom
// Step 2 in the page, with a fake HostClient: the tasks entry in the registry,
// an app's options-menu request, and creating an instance from a folder's menu.
import { requestOp } from '@stillpointlab/common-format/app';
import { afterEach, describe, expect, it } from 'vitest';

import { startPage } from '../page';
import { fakeHost, fakeRegistry } from '../test-support';
import { words } from '../words';

import { createFolderProblem } from './create-dialog';
import { createAppRegistry } from './registry';

import type { FoundInstance } from '../host-client';
import type { HostPage } from '../page';
import type { FakeHost } from '../test-support';
import type { ClientApps } from './registry';
import type { AppShellInput, Result } from '@stillpointlab/common-format/app';
import type { ModalDialog } from '@stillpointlab/modal-dialog-component';

/** A shell whose board asks the page's menu, as tasks' board does. */
class MenuShell extends HTMLElement {
  inputs: AppShellInput[] = [];
  setState(input: AppShellInput): void {
    this.inputs.push(input);
    if (!this.querySelector('.board')) {
      const board = document.createElement('div');
      board.className = 'board';
      const button = document.createElement('button');
      button.className = 'card-menu';
      board.append(button);
      this.append(board);
    }
  }
  learn(): void {}
  opView(): undefined {
    return undefined;
  }
  async whenReady(): Promise<void> {}
}
if (!customElements.get('menu-shell')) customElements.define('menu-shell', MenuShell);

/** A create form that answers `submit()` with its host's answer to `create`. */
class FakeCreate extends HTMLElement {
  results: Result[] = [];
  states: object[] = [];
  setState(state: object): void {
    this.states.push(state);
    this.textContent = 'the app’s own fields';
  }
  async submit(): Promise<Result> {
    const result = await requestOp(this, { type: 'create', input: { label: 'Mine' } } as never);
    this.results.push(result);
    return result;
  }
}
if (!customElements.get('fake-create')) customElements.define('fake-create', FakeCreate);

const apps: ClientApps = {
  board: {
    meta: {
      label: 'Board',
      icon: 'task',
      create: {
        noun: 'a board',
        defaultFolder: 'board',
        folderHelp: 'Where the board lives.',
        folderExample: '“board” or “docs/board”',
        rootConsent: { warning: 'The root holds one app only.', confirm: 'I understand' },
      },
    },
    shell: { tag: 'menu-shell', load: async () => undefined },
    create: { tag: 'fake-create', load: async () => undefined },
  },
  plain: {
    meta: { label: 'Plain', icon: 'inventory' },
    shell: { tag: 'menu-shell', load: async () => undefined },
  },
};

const BOARD: FoundInstance = {
  app: 'board',
  manifestPath: 'work/board.yaml',
  folder: 'work',
  label: 'Board',
  icon: 'task',
  valid: true,
  errors: [],
  unlocked: false,
};

let host: FakeHost;
let page: HostPage;

function start(instances: FoundInstance[] = []): void {
  history.replaceState(null, '', '/');
  host = fakeHost({ 'docs/a.md': 'a', 'work/board.yaml': '', 'readme.md': 'r' });
  host.instances = instances.map((instance) => ({ ...instance }));
  host.separate.add('vendor');
  page = startPage({ client: host, registry: fakeRegistry(), apps, root: document.body });
}

afterEach(() => {
  page?.destroy();
  document.body.replaceChildren();
  localStorage.clear();
});

const $ = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T & Element>(selector)!;
const createDialog = () => $<ModalDialog>('modal-dialog.app-create');
const folderField = () => $<HTMLInputElement>('#app-create-folder');
const form = () => $('fake-create') as unknown as FakeCreate;

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await new Promise((done) => setTimeout(done, 0));
}

function menuOn(path: string, kind: string): void {
  page.tree.dispatchEvent(
    new CustomEvent('tree-menu', { bubbles: true, detail: { path, kind, x: 5, y: 5 } })
  );
}

function entries(): { label: string; disabled: boolean; title: string | null }[] {
  return [...page.menu.element.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((item) => ({
    label: item.querySelector('.host-menu-label')?.textContent ?? '',
    disabled: item.getAttribute('aria-disabled') === 'true',
    title: item.querySelector('.host-menu-reason')?.textContent ?? null,
  }));
}

async function choose(label: string): Promise<void> {
  [...page.menu.element.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .find((item) => item.textContent === label)!
    .click();
  await settle();
}

function press(answer: 'confirm' | 'cancel'): void {
  createDialog().querySelector<HTMLButtonElement>(`[data-answer="${answer}"]`)!.click();
}

describe('the registration', () => {
  it('has tasks beside inventory: its meta, its shell and its create form', () => {
    const registry = createAppRegistry();
    expect(Object.keys(registry).sort()).toEqual(['inventory', 'tasks']);
    expect(registry.tasks.meta).toMatchObject({ label: 'Tasks', icon: 'task' });
    expect(registry.tasks.meta.create?.rootConsent).toBeDefined();
    expect(registry.tasks.shell.tag).toBe('spl-tasks-app');
    expect(registry.tasks.create?.tag).toBe('spl-tasks-create');
    expect(registry.inventory.create?.tag).toBe('spl-inventory-create');
  });
});

describe('an app’s options menu', () => {
  it('opens the page’s menu at the anchor, and answers the choice on the element that asked', async () => {
    start([BOARD]);
    await page.ready;
    await page.navigate({ view: 'app', manifestPath: BOARD.manifestPath, subPath: '', query: '' });
    await settle();
    const board = $('menu-shell .board');
    const chosen: unknown[] = [];
    board.addEventListener('options-menu-select', (event) =>
      chosen.push((event as CustomEvent).detail)
    );
    board.dispatchEvent(
      new CustomEvent('open-options-menu', {
        detail: {
          items: [
            { id: 'move', label: 'Move to…' },
            { id: 'resolve', label: 'Resolve', disabled: true, title: 'Nothing to resolve' },
            { nonsense: true },
          ],
          anchor: $('menu-shell .card-menu'),
        },
        bubbles: true,
        composed: true,
      })
    );
    expect(page.menu.isOpen).toBe(true);
    expect(entries()).toEqual([
      { label: 'Move to…', disabled: false, title: null },
      { label: 'Resolve', disabled: true, title: 'Nothing to resolve' },
    ]);
    await choose('Move to…');
    expect(chosen).toEqual([{ itemId: 'move' }]);
    expect(page.menu.isOpen).toBe(false);
  });
});

describe('a page route’s redirect', () => {
  it('opens the landing’s redirect in place of the address, and passes a ?path= link’s query', async () => {
    start([BOARD]);
    await page.ready;
    host.pageAnswer = (_m, path, query) =>
      path === '' && query === ''
        ? { ok: true, redirect: '#/app/work/board.yaml/stage/1/phase/1' }
        : {
            ok: true,
            view: { type: 'board', path, query },
            state: {},
            title: 'Board',
            revision: 'r',
          };
    const before = history.length;
    await page.navigate({ view: 'app', manifestPath: BOARD.manifestPath, subPath: '', query: '' });
    await settle();
    expect(location.hash).toBe('#/app/work/board.yaml/stage/1/phase/1');
    expect(history.length).toBe(before + 1);
    expect(host.appCalls).toEqual(['page:work/board.yaml', 'page:work/board.yaml/stage/1/phase/1']);
    await page.navigate({
      view: 'app',
      manifestPath: BOARD.manifestPath,
      subPath: '',
      query: 'path=work%2Fstage1%2Fphase2',
    });
    await settle();
    expect(host.appCalls.at(-1)).toBe('page:work/board.yaml?path=work%2Fstage1%2Fphase2');
    const shell = $('menu-shell') as unknown as MenuShell;
    expect(shell.inputs.at(-1)!.view).toEqual({
      type: 'board',
      path: '',
      query: 'path=work%2Fstage1%2Fphase2',
    });
  });
});

describe('creating an instance', () => {
  it('offers one entry per app that can be created, on a folder and the space under the rows', async () => {
    start();
    await page.ready;
    menuOn('docs', 'folder');
    expect(entries().map((entry) => entry.label)).toEqual([
      'New file…',
      'Rename…',
      'Delete…',
      'Create a board here…',
    ]);
    menuOn('', 'folder');
    expect(entries().map((entry) => entry.label)).toEqual(['New file…', 'Create a board here…']);
    // Not in a separate repository, and not on a file.
    menuOn('vendor', 'folder');
    expect(entries().map((entry) => entry.label)).not.toContain('Create a board here…');
    menuOn('readme.md', 'file');
    expect(entries().map((entry) => entry.label)).not.toContain('Create a board here…');
  });

  it('holds the app’s form under the folder, creates through the host, and opens the new row', async () => {
    start();
    await page.ready;
    menuOn('docs', 'folder');
    await choose('Create a board here…');
    expect(createDialog().isOpen).toBe(true);
    expect(createDialog().title).toBe('Create a board');
    expect(folderField().value).toBe('docs/board');
    expect(createDialog().querySelector('.form-help')!.textContent).toBe(
      'Where the board lives. For example “board” or “docs/board”. Leave it empty to create at the root of the served folder.'
    );
    expect($<HTMLElement>('.app-create-root').hidden).toBe(true);
    expect(form().states).toEqual([{}]);
    press('confirm');
    await settle();
    expect(host.creates).toEqual([
      { app: 'board', folder: 'docs/board', input: { label: 'Mine' } },
    ]);
    expect(createDialog().isOpen).toBe(false);
    expect(location.hash).toBe('#/app/docs/board/board.yaml');
    expect(page.instances.map((instance) => instance.manifestPath)).toContain(
      'docs/board/board.yaml'
    );
    const row = page.tree.shadowRoot!.querySelector('[data-path="docs/board"]')!;
    expect(row.getAttribute('data-kind')).toBe('app');
    // The new app is open, and its row is the one selected in the explorer.
    expect(row.getAttribute('aria-selected')).toBe('true');
    expect($('.page-notice').textContent).toBe('');
  });

  it('says so when the host wrote the create with no undo step', async () => {
    start();
    await page.ready;
    host.createAnswer = (request) => {
      const manifestPath = `${request.folder}/board.yaml`;
      host.disk.set(manifestPath, '');
      host.instances.push({ ...BOARD, manifestPath, folder: request.folder });
      return { ok: true, manifestPath, notice: { kind: 'cannot-undo', reason: 'too-large' } };
    };
    menuOn('docs', 'folder');
    await choose('Create a board here…');
    press('confirm');
    await settle();
    expect(createDialog().isOpen).toBe(false);
    expect($('.page-notice').textContent).toContain(words.journal.opCannotUndo('too-large'));
    expect($('.page-notice').dataset.tone).toBe('warning');
    expect(location.hash).toBe('#/app/docs/board/board.yaml');
  });

  it('an undo that takes the open app away shows nothing open, and says what was undone', async () => {
    start();
    await page.ready;
    menuOn('docs', 'folder');
    await choose('Create a board here…');
    press('confirm');
    await settle();
    expect(location.hash).toBe('#/app/docs/board/board.yaml');
    // The create, as the host's journal keeps it: undo deletes the manifest.
    host.steps.push({
      label: 'Board: create',
      inverse: [{ kind: 'delete', path: 'docs/board/board.yaml' }],
      forward: [{ kind: 'create', path: 'docs/board/board.yaml', content: '' }],
    });
    const at = host.instances.findIndex((found) => found.manifestPath === 'docs/board/board.yaml');
    const undo = host.undo.bind(host);
    host.undo = async () => {
      const answer = await undo();
      if (answer.ok) host.instances.splice(at, 1);
      return answer;
    };
    host.emit({ type: 'journal' });
    await settle();
    $<HTMLButtonElement>('.explorer-undo').click();
    await settle();
    expect(location.hash).toBe('');
    expect($('.app-pane').hidden).toBe(true);
    expect($('.file-pane').hidden).toBe(false);
    expect($('.pane-message').textContent).toBe(words.nothingOpen);
    expect($('.page-notice').textContent).toContain('Undone: Board: create');
  });

  it('asks consent at the root, and sends it', async () => {
    start();
    await page.ready;
    menuOn('', 'folder');
    await choose('Create a board here…');
    expect(folderField().value).toBe('board');
    folderField().value = '';
    folderField().dispatchEvent(new Event('input', { bubbles: true }));
    const root = $<HTMLElement>('.app-create-root');
    expect(root.hidden).toBe(false);
    expect(root.textContent).toContain('The root holds one app only.');
    press('confirm');
    await settle();
    expect($('#app-create-error').textContent).toBe(
      'Tick the box above to create at the root of the served folder.'
    );
    expect(host.creates).toEqual([]);
    $<HTMLInputElement>('#app-create-consent').checked = true;
    press('confirm');
    await settle();
    expect(host.creates).toEqual([
      { app: 'board', folder: '', confirmRoot: true, input: { label: 'Mine' } },
    ]);
  });

  it('hands the host’s refusal back to the form, and keeps the dialog open', async () => {
    start();
    await page.ready;
    host.createAnswer = () => ({
      ok: false,
      code: 'HOST_APP_OVERLAP',
      message: '"docs/board" would share files with Board.',
    });
    menuOn('docs', 'folder');
    await choose('Create a board here…');
    press('confirm');
    await settle();
    expect(form().results).toEqual([
      {
        ok: false,
        code: 'HOST_APP_OVERLAP',
        message: '"docs/board" would share files with Board.',
      },
    ]);
    expect(createDialog().isOpen).toBe(true);
    press('cancel');
    await settle();
    expect(createDialog().isOpen).toBe(false);
    expect(location.hash).toBe('');
  });

  it('checks the folder before anything is sent', async () => {
    expect(createFolderProblem('/abs')).toContain('leading slash');
    expect(createFolderProblem('a/../b')).toContain('“..”');
    expect(createFolderProblem('a//b')).toContain('empty');
    expect(createFolderProblem('docs/tasks')).toBeNull();
    expect(createFolderProblem('')).toBeNull();
    start();
    await page.ready;
    menuOn('docs', 'folder');
    await choose('Create a board here…');
    folderField().value = '../out';
    press('confirm');
    await settle();
    expect($('#app-create-error').hidden).toBe(false);
    expect(folderField().getAttribute('aria-invalid')).toBe('true');
    expect(host.creates).toEqual([]);
  });
});
