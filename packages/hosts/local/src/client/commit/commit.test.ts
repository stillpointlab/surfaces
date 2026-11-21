// @vitest-environment jsdom
// The page's commit over the check-in review: the button and its count, the
// review's rows in the tree's order, the box over them, the checks, the branch,
// refusals and the field each is about, the review busy while a commit runs, the
// changes moving while it is open (and a read that fails then), nothing changed,
// and the notice after a commit. The pure parts are in rows.test.ts.
import { REVIEW_WORDS } from '@stillpointlab/checkin-review-component';
import { HOSTILE_PAYLOAD, expectNoHostileMarkup } from '@stillpointlab/common-format/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { SPINNER_DELAY_MS, startPage } from '../page';
import { fakeDiff, fakeHost, fakeRegistry } from '../test-support';
import { words } from '../words';

import type { HostPage } from '../page';
import type { FakeEditor, FakeHost } from '../test-support';
import type { CheckinReview } from '@stillpointlab/checkin-review-component';
import type { Result } from '@stillpointlab/common-format/app';
import type { FileStatus, GitState, HostChange } from '@stillpointlab/common-format/host';
import type { ModalDialog } from '@stillpointlab/modal-dialog-component';

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
const review = () => $<CheckinReview>('checkin-review.commit-review');
const modal = () => review().querySelector<ModalDialog>('modal-dialog')!;
const inReview = <T extends Element = HTMLElement>(selector: string) =>
  review().querySelector<T & Element>(selector);
const rows = () =>
  [...review().querySelectorAll<HTMLElement>('.checkin-review-row')].map((row) => ({
    checked: row.querySelector<HTMLInputElement>('input')!.checked,
    status: row.querySelector('.checkin-review-label')!.textContent,
    path: row.querySelector('.checkin-review-path')!.textContent,
  }));
const box = (path: string) =>
  [...review().querySelectorAll<HTMLInputElement>('.checkin-review-box')].find(
    (input) => input.dataset.path === path
  )!;
const all = () => inReview<HTMLInputElement>('.checkin-review-all-box')!;
const summary = () => inReview<HTMLInputElement>('.checkin-review-title')!;
const details = () => inReview<HTMLTextAreaElement>('.checkin-review-text')!;
const branchName = () => inReview<HTMLInputElement>('.checkin-review-branch-name')!;
const radio = (value: string) =>
  inReview<HTMLInputElement>(`input[type="radio"][value="${value}"]`);
const error = () => {
  const shown = inReview<HTMLElement>('.checkin-review-error')!;
  return shown.hidden ? null : shown.textContent;
};
const notice = () => $('.page-notice').textContent;
const failing = async (): Promise<Result<{ changes: HostChange[] }>> => ({
  ok: false,
  code: 'HOST_GIT_FAILED',
  message: 'git status failed.',
});

/** Open the review and let it read, and its dialog take focus; `opened` settles when it closes. */
async function openReview(): Promise<{ opened: Promise<unknown> }> {
  const opened = page.openCommit();
  await settle();
  await new Promise<void>((done) => requestAnimationFrame(() => done()));
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
  inReview<HTMLButtonElement>(`[data-answer="${answer}"]`)!.click();
  await settle();
}

describe('the Commit button', () => {
  it('shows in a repository with the number of changed files, deleted ones included', async () => {
    await start();
    expect(button().hidden).toBe(false);
    expect(button().disabled).toBe(false);
    expect(button().textContent).toBe(`${words.commit.button}4`);
    expect(button().getAttribute('aria-label')).toBe('Commit: 4 changed files');

    host.statuses = { 'a.md': 'changed' };
    host.emit({ type: 'status' });
    await settle();
    expect(button().getAttribute('aria-label')).toBe('Commit: 1 changed file');
  });

  it('is disabled, with no count, when nothing has changed', async () => {
    await start({ statuses: {} });
    expect(button().hidden).toBe(false);
    expect(button().disabled).toBe(true);
    expect(button().textContent).toBe(words.commit.button);
    expect(button().getAttribute('aria-label')).toBe('Commit: nothing has changed');

    host.statuses = { 'a.md': 'changed' };
    host.emit({ type: 'status' });
    await settle();
    expect(button().disabled).toBe(false);
    expect(button().textContent).toBe(`${words.commit.button}1`);
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

  it('the header is a row: the folder’s name, Undo and Redo, then the button', async () => {
    await start();
    const header = $('.explorer-header');
    expect([...header.children].map((child) => child.className)).toEqual([
      'explorer-name',
      'button explorer-undo',
      'button explorer-redo',
      'button explorer-commit',
    ]);
  });
});

describe('the review', () => {
  it('lists every change checked in the tree’s order, a moved file as old → new, and the current branch chosen', async () => {
    await start();
    await openReview();
    expect(modal().isOpen).toBe(true);
    expect(modal().title).toBe(words.commit.title);
    expect(rows()).toEqual([
      { checked: true, status: 'moved', path: 'old.md → docs/moved.md' },
      { checked: true, status: 'changed', path: 'a.md' },
      { checked: true, status: 'deleted', path: 'gone.md' },
      { checked: true, status: 'new', path: 'n.md' },
    ]);
    expect(inReview('.checkin-review-label')!.getAttribute('data-label')).toBe('moved');
    expect(all().checked).toBe(true);
    expect(inReview('.checkin-review-count')!.textContent).toBe('4 of 4 files chosen');
    expect(radio('current')!.checked).toBe(true);
    expect(radio('current')!.parentElement!.textContent!.trim()).toBe('On main');
    expect(radio('new')!.checked).toBe(false);
    expect(inReview('.checkin-review-note')).toBeNull();
    expect(inReview('label[for]')!.textContent).toBe(words.commit.summary);
    expect(inReview('[data-answer="confirm"]')!.textContent).toBe(words.commit.confirm);
    expect(document.activeElement).toBe(summary());
  });

  it('says it is reading between the press and the review, with a spinner once that takes a moment', async () => {
    await start();
    const reads = () => host.gitCalls.filter((call) => call === 'changes').length;
    const before = reads();
    host.holdChanges = true;
    button().focus();
    button().click();
    await settle();
    expect(button().getAttribute('aria-busy')).toBe('true');
    // Not yet: a quick read shows no spinner.
    expect(button().dataset.reading).toBeUndefined();
    expect(button().querySelector('spl-icon')!.getAttribute('icon-name')).toBe('spinner');
    // The button keeps the focus, and a second press reads nothing more.
    expect(button().disabled).toBe(false);
    expect(document.activeElement).toBe(button());
    button().click();
    await new Promise((done) => setTimeout(done, SPINNER_DELAY_MS + 50));
    expect(button().dataset.reading).toBe('');
    expect(reads()).toBe(before + 1);
    expect(modal()?.isOpen ?? false).toBe(false);

    host.releaseChanges();
    await settle();
    expect(button().hasAttribute('aria-busy')).toBe(false);
    expect(button().dataset.reading).toBeUndefined();
    expect(modal().isOpen).toBe(true);
  });

  it('a read that fails ends the reading state too', async () => {
    await start();
    host.changes = failing;
    button().click();
    await settle();
    expect(button().hasAttribute('aria-busy')).toBe(false);
    expect(button().dataset.reading).toBeUndefined();
    expect(notice()).toContain('git status failed.');
  });

  it('orders folders first and numbered names in order, as the tree does', async () => {
    await start({
      statuses: {
        'notes/10.md': 'new',
        'notes/2.md': 'new',
        'b.md': 'changed',
        'a/z.md': 'changed',
        'notes/sub/x.md': 'new',
      },
    });
    host.movedFrom.clear();
    await openReview();
    expect(rows().map((row) => row.path)).toEqual([
      'a/z.md',
      'notes/sub/x.md',
      'notes/2.md',
      'notes/10.md',
      'b.md',
    ]);
  });

  it('commits the chosen files with the message; the notice names it; the marks clear at once', async () => {
    await start();
    const { opened } = await openReview();
    toggle(box('n.md'));
    type(summary(), 'Edit a and move b');
    type(details(), 'Because.\n# kept');
    await press('confirm');
    expect(host.commits).toEqual([
      {
        paths: ['docs/moved.md', 'old.md', 'a.md', 'gone.md'],
        message: 'Edit a and move b\n\nBecause.\n# kept',
      },
    ]);
    expect(await opened).toMatchObject({ short: 'cccccc1', branch: 'main' });
    expect(modal().isOpen).toBe(false);
    expect($('.page-notice').getAttribute('role')).toBe('status');
    expect($('.page-notice').dataset.tone).toBe('success');
    expect(notice()).toContain(words.commit.notice('cccccc1', 'main'));
    expect(button().getAttribute('aria-label')).toBe('Commit: 1 changed file');
  });

  it('All unchecks and checks every row, and shows some as mixed', async () => {
    await start();
    await openReview();
    toggle(all());
    expect(rows().every((row) => !row.checked)).toBe(true);
    expect(inReview('.checkin-review-count')!.textContent).toBe('0 of 4 files chosen');
    toggle(box('a.md'));
    expect(all().indeterminate).toBe(true);
    toggle(all());
    expect(rows().every((row) => row.checked)).toBe(true);
    expect(all().indeterminate).toBe(false);
  });

  it('says what is missing, with focus on it, and sends nothing', async () => {
    await start();
    await openReview();
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
    expect(error()).toBe(REVIEW_WORDS.noBranch);
    expect(document.activeElement).toBe(branchName());
    expect(host.commits).toEqual([]);
  });

  it('a new branch: typing its name chooses it, Enter commits, and the page is on it after', async () => {
    await start();
    const { opened } = await openReview();
    type(summary(), 'On a branch');
    type(branchName(), 'topic/x');
    expect(radio('new')!.checked).toBe(true);
    branchName().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(host.commits[0]).toMatchObject({ branch: 'topic/x' });
    expect(await opened).toMatchObject({ branch: 'topic/x' });
    expect(notice()).toContain('on topic/x.');

    host.statuses = { 'clean.md': 'changed' };
    host.emit({ type: 'status' });
    await settle();
    await openReview();
    expect(radio('current')!.parentElement!.textContent!.trim()).toBe('On topic/x');
  });

  it('a detached HEAD offers only a new branch, and says why', async () => {
    await start({ branch: null });
    await openReview();
    expect(radio('current')).toBeNull();
    expect(inReview('.checkin-review-detached')!.textContent).toBe(words.commit.detached);
    type(summary(), 's');
    await press('confirm');
    expect(error()).toBe(REVIEW_WORDS.noBranch);
    type(branchName(), 'rescued');
    await press('confirm');
    expect(host.commits[0]).toMatchObject({ branch: 'rescued' });
  });

  it('a refusal shows as text under the form, which keeps everything, with focus on it', async () => {
    await start();
    await openReview();
    toggle(box('gone.md'));
    type(summary(), 'Summary');
    type(details(), 'Details');
    const said = `git commit failed (exit 1). Nothing was committed, and you are still on main. git said:\nlint: line 1\n${HOSTILE_PAYLOAD}`;
    host.refuseNextCommit = { code: 'HOST_GIT_FAILED', message: said };
    await press('confirm');
    expect(modal().isOpen).toBe(true);
    expect(error()).toBe(said);
    expectNoHostileMarkup(review());
    expect(document.activeElement).toBe(inReview('.checkin-review-error'));
    expect(summary().value).toBe('Summary');
    expect(details().value).toBe('Details');
    expect(box('gone.md').checked).toBe(false);
    expect(radio('current')!.checked).toBe(true);
    expect(notice()).toBe('');
  });

  it('a refusal about a field puts focus on it: the branch, the summary, the files', async () => {
    await start();
    await openReview();
    type(summary(), 'Summary');
    host.refuseNextCommit = {
      code: 'HOST_BRANCH_EXISTS',
      message: 'There is already a branch named "main".',
    };
    type(branchName(), 'main');
    await press('confirm');
    expect(error()).toBe('There is already a branch named "main".');
    expect(document.activeElement).toBe(branchName());

    host.refuseNextCommit = { code: 'HOST_COMMIT_NO_MESSAGE', message: 'No message.' };
    await press('confirm');
    expect(document.activeElement).toBe(summary());

    host.refuseNextCommit = { code: 'HOST_COMMIT_NO_PATHS', message: 'No paths.' };
    await press('confirm');
    expect(document.activeElement).toBe(all());
  });

  it('after HOST_NOT_CHANGED, reads the changes again: checks kept, a new row unchecked', async () => {
    await start();
    await openReview();
    toggle(box('a.md'));
    type(summary(), 's');
    host.refuseNextCommit = { code: 'HOST_NOT_CHANGED', message: 'The changes moved.' };
    host.statuses = { 'a.md': 'changed', 'n.md': 'new', 'late.md': 'new' };
    host.movedFrom.clear();
    const reads = () => host.gitCalls.filter((call) => call === 'changes').length;
    const before = reads();
    await press('confirm');
    expect(reads()).toBe(before + 1);
    expect(error()).toBe('The changes moved.');
    expect(rows()).toEqual([
      { checked: false, status: 'changed', path: 'a.md' },
      { checked: false, status: 'new', path: 'late.md' },
      { checked: true, status: 'new', path: 'n.md' },
    ]);
  });

  it('takes no second commit while one runs; Escape and the close button wait for it', async () => {
    await start();
    await openReview();
    type(summary(), 's');
    host.holdCommit = true;
    await press('confirm');
    summary().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await press('confirm');
    expect(host.commits).toHaveLength(1);
    expect(modal().getAttribute('aria-busy')).toBe('true');
    expect(inReview<HTMLButtonElement>('[data-answer="confirm"]')!.textContent).toBe(
      words.commit.committing
    );
    expect(summary().readOnly).toBe(true);
    expect(inReview<HTMLFieldSetElement>('.checkin-review-files')!.disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    modal().shadowRoot!.querySelector<HTMLButtonElement>('.modal-close-button')!.click();
    expect(modal().isOpen).toBe(true);
    host.releaseCommit();
    await settle();
    expect(modal().isOpen).toBe(false);
    expect(host.commits).toHaveLength(1);
  });

  it('says the open file’s unsaved edits are not in the commit', async () => {
    await start({ hash: '#/edit/a.md' });
    ($('.pane-body').firstElementChild as FakeEditor).type('more');
    await openReview();
    expect(inReview('.checkin-review-note')!.textContent).toBe(words.commit.unsaved('a.md'));
  });

  it('reads the changes again when they move: checks kept, a new row unchecked, a gone one gone', async () => {
    await start();
    await openReview();
    toggle(box('a.md'));
    host.statuses = { 'a.md': 'changed', 'n.md': 'new', 'late.md': 'new' };
    host.movedFrom.clear();
    host.emit({ type: 'status' });
    await settle();
    expect(rows()).toEqual([
      { checked: false, status: 'changed', path: 'a.md' },
      { checked: false, status: 'new', path: 'late.md' },
      { checked: true, status: 'new', path: 'n.md' },
    ]);
  });

  it('a read that fails while it is open is said under the form, and the rows stay', async () => {
    await start();
    await openReview();
    host.changes = failing;
    host.emit({ type: 'status' });
    await settle();
    expect(error()).toBe(words.commit.readFailed('git status failed.'));
    expect(rows()).toHaveLength(4);
    expect(modal().isOpen).toBe(true);
  });

  it('with nothing changed, says so in the notice and opens nothing', async () => {
    await start({ statuses: {} });
    expect(await page.openCommit()).toBeNull();
    expect(review().isOpen).toBe(false);
    expect(notice()).toContain(words.commit.nothing);
  });

  it('a read that fails before it opens says so in the notice and opens nothing', async () => {
    await start();
    host.changes = failing;
    expect(await page.openCommit()).toBeNull();
    expect(review().isOpen).toBe(false);
    expect(notice()).toContain(words.commit.readFailed('git status failed.'));
    expect($('.page-notice').dataset.tone).toBe('error');
  });

  it('a second open while the first is reading opens nothing, and the first still settles', async () => {
    await start();
    const first = page.openCommit();
    const second = page.openCommit();
    expect(await second).toBeNull();
    await settle();
    expect(review().isOpen).toBe(true);
    type(summary(), 'kept');
    await press('cancel');
    expect(await first).toBeNull();
    expect(host.commits).toEqual([]);
  });

  it('Cancel commits nothing', async () => {
    await start();
    const { opened } = await openReview();
    type(summary(), 's');
    await press('cancel');
    expect(await opened).toBeNull();
    expect(host.commits).toEqual([]);
    expect(notice()).toBe('');
  });

  it('hostile paths are text', async () => {
    await start({ statuses: { [`x${HOSTILE_PAYLOAD}.md`]: 'new' } });
    await openReview();
    expectNoHostileMarkup(review());
    expect(rows()[0].path).toBe(`x${HOSTILE_PAYLOAD}.md`);
  });
});

describe('after a commit', () => {
  it('the notice goes when dismissed, and focus goes back to the button', async () => {
    await start();
    await openReview();
    toggle(box('n.md'));
    type(summary(), 's');
    await press('confirm');
    expect(notice()).toContain('Committed');
    $<HTMLButtonElement>('.page-notice-close').click();
    expect(notice()).toBe('');
    expect(document.activeElement).toBe(button());
  });

  it('with nothing left to commit the button is disabled, and dismissing leaves it be', async () => {
    await start();
    await openReview();
    type(summary(), 's');
    await press('confirm');
    expect(button().disabled).toBe(true);
    $<HTMLButtonElement>('.page-notice-close').click();
    expect(notice()).toBe('');
    expect(document.activeElement).not.toBe(button());
  });

  it('a Changes view of a committed file goes back to the preview', async () => {
    await start({ hash: '#/diff/a.md' });
    expect(location.hash).toBe('#/diff/a.md');
    await openReview();
    type(summary(), 's');
    await press('confirm');
    await settle();
    expect(location.hash).toBe('#/file/a.md');
  });
});
