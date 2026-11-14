// @vitest-environment jsdom
// The page's commit: the button and its count, the dialog's rows, checks, branch
// choice, refusals and in-flight state, the changes moving while it is open, and
// the notice after a commit. The request's pure parts are tested first.
import { HOSTILE_PAYLOAD, expectNoHostileMarkup } from '@stillpointlab/common-format/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { startPage } from '../page';
import { fakeDiff, fakeHost, fakeRegistry } from '../test-support';
import { words } from '../words';

import { messageOf, requestOf, rowsFor } from './request';

import type { HostPage } from '../page';
import type { FakeEditor, FakeHost } from '../test-support';
import type { FileStatus, GitState, HostChange } from '@stillpointlab/common-format/host';
import type { ModalDialog } from '@stillpointlab/modal-dialog-component';

describe('the request', () => {
  const changes: HostChange[] = [
    { path: 'a.md', status: 'changed' },
    { path: 'new/b.md', status: 'moved', from: 'b.md' },
    { path: 'gone.md', status: 'deleted' },
  ];

  it('the summary, then the details after a blank line', () => {
    expect(messageOf('  Fix it  ', '')).toBe('Fix it');
    expect(messageOf('Fix it', '\n\n  Why:\n# kept\n\n')).toBe('Fix it\n\n  Why:\n# kept');
  });

  it('each checked path, a moved file’s old path too, and the branch when new', () => {
    const rows = rowsFor(changes);
    rows[0].checked = false;
    expect(requestOf({ rows, summary: 's', details: '', branch: null })).toEqual({
      paths: ['new/b.md', 'b.md', 'gone.md'],
      message: 's',
    });
    expect(requestOf({ rows, summary: 's', details: '', branch: ' topic ' })).toMatchObject({
      branch: 'topic',
    });
  });

  it('read again: a row keeps its check, a new one starts unchecked, a gone one goes', () => {
    const rows = rowsFor(changes);
    rows[0].checked = false;
    const again = rowsFor([changes[0], changes[1], { path: 'late.md', status: 'new' }], rows);
    expect(again.map((row) => [row.change.path, row.checked])).toEqual([
      ['a.md', false],
      ['new/b.md', true],
      ['late.md', false],
    ]);
  });
});

let host: FakeHost;
let page: HostPage;

async function start(
  options: {
    state?: GitState;
    branch?: string | null;
    statuses?: Record<string, FileStatus>;
    hash?: string;
  } = {}
): Promise<void> {
  history.replaceState(null, '', `/${options.hash ?? ''}`);
  host = fakeHost({
    'a.md': 'a, edited\n',
    'n.md': 'new\n',
    'docs/moved.md': 'moved\n',
    'clean.md': 'clean\n',
  });
  host.gitInfo = {
    state: options.state ?? 'repository',
    branch: options.branch === undefined ? 'main' : options.branch,
  };
  host.statuses = options.statuses ?? {
    'a.md': 'changed',
    'n.md': 'new',
    'docs/moved.md': 'moved',
    'gone.md': 'deleted',
  };
  host.movedFrom.set('docs/moved.md', 'old.md');
  host.heads.set('a.md', 'a\n');
  page = startPage({ client: host, registry: fakeRegistry(), diff: fakeDiff, root: document.body });
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
const button = () => $<HTMLButtonElement>('.explorer-commit');
const dialog = () => $<ModalDialog>('modal-dialog.commit');
const inDialog = <T extends Element = HTMLElement>(selector: string) =>
  dialog().querySelector<T & Element>(selector);
const rows = () =>
  [...dialog().querySelectorAll<HTMLElement>('.commit-row')].map((row) => ({
    checked: row.querySelector<HTMLInputElement>('input')!.checked,
    status: row.querySelector('.commit-status')!.textContent,
    path: row.querySelector('.commit-path')!.textContent,
  }));
const box = (path: string) =>
  [...dialog().querySelectorAll<HTMLInputElement>('.commit-box')].find(
    (input) => input.dataset.path === path
  )!;
const all = () => inDialog<HTMLInputElement>('.commit-all-box')!;
const summary = () => inDialog<HTMLInputElement>('#commit-summary')!;
const details = () => inDialog<HTMLTextAreaElement>('#commit-details')!;
const branchName = () => inDialog<HTMLInputElement>('#commit-branch-name')!;
const radio = (value: string) => inDialog<HTMLInputElement>(`input[value="${value}"]`);
const error = () => {
  const shown = inDialog<HTMLElement>('.commit-error')!;
  return shown.hidden ? null : shown.textContent;
};
const notice = () => $('.commit-notice').textContent;

/** Open the dialog and let it read; `opened` settles when it closes. */
async function openDialog(): Promise<{ opened: Promise<unknown> }> {
  const opened = page.openCommit();
  await settle();
  return { opened };
}

function type(field: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function toggle(input: HTMLInputElement): void {
  input.click();
}

async function press(answer: 'confirm' | 'cancel'): Promise<void> {
  inDialog<HTMLButtonElement>(`[data-answer="${answer}"]`)!.click();
  await settle();
}

describe('the Commit button', () => {
  it('shows in a repository with the number of changed files, deleted ones included', async () => {
    await start();
    expect(button().hidden).toBe(false);
    expect(button().textContent).toBe(`${words.commit.button}4`);
    expect(button().getAttribute('aria-label')).toBe('Commit: 4 changed files');

    host.statuses = { 'a.md': 'changed' };
    host.emit({ type: 'status' });
    await settle();
    expect(button().getAttribute('aria-label')).toBe('Commit: 1 changed file');
  });

  it('is not there outside a repository, or with no git', async () => {
    await start({ state: 'no-repository', statuses: {} });
    expect(button().hidden).toBe(true);
    page.destroy();
    document.body.replaceChildren();
    await start({ state: 'no-git', statuses: {} });
    expect(button().hidden).toBe(true);
    expect(await page.openCommit()).toBeNull();
    expect(host.gitCalls).toEqual([]);
  });

  it('the header is a row: the folder’s name, then the button', async () => {
    await start();
    const header = $('.explorer-header');
    expect([...header.children].map((child) => child.className)).toEqual([
      'explorer-name',
      'button explorer-commit',
    ]);
  });
});

describe('the dialog', () => {
  it('lists every change checked, a moved file as old → new, and the current branch chosen', async () => {
    await start();
    await openDialog();
    expect(dialog().isOpen).toBe(true);
    expect(rows()).toEqual([
      { checked: true, status: 'changed', path: 'a.md' },
      { checked: true, status: 'new', path: 'n.md' },
      { checked: true, status: 'moved', path: 'old.md → docs/moved.md' },
      { checked: true, status: 'deleted', path: 'gone.md' },
    ]);
    expect(all().checked).toBe(true);
    expect(inDialog('.commit-count')!.textContent).toBe('4 of 4 files chosen');
    expect(radio('current')!.checked).toBe(true);
    expect(radio('current')!.parentElement!.textContent!.trim()).toBe('On main');
    expect(radio('new')!.checked).toBe(false);
    expect(inDialog('.commit-unsaved')).toBeNull();
    expect(document.activeElement).toBe(summary());
  });

  it('commits the chosen files with the message; the notice names it; the marks clear at once', async () => {
    await start();
    const { opened } = await openDialog();
    toggle(box('n.md'));
    type(summary(), 'Edit a and move b');
    type(details(), 'Because.\n# kept');
    await press('confirm');
    expect(host.commits).toEqual([
      {
        paths: ['a.md', 'docs/moved.md', 'old.md', 'gone.md'],
        message: 'Edit a and move b\n\nBecause.\n# kept',
      },
    ]);
    expect(await opened).toMatchObject({ short: 'cccccc1', branch: 'main' });
    expect(dialog().isOpen).toBe(false);
    expect($('.commit-notice').getAttribute('role')).toBe('status');
    expect(notice()).toContain(words.commit.notice('cccccc1', 'main'));
    expect(button().getAttribute('aria-label')).toBe('Commit: 1 changed file');
  });

  it('All unchecks and checks every row, and shows some as mixed', async () => {
    await start();
    await openDialog();
    toggle(all());
    expect(rows().every((row) => !row.checked)).toBe(true);
    expect(inDialog('.commit-count')!.textContent).toBe('0 of 4 files chosen');
    toggle(box('a.md'));
    expect(all().indeterminate).toBe(true);
    toggle(all());
    expect(rows().every((row) => row.checked)).toBe(true);
    expect(all().indeterminate).toBe(false);
  });

  it('says what is missing, with focus on it, and sends nothing', async () => {
    await start();
    await openDialog();
    toggle(all());
    type(summary(), 'Summary');
    await press('confirm');
    expect(error()).toBe(words.commit.check.noFiles);
    expect(document.activeElement).toBe(all());

    toggle(all());
    expect(error()).toBeNull();
    type(summary(), '   ');
    await press('confirm');
    expect(error()).toBe(words.commit.check.noSummary);
    expect(document.activeElement).toBe(summary());

    type(summary(), 'Summary');
    toggle(radio('new')!);
    await press('confirm');
    expect(error()).toBe(words.commit.check.noBranch);
    expect(document.activeElement).toBe(branchName());
    expect(host.commits).toEqual([]);
  });

  it('a new branch: typing its name chooses it, and Enter commits', async () => {
    await start();
    const { opened } = await openDialog();
    type(summary(), 'On a branch');
    type(branchName(), 'topic/x');
    expect(radio('new')!.checked).toBe(true);
    branchName().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(host.commits[0]).toMatchObject({ branch: 'topic/x' });
    expect(await opened).toMatchObject({ branch: 'topic/x' });
    expect(notice()).toContain('on topic/x.');
  });

  it('a detached HEAD offers only a new branch, and says why', async () => {
    await start({ branch: null });
    await openDialog();
    expect(radio('current')).toBeNull();
    expect(inDialog('.commit-note')!.textContent).toBe(words.commit.detached);
    type(summary(), 's');
    await press('confirm');
    expect(error()).toBe(words.commit.check.noBranch);
    type(branchName(), 'rescued');
    await press('confirm');
    expect(host.commits[0]).toMatchObject({ branch: 'rescued' });
  });

  it('a refusal shows as text under the form, which keeps everything, with focus on it', async () => {
    await start();
    await openDialog();
    toggle(box('gone.md'));
    type(summary(), 'Summary');
    type(details(), 'Details');
    const said = `git commit failed (exit 1). Nothing was committed, and you are still on main. git said:\nlint: line 1\n${HOSTILE_PAYLOAD}`;
    host.refuseNextCommit = { code: 'HOST_GIT_FAILED', message: said };
    await press('confirm');
    expect(dialog().isOpen).toBe(true);
    expect(error()).toBe(said);
    expectNoHostileMarkup(dialog());
    expect(document.activeElement).toBe(inDialog('.commit-error'));
    expect(summary().value).toBe('Summary');
    expect(details().value).toBe('Details');
    expect(box('gone.md').checked).toBe(false);
    expect(radio('current')!.checked).toBe(true);

    host.refuseNextCommit = {
      code: 'HOST_BRANCH_EXISTS',
      message: 'There is already a branch named "main".',
    };
    type(branchName(), 'main');
    await press('confirm');
    expect(error()).toBe('There is already a branch named "main".');
    expect(document.activeElement).toBe(branchName());
  });

  it('takes no second commit while one runs; Escape and the close button wait for it', async () => {
    await start();
    await openDialog();
    type(summary(), 's');
    host.holdCommit = true;
    await press('confirm');
    summary().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await press('confirm');
    expect(host.commits).toHaveLength(1);
    expect(dialog().getAttribute('aria-busy')).toBe('true');
    expect(inDialog<HTMLButtonElement>('[data-answer="confirm"]')!.textContent).toBe(
      words.commit.committing
    );
    expect(summary().readOnly).toBe(true);
    expect(inDialog<HTMLFieldSetElement>('.commit-files')!.disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    dialog().shadowRoot!.querySelector<HTMLButtonElement>('.modal-close-button')!.click();
    expect(dialog().isOpen).toBe(true);
    host.releaseCommit();
    await settle();
    expect(dialog().isOpen).toBe(false);
    expect(host.commits).toHaveLength(1);
  });

  it('says the open file’s unsaved edits are not in the commit', async () => {
    await start({ hash: '#/edit/a.md' });
    ($('.pane-body').firstElementChild as FakeEditor).type('more');
    await openDialog();
    expect(inDialog('.commit-unsaved')!.textContent).toBe(words.commit.unsaved('a.md'));
  });

  it('reads the changes again when they move: checks kept, a new row unchecked, a gone one gone', async () => {
    await start();
    await openDialog();
    toggle(box('a.md'));
    host.statuses = { 'a.md': 'changed', 'n.md': 'new', 'late.md': 'new' };
    host.movedFrom.clear();
    host.emit({ type: 'status' });
    await settle();
    expect(rows()).toEqual([
      { checked: false, status: 'changed', path: 'a.md' },
      { checked: true, status: 'new', path: 'n.md' },
      { checked: false, status: 'new', path: 'late.md' },
    ]);
  });

  it('with nothing changed, says so and offers Close', async () => {
    await start({ statuses: {} });
    await openDialog();
    expect(inDialog('.commit-message')!.textContent).toBe(words.commit.nothing);
    expect([...dialog().querySelectorAll('[data-answer]')].map((b) => b.textContent)).toEqual([
      words.commit.close,
    ]);
    await press('cancel');
    expect(dialog().isOpen).toBe(false);
  });

  it('Cancel commits nothing', async () => {
    await start();
    const { opened } = await openDialog();
    type(summary(), 's');
    await press('cancel');
    expect(await opened).toBeNull();
    expect(host.commits).toEqual([]);
    expect(notice()).toBe('');
  });

  it('hostile paths are text', async () => {
    await start({ statuses: { [`x${HOSTILE_PAYLOAD}.md`]: 'new' } });
    await openDialog();
    expectNoHostileMarkup(dialog());
    expect(rows()[0].path).toBe(`x${HOSTILE_PAYLOAD}.md`);
  });
});

describe('after a commit', () => {
  it('the notice goes when dismissed, and focus goes back to the button', async () => {
    await start();
    await openDialog();
    type(summary(), 's');
    await press('confirm');
    expect(notice()).toContain('Committed');
    $<HTMLButtonElement>('.commit-notice-close').click();
    expect(notice()).toBe('');
    expect(document.activeElement).toBe(button());
  });

  it('a Changes view of a committed file goes back to the preview', async () => {
    await start({ hash: '#/diff/a.md' });
    expect(location.hash).toBe('#/diff/a.md');
    await openDialog();
    type(summary(), 's');
    await press('confirm');
    await settle();
    expect(location.hash).toBe('#/file/a.md');
  });
});
