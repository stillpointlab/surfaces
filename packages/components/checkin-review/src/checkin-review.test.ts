// <checkin-review>: its rows, groups and the box over them, the files changing
// while it is open, what is missing, the branch, the op it asks, busy, a
// refusal, success, and hostile strings.
import { answerOps, fail, ok } from '@stillpointlab/common-format/app';
import {
  expectNoHostileMarkup,
  hostile,
  HOSTILE_PAYLOAD,
} from '@stillpointlab/common-format/testing';
import { afterEach, describe, expect, it } from 'vitest';

import './checkin-review.js';
import { CHECKIN_ACCEPTED_EVENT, REVIEW_WORDS } from './checkin-review.js';

import type { CheckinAccepted, CheckinReview, CheckinReviewInput } from './checkin-review.js';
import type { CheckinFile } from './request.js';
import type { AppOp, AppShellOps, CheckinWords, Result } from '@stillpointlab/common-format/app';

const WORDS: CheckinWords = {
  heading: 'Check in changes',
  help: 'Choose the files to check in.',
  title: 'Title',
  body: 'Description (optional)',
  confirm: 'Check in',
  cancel: 'Cancel',
  busy: 'Checking in…',
  noFiles: 'Choose at least one file to check in.',
};

const FILES: CheckinFile[] = [
  { path: 'a.md', label: 'changed' },
  { path: 'docs/moved.md', from: 'old.md', label: 'moved' },
  { path: 'gone.md', label: 'deleted' },
];

type CheckinOp = AppOp<Pick<AppShellOps, 'checkin'>>;

/** What a test attached to the page, taken off after it. */
const cleanups: (() => void)[] = [];

/** A host on the page: it answers `checkin` with `answer`, and keeps what it was asked. */
function host(
  answer: (op: CheckinOp) => Result<object> | Promise<Result<object>> = () =>
    ok({ status: 'done', message: 'Checked in.' })
) {
  const asked: CheckinOp[] = [];
  let release: (() => void) | null = null;
  let hold = false;
  const stop = answerOps<Pick<AppShellOps, 'checkin'>>(document.body, async (op) => {
    asked.push(op);
    if (hold) await new Promise<void>((resolve) => (release = resolve));
    return answer(op);
  });
  cleanups.push(stop);
  return {
    asked,
    stop,
    hold: () => (hold = true),
    release: () => {
      hold = false;
      release?.();
    },
  };
}

let review: CheckinReview;

function open(overrides: Partial<CheckinReviewInput> = {}): CheckinReview {
  review = document.createElement('checkin-review') as CheckinReview;
  document.body.append(review);
  review.open({ files: FILES, words: WORDS, title: '', ...overrides });
  return review;
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
});

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await new Promise((done) => setTimeout(done, 0));
};
const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));

const $ = <T extends Element = HTMLElement>(selector: string): T =>
  review.querySelector<T & Element>(selector)!;
const dialog = () => $<HTMLElement & { isOpen: boolean }>('modal-dialog');
const rows = () =>
  [...review.querySelectorAll<HTMLElement>('.checkin-review-row')].map((row) => ({
    checked: row.querySelector<HTMLInputElement>('input')!.checked,
    path: row.querySelector('.checkin-review-path')!.textContent,
    label: row.querySelector('.checkin-review-label')!.textContent,
  }));
const box = (path: string) =>
  [...review.querySelectorAll<HTMLInputElement>('.checkin-review-box')].find(
    (input) => input.dataset.path === path
  )!;
const all = () => $<HTMLInputElement>('.checkin-review-all-box');
const title = () => $<HTMLInputElement>('.checkin-review-title');
const body = () => $<HTMLTextAreaElement>('.checkin-review-text');
const branchName = () => $<HTMLInputElement>('.checkin-review-branch-name');
const radio = (value: string) =>
  review.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`);
const count = () => $('.checkin-review-count').textContent;
const error = (): string | null => {
  const shown = $('.checkin-review-error');
  return shown.hidden ? null : shown.textContent;
};
const button = (answer: 'confirm' | 'cancel') => $<HTMLButtonElement>(`[data-answer="${answer}"]`);

function type(field: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

async function press(answer: 'confirm' | 'cancel'): Promise<void> {
  button(answer).click();
  await settle();
}

function heard(type: string): CustomEvent[] {
  const events: CustomEvent[] = [];
  const listener = (event: Event): void => void events.push(event as CustomEvent);
  document.addEventListener(type, listener);
  cleanups.push(() => document.removeEventListener(type, listener));
  return events;
}

describe('the rows', () => {
  it('lists every file checked, a moved one as old → new, with its label and the box over them', async () => {
    open();
    await frame();
    expect(dialog().isOpen).toBe(true);
    expect(review.isOpen).toBe(true);
    expect(dialog().title).toBe(WORDS.heading);
    expect(rows()).toEqual([
      { checked: true, path: 'a.md', label: 'changed' },
      { checked: true, path: 'old.md → docs/moved.md', label: 'moved' },
      { checked: true, path: 'gone.md', label: 'deleted' },
    ]);
    expect($('.checkin-review-label').dataset.label).toBe('changed');
    expect(all().checked).toBe(true);
    expect(count()).toBe('3 of 3 files chosen');
    expect($('.checkin-review-help').textContent).toBe(WORDS.help);
    expect(document.activeElement).toBe(title());
  });

  it('sits under its groups, each once, in the order they first appear', () => {
    open({
      files: [
        { path: 'docs/stage1/phase2/a.md', label: 'todo → done', group: 'Phase 2' },
        { path: 'docs/unassigned/order.yaml', label: 'backlog priority', group: 'Pool & config' },
        { path: 'docs/stage1/phase2/b.md', label: 'content edited', group: 'Phase 2' },
      ],
    });
    const groups = [...review.querySelectorAll('.checkin-review-group')].map((group) => [
      group.querySelector('.checkin-review-group-name')!.textContent,
      [...group.querySelectorAll('.checkin-review-path')].map((path) => path.textContent),
    ]);
    expect(groups).toEqual([
      ['Phase 2', ['docs/stage1/phase2/a.md', 'docs/stage1/phase2/b.md']],
      ['Pool & config', ['docs/unassigned/order.yaml']],
    ]);
    box('docs/stage1/phase2/b.md').click();
    expect(count()).toBe('2 of 3 files chosen');
  });

  it('All unchecks and checks every row, and shows some as mixed', () => {
    open();
    all().click();
    expect(rows().every((row) => !row.checked)).toBe(true);
    expect(count()).toBe('0 of 3 files chosen');
    box('a.md').click();
    expect(all().indeterminate).toBe(true);
    all().click();
    expect(rows().every((row) => row.checked)).toBe(true);
    expect(all().indeterminate).toBe(false);
  });

  it('setFiles: a row keeps its check, a gone one goes, a new one starts unchecked', () => {
    open();
    box('a.md').click();
    box('gone.md').focus();
    review.setFiles([FILES[0]!, { path: 'late.md', label: 'new' }, FILES[2]!]);
    expect(rows()).toEqual([
      { checked: false, path: 'a.md', label: 'changed' },
      { checked: false, path: 'late.md', label: 'new' },
      { checked: true, path: 'gone.md', label: 'deleted' },
    ]);
    expect(document.activeElement).toBe(box('gone.md'));
    expect(count()).toBe('1 of 3 files chosen');
  });

  it('with no files, says so, and confirm asks for one', async () => {
    const asked = host().asked;
    open({ files: [], words: { ...WORDS, nothing: 'Nothing to check in.' } });
    expect($('.checkin-review-nothing').textContent).toBe('Nothing to check in.');
    await press('confirm');
    expect(error()).toBe(WORDS.noFiles);
    expect(asked).toEqual([]);
  });

  it('shows a message from the host under the form, leaving focus where it is', () => {
    open();
    box('a.md').focus();
    review.showMessage(`The changes could not be read. ${HOSTILE_PAYLOAD}`);
    expect(error()).toBe(`The changes could not be read. ${HOSTILE_PAYLOAD}`);
    expectNoHostileMarkup(review);
    expect(document.activeElement).toBe(box('a.md'));
    box('a.md').click();
    expect(error()).toBeNull();
    review.showMessage('Again.');
    review.showMessage(null);
    expect(error()).toBeNull();
  });

  it('setFiles on a closed review does nothing', () => {
    review = document.createElement('checkin-review') as CheckinReview;
    document.body.append(review);
    review.setFiles(FILES);
    expect(review.querySelectorAll('.checkin-review-row')).toHaveLength(0);
  });
});

describe('what is missing', () => {
  it('names each missing thing under the form, with focus on it, and asks nothing', async () => {
    const { asked } = host();
    open({ titleRequired: true, branch: { current: 'main', offerNew: true } });
    all().click();
    type(title(), 'Title');
    await press('confirm');
    expect(error()).toBe(WORDS.noFiles);
    expect(document.activeElement).toBe(all());
    expect(button('confirm').disabled).toBe(false);

    all().click();
    expect(error()).toBeNull();
    type(title(), '   ');
    await press('confirm');
    expect(error()).toBe(REVIEW_WORDS.noTitle('Title'));
    expect(document.activeElement).toBe(title());
    expect(title().getAttribute('aria-invalid')).toBe('true');

    type(title(), 'Title');
    expect(title().hasAttribute('aria-invalid')).toBe(false);
    radio('new')!.click();
    await press('confirm');
    expect(error()).toBe(REVIEW_WORDS.noBranch);
    expect(document.activeElement).toBe(branchName());
    expect(asked).toEqual([]);
  });

  it('the host’s words for what is missing win', async () => {
    open({ titleRequired: true, words: { ...WORDS, noTitle: 'Write a summary.' } });
    await press('confirm');
    expect(error()).toBe('Write a summary.');
  });

  it('a title is not required unless asked for', async () => {
    const { asked } = host();
    open({ titlePlaceholder: 'Inventory check-in' });
    expect(title().placeholder).toBe('Inventory check-in');
    await press('confirm');
    expect(asked).toEqual([
      { type: 'checkin', paths: ['a.md', 'docs/moved.md', 'old.md', 'gone.md'] },
    ]);
  });
});

describe('the op', () => {
  it('asks the host for the checked paths, a moved file’s old one too, the title, body and context', async () => {
    const { asked } = host();
    open({ title: 'Tasks check-in: Board', context: { boardPath: 'docs/b', stage: null } });
    expect(title().value).toBe('Tasks check-in: Board');
    box('gone.md').click();
    type(body(), '\nWhy:\n# kept\n');
    await press('confirm');
    expect(asked).toEqual([
      {
        type: 'checkin',
        paths: ['a.md', 'docs/moved.md', 'old.md'],
        title: 'Tasks check-in: Board',
        body: 'Why:\n# kept',
        context: { boardPath: 'docs/b', stage: null },
      },
    ]);
  });

  it('a new branch: typing its name chooses it, and Enter confirms', async () => {
    const { asked } = host();
    open({ title: 's', branch: { current: 'main', offerNew: true } });
    expect(radio('current')!.checked).toBe(true);
    expect(radio('current')!.parentElement!.textContent!.trim()).toBe('On main');
    type(branchName(), 'topic/x');
    expect(radio('new')!.checked).toBe(true);
    branchName().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    // The op says which branch the review showed as the current one.
    expect(asked[0]).toMatchObject({ branch: 'topic/x', onBranch: 'main' });
  });

  it('the Enter that accepts an input method’s candidate confirms nothing', async () => {
    const { asked } = host();
    open({ title: 's' });
    const field = $<HTMLInputElement>('.checkin-review-title');
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })
    );
    // Some browsers say it by the key code alone.
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true })
    );
    await settle();
    expect(asked).toEqual([]);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(asked).toHaveLength(1);
  });

  it('the current branch sends no branch; Ctrl+Enter in the body confirms', async () => {
    const { asked } = host();
    open({ title: 's', branch: { current: 'main', offerNew: true } });
    type(branchName(), 'typed, then the current one chosen again');
    radio('current')!.click();
    body().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(asked).toEqual([]);
    body().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })
    );
    await settle();
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toHaveProperty('branch');
  });

  it('a detached HEAD offers only a new branch, and says why', async () => {
    const { asked } = host();
    open({ title: 's', branch: { current: null, offerNew: true } });
    expect(radio('current')).toBeNull();
    expect(radio('new')).toBeNull();
    expect($('.checkin-review-detached').textContent).toBe(REVIEW_WORDS.detached);
    await press('confirm');
    expect(error()).toBe(REVIEW_WORDS.noBranch);
    expect(document.activeElement).toBe(branchName());
    type(branchName(), 'rescued');
    await press('confirm');
    expect(asked[0]).toMatchObject({ branch: 'rescued', onBranch: null });
  });

  it('with no new branch offered, says which branch and sends none', async () => {
    const { asked } = host();
    open({ title: 's', branch: { current: 'main', offerNew: false } });
    expect($('.checkin-review-current').textContent).toBe('On main');
    expect(review.querySelector('.checkin-review-branch-name')).toBeNull();
    await press('confirm');
    expect(asked[0]).not.toHaveProperty('branch');
  });
});

describe('asking', () => {
  it('is busy while the host answers: a second confirm, Enter, Escape and the close button wait', async () => {
    const answering = host();
    open({ title: 's' });
    answering.hold();
    button('confirm').focus();
    await press('confirm');
    title().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await press('confirm');
    button('cancel').click();
    expect(answering.asked).toHaveLength(1);
    expect(review.isBusy).toBe(true);
    expect(dialog().getAttribute('aria-busy')).toBe('true');
    expect(button('confirm').textContent).toBe('Checking in…');
    expect(button('confirm').querySelector('spl-icon')!.getAttribute('icon-name')).toBe('spinner');
    // The buttons say they are off and stay focusable, so the one pressed keeps the focus.
    for (const answer of ['confirm', 'cancel'] as const) {
      expect(button(answer).getAttribute('aria-disabled')).toBe('true');
      expect(button(answer).disabled).toBe(false);
    }
    expect(document.activeElement).toBe(button('confirm'));
    expect(title().readOnly).toBe(true);
    expect($<HTMLFieldSetElement>('.checkin-review-files').disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    dialog().shadowRoot!.querySelector<HTMLButtonElement>('.modal-close-button')!.click();
    expect(dialog().isOpen).toBe(true);
    answering.release();
    await settle();
    expect(dialog().isOpen).toBe(false);
    expect(answering.asked).toHaveLength(1);
  });

  it('files set while the host answers wait for the answer', async () => {
    const answering = host(() => fail('HOST_NOT_CHANGED', 'Nothing changed.'));
    open({ title: 's' });
    answering.hold();
    await press('confirm');
    review.setFiles([FILES[0]!, { path: 'late.md', label: 'new' }]);
    expect(rows()).toHaveLength(3);
    answering.release();
    await settle();
    expect(rows()).toEqual([
      { checked: true, path: 'a.md', label: 'changed' },
      { checked: false, path: 'late.md', label: 'new' },
    ]);
  });

  it('a refusal shows as text under the form, which keeps everything, with focus on it', async () => {
    const said = `git commit failed (exit 1). git said:\nlint: line 1\n${HOSTILE_PAYLOAD}`;
    const answering = host(() => fail('HOST_GIT_FAILED', said));
    const { asked } = answering;
    open({ branch: { current: 'main', offerNew: true } });
    box('gone.md').click();
    type(title(), 'Title');
    type(body(), 'Body');
    await press('confirm');
    expect(asked).toHaveLength(1);
    expect(dialog().isOpen).toBe(true);
    expect(error()).toBe(said);
    expectNoHostileMarkup(review);
    expect(document.activeElement).toBe($('.checkin-review-error'));
    expect(title().value).toBe('Title');
    expect(body().value).toBe('Body');
    expect(box('gone.md').checked).toBe(false);
    expect(radio('current')!.checked).toBe(true);
    expect(button('confirm').textContent).toBe(WORDS.confirm);
    expect(button('confirm').querySelector('spl-icon')).toBeNull();
    expect(button('confirm').hasAttribute('aria-disabled')).toBe(false);
    expect(review.isBusy).toBe(false);
    // The line says the words are a refusal's, and which.
    expect($('.checkin-review-error').dataset.code).toBe('HOST_GIT_FAILED');

    // Asking again clears the refusal while the host answers.
    answering.hold();
    button('confirm').click();
    await settle();
    expect(error()).toBeNull();
    expect($('.checkin-review-error').dataset.code).toBeUndefined();
    answering.release();
    await settle();
    expect(error()).toBe(said);

    // The review's own line, and the host's message, carry no code.
    for (const path of ['a.md', 'docs/moved.md', 'gone.md']) {
      if (box(path).checked) box(path).click();
    }
    await press('confirm');
    expect(error()).toBe(WORDS.noFiles);
    expect($('.checkin-review-error').dataset.code).toBeUndefined();
  });

  it('a refusal the host names a field for puts focus there', async () => {
    host(() => fail('HOST_BRANCH_EXISTS', 'There is already a branch named "main".'));
    open({
      title: 's',
      branch: { current: 'main', offerNew: true },
      refusalField: (code) => (code.startsWith('HOST_BRANCH_') ? 'branch' : null),
    });
    type(branchName(), 'main');
    await press('confirm');
    expect(error()).toBe('There is already a branch named "main".');
    expect(document.activeElement).toBe(branchName());
  });

  it('with nothing to answer it, says so and stays open', async () => {
    open({ title: 's' });
    await press('confirm');
    expect(error()).toBe('Nothing answered the "checkin" op');
    expect(dialog().isOpen).toBe(true);
  });

  it('done closes it, with a notification of the reply’s message and checkin-accepted', async () => {
    host();
    const notices = heard('notification');
    const accepted = heard(CHECKIN_ACCEPTED_EVENT);
    open({ title: 's' });
    await press('confirm');
    expect(dialog().isOpen).toBe(false);
    expect(review.isOpen).toBe(false);
    expect(notices.map((event) => event.detail)).toEqual([
      { message: 'Checked in.', type: 'success' },
    ]);
    expect((accepted[0]!.detail as CheckinAccepted).reply).toEqual({
      status: 'done',
      message: 'Checked in.',
    });
    expect((accepted[0]!.detail as CheckinAccepted).op.paths).toEqual([
      'a.md',
      'docs/moved.md',
      'old.md',
      'gone.md',
    ]);
    // What was open is gone: nothing of the form is left in the page.
    expect(review.querySelector('.checkin-review-body')).toBeNull();
  });

  it('started closes it too, its notice informational; a reply with no message raises none', async () => {
    let reply: Result<object> = ok({ status: 'started', message: 'Checking in 3 files…' });
    host(() => reply);
    const notices = heard('notification');
    open({ title: 's' });
    await press('confirm');
    expect(notices.map((event) => event.detail)).toEqual([
      { message: 'Checking in 3 files…', type: 'info' },
    ]);
    reply = ok({ status: 'done' });
    review.open({ files: FILES, words: WORDS, title: 's' });
    await press('confirm');
    expect(dialog().isOpen).toBe(false);
    expect(notices).toHaveLength(1);
  });

  it('Cancel and close() close it, asking nothing', async () => {
    const { asked } = host();
    open({ title: 's' });
    await press('cancel');
    expect(dialog().isOpen).toBe(false);
    review.open({ files: FILES, words: WORDS, title: 's' });
    review.close();
    expect(review.isOpen).toBe(false);
    expect(asked).toEqual([]);
  });

  it('two reviews on a page have ids of their own', () => {
    open();
    const first = title().id;
    const second = document.createElement('checkin-review') as CheckinReview;
    document.body.append(second);
    second.open({ files: FILES, words: WORDS, title: '' });
    const other = second.querySelector<HTMLInputElement>('.checkin-review-title')!.id;
    expect(other).not.toBe(first);
    expect(document.querySelectorAll(`#${other}`)).toHaveLength(1);
  });
});

describe('hostile input', () => {
  it('escapes every path, label, group, word, note and title', async () => {
    const input = hostile<CheckinReviewInput>({
      files: [
        { path: 'a.md', label: 'changed', group: 'Phase 1' },
        { path: 'b.md', from: 'old.md', label: 'moved' },
      ],
      words: { ...WORDS, detached: 'Detached.', nothing: 'None.' },
      title: 'A title',
      titlePlaceholder: 'A placeholder',
      branch: { current: 'main', offerNew: true },
      note: 'A note',
    });
    open(input);
    expectNoHostileMarkup(review);
    expect(title().value).toBe(`A title${HOSTILE_PAYLOAD}`);
    expect(rows()[0]!.path).toBe(`a.md${HOSTILE_PAYLOAD}`);
    expect(dialog().shadowRoot!.querySelector('.modal-title')!.textContent).toBe(
      `${WORDS.heading}${HOSTILE_PAYLOAD}`
    );
    review.open({ ...input, branch: { current: null, offerNew: true } });
    expectNoHostileMarkup(review);
    review.setFiles([]);
    expectNoHostileMarkup(review);
    expect($('.checkin-review-nothing').textContent).toBe(`None.${HOSTILE_PAYLOAD}`);
  });
});
