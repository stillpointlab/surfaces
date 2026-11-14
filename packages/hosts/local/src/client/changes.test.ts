// @vitest-environment jsdom
// The page's git: the tree's marks, the Changes view, the switch following the
// statuses, and nothing of git outside a repository.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { startPage } from './page';
import { BINARY, fakeDiff, fakeHost, fakeRegistry } from './test-support';
import { words } from './words';

import type { HostPage } from './page';
import type { FakeDiff, FakeEditor, FakeHost } from './test-support';
import type { TreeMark } from './tree/host-file-tree';
import type { FolderNode } from '@stillpointlab/common-format/app';
import type { FileStatus, GitState } from '@stillpointlab/common-format/host';

let host: FakeHost;
let page: HostPage;
let marks: Record<string, TreeMark>[];

function start(
  hash = '',
  options: { state?: GitState; statuses?: Record<string, FileStatus> } = {}
): void {
  history.replaceState(null, '', `/${hash}`);
  host = fakeHost({
    'a.md': 'a, edited\n',
    'clean.md': 'clean\n',
    'n.md': 'new\n',
    'docs/moved.md': 'moved\n',
    'pic.png': BINARY,
    'head-binary.md': 'text now\n',
  });
  host.gitInfo = { state: options.state ?? 'repository', branch: 'main' };
  host.statuses = options.statuses ?? {
    'a.md': 'changed',
    'n.md': 'new',
    'docs/moved.md': 'moved',
    'pic.png': 'changed',
    'head-binary.md': 'changed',
    'gone.md': 'deleted',
  };
  host.movedFrom.set('docs/moved.md', 'old.md');
  host.heads.set('a.md', 'a\n');
  host.heads.set('clean.md', 'clean\n');
  host.heads.set('old.md', 'moved, as it was\n');
  host.heads.set('head-binary.md', BINARY);
  marks = [];
  page = startPage({ client: host, registry: fakeRegistry(), diff: fakeDiff, root: document.body });
  const setNodes = page.tree.setNodes.bind(page.tree);
  vi.spyOn(page.tree, 'setNodes').mockImplementation(
    (nodes: readonly FolderNode[], given?: Readonly<Record<string, TreeMark>>) => {
      marks.push({ ...given });
      setNodes(nodes, given);
    }
  );
}

afterEach(() => {
  page?.destroy();
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

const $ = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T & Element>(selector)!;
const shown = () => $('.pane-body').firstElementChild as HTMLElement;
const diff = () => shown() as unknown as FakeDiff;
const message = () => $('.pane-message')?.textContent;
/** The view switch's buttons, by view, when it shows. */
const switchViews = () =>
  $('.pane-views').hidden
    ? []
    : [...document.querySelectorAll<HTMLElement>('.pane-views [data-view]')].map(
        (b) => b.dataset.view
      );
const press = (view: string) => $<HTMLButtonElement>(`.pane-views [data-view="${view}"]`).click();

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await new Promise((done) => setTimeout(done, 0));
}

function select(path: string, type = 'tree-select'): void {
  page.tree.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { path, kind: 'file' } }));
}

describe('in a repository', () => {
  it('marks the tree from the statuses, deleted files included, and again on a status event', async () => {
    start();
    await page.ready;
    expect(marks.at(-1)).toMatchObject({
      'a.md': { status: 'changed' },
      'gone.md': { status: 'deleted' },
      'docs/moved.md': { status: 'moved' },
    });
    host.statuses = { 'clean.md': 'changed' };
    host.emit({ type: 'status' });
    await settle();
    expect(marks.at(-1)).toEqual({ 'clean.md': { status: 'changed' } });
  });

  it('a changed file offers Changes: HEAD on the left, the file on the right, the language from the path', async () => {
    start();
    await page.ready;
    select('a.md');
    await settle();
    expect(switchViews()).toEqual(['preview', 'edit', 'diff']);
    press('diff');
    await settle();
    expect(location.hash).toBe('#/diff/a.md');
    expect(shown().localName).toBe('fake-diff');
    expect(diff().left).toBe('a\n');
    expect(diff().right).toBe('a, edited\n');
    expect(shown().getAttribute('language')).toBe('Markdown');
    expect($('.pane-views [data-view="diff"]').getAttribute('aria-pressed')).toBe('true');
    expect($('.pane-save').hidden).toBe(true);
  });

  it('a moved file’s left side is its old path’s text', async () => {
    start('#/diff/docs/moved.md');
    await page.ready;
    await settle();
    expect(diff().left).toBe('moved, as it was\n');
    expect(diff().right).toBe('moved\n');
    expect(host.gitCalls).toContain('base:docs/moved.md');
  });

  it('opens a Changes link after the first statuses', async () => {
    start('#/diff/a.md');
    await page.ready;
    await settle();
    expect(shown().localName).toBe('fake-diff');
    expect(location.hash).toBe('#/diff/a.md');
  });

  it('no Changes for a clean file, a new one, or an image; a Changes link to one opens the preview', async () => {
    start('#/diff/clean.md');
    await page.ready;
    await settle();
    expect(shown().localName).toBe('fake-preview');
    expect(location.hash).toBe('#/file/clean.md');
    expect(switchViews()).toEqual(['preview', 'edit']);
    for (const path of ['n.md', 'pic.png']) {
      select(path);
      await settle();
      expect(switchViews()).not.toContain('diff');
    }
    expect(host.gitCalls.filter((c) => c.startsWith('base:'))).toEqual([]);
  });

  it('says why when the last commit’s side is not text, and keeps the way back', async () => {
    start('#/diff/head-binary.md');
    await page.ready;
    await settle();
    expect(message()).toBe(words.diff.HOST_NOT_TEXT);
    expect(switchViews()).toEqual(['preview', 'edit', 'diff']);
    press('preview');
    await settle();
    expect(shown().localName).toBe('fake-preview');
  });

  it('the switch follows the status while the file is open, keeping unsaved edits', async () => {
    start('#/edit/clean.md');
    await page.ready;
    await settle();
    (shown() as unknown as FakeEditor).type(' typed');
    expect(switchViews()).toEqual(['preview', 'edit']);

    host.statuses = { 'clean.md': 'changed' };
    host.emit({ type: 'status' });
    await settle();
    expect(switchViews()).toEqual(['preview', 'edit', 'diff']);
    expect((shown() as unknown as FakeEditor).getContent()).toBe('clean\n typed');
    expect($('.pane-unsaved').hidden).toBe(false);

    host.statuses = {};
    host.emit({ type: 'status' });
    await settle();
    expect(switchViews()).toEqual(['preview', 'edit']);
    expect((shown() as unknown as FakeEditor).getContent()).toBe('clean\n typed');
  });

  it('a Changes view whose file is committed goes to the preview', async () => {
    start('#/diff/a.md');
    await page.ready;
    await settle();
    host.statuses = {};
    host.heads.set('a.md', 'a, edited\n');
    host.emit({ type: 'status' });
    await settle();
    expect(shown().localName).toBe('fake-preview');
    expect(location.hash).toBe('#/file/a.md');
  });

  it('reads both sides again when HEAD moves and when the file changes on disk', async () => {
    start('#/diff/a.md');
    await page.ready;
    await settle();
    const element = shown();
    host.heads.set('a.md', 'a, staged and committed in part\n');
    host.emit({ type: 'status' });
    await settle();
    expect(diff().left).toBe('a, staged and committed in part\n');
    host.writeOutside('a.md', 'a, edited elsewhere\n');
    await settle();
    expect(diff().right).toBe('a, edited elsewhere\n');
    expect(shown()).toBe(element);
  });

  it('follows a rename of the open file in the Changes view', async () => {
    start('#/diff/a.md');
    await page.ready;
    await settle();
    host.statuses = { 'b.md': 'moved' };
    host.movedFrom.set('b.md', 'a.md');
    await page.pane.followWrite(host.put([{ kind: 'move', from: 'a.md', path: 'b.md' }]), (p) =>
      p === 'a.md' ? 'b.md' : undefined
    );
    await settle();
    expect($('.pane-path').textContent).toBe('b.md');
    expect(shown().localName).toBe('fake-diff');
    expect(diff().left).toBe('a\n');
    expect(diff().right).toBe('a, edited\n');
  });
});

describe('outside a repository', () => {
  it('no Changes, no git routes, and no notice, whatever status says', async () => {
    start('#/diff/a.md', { state: 'no-repository', statuses: { 'a.md': 'changed' } });
    await page.ready;
    await settle();
    expect(shown().localName).toBe('fake-preview');
    expect(location.hash).toBe('#/file/a.md');
    expect(switchViews()).toEqual(['preview', 'edit']);
    host.emit({ type: 'status' });
    await settle();
    expect(host.gitCalls).toEqual([]);
    expect($('.explorer-note').hidden).toBe(true);
  });

  it('with git not found in what looks like a repository, the explorer says so', async () => {
    start('', { state: 'no-git', statuses: {} });
    await page.ready;
    expect($('.explorer-note').hidden).toBe(false);
    expect($('.explorer-note').textContent).toBe(words.gitNotFound);
    select('a.md');
    await settle();
    expect(switchViews()).toEqual(['preview', 'edit']);
    expect(host.gitCalls).toEqual([]);
  });

  it('the notice and a cut listing show as two lines', async () => {
    history.replaceState(null, '', '/');
    start('', { state: 'no-git', statuses: {} });
    host.truncated = true;
    await page.ready;
    await page.refresh();
    expect(
      [...document.querySelectorAll('.explorer-note-line')].map((line) => line.textContent)
    ).toEqual([words.gitNotFound, words.explorerTruncated(7)]);
  });
});
