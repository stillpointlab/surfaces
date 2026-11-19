// The explorer's commit, over the check-in review (`<checkin-review>`), the same
// element an app's shell holds, so the host has one review.
//
// Opening reads the branch and the changes first (`client.git()` and
// `client.changes()`); a read that fails, or that finds nothing changed, says so
// in the page's notice and opens nothing. Otherwise the review opens on the
// changes in the tree's order, each with its status as its label, a moved one
// as old → new; a required summary; the branch, the current one or a new one
// (only a new one when `HEAD` is detached); and a note when the open file has
// unsaved edits, which a commit does not take.
//
// The review asks `checkin`, and this answers it with the page's commit (the
// marks and the branch follow there): `done` with the notice's words, or the
// refusal as it is, git's own words included, which the review shows under the
// form with focus on what to fix (`refusalField`). After `HOST_NOT_CHANGED`, and
// whenever the host says the changes moved while it is open, the changes are
// read again and given to the review (`setFiles`): a row keeps its check, a row
// that went goes, a row that appeared starts unchecked. A read that fails then
// is said under the form.

import '@stillpointlab/checkin-review-component';
import { answerOps, fail, ok } from '@stillpointlab/common-format/app';

import { words } from '../words';

import { checkinOpFrom, COMMIT_WORDS, commitFiles, commitRequestOf, refusalField } from './rows';

import type { Notice } from '../apps/app-pane';
import type { HostClient } from '../host-client';
import type { CheckinReview } from '@stillpointlab/checkin-review-component';
import type { AppShellOps, Result } from '@stillpointlab/common-format/app';
import type { HostChange, HostCommit, HostCommitRequest } from '@stillpointlab/common-format/host';

export interface CommitReviewContext {
  client: HostClient;
  /** The open file's name when it has unsaved edits, which a commit does not take. */
  unsaved(): string | null;
  /** The page's commit: the marks and the branch follow it. */
  commit(request: HostCommitRequest): Promise<Result<HostCommit>>;
  /** The page's one notice. */
  notify(notice: Notice): void;
}

const NOTICE_TONES = new Set(['info', 'success', 'warning', 'error']);

export class CommitReview {
  readonly element: CheckinReview;
  /** Settles `open()` with the commit made, when the review closes. */
  private closed: ((made: HostCommit | null) => void) | null = null;
  private landed: HostCommit | null = null;
  /** `open()` is reading, before the review shows: a second call waits for nothing and opens nothing. */
  private opening = false;
  private reading: Promise<void> | null = null;
  private readAgain = false;
  private readonly listening = new AbortController();

  constructor(
    host: HTMLElement,
    private readonly context: CommitReviewContext
  ) {
    this.element = document.createElement('checkin-review') as CheckinReview;
    this.element.className = 'commit-review';
    host.append(this.element);
    const { signal } = this.listening;
    const stop = answerOps<Pick<AppShellOps, 'checkin'>>(this.element, (op) =>
      this.answer(op as unknown as Record<string, unknown>)
    );
    signal.addEventListener('abort', stop);
    this.element.addEventListener(
      'notification',
      (event) => {
        event.stopPropagation();
        const detail = (event as CustomEvent<{ message?: unknown; type?: unknown }>).detail;
        if (typeof detail?.message !== 'string') return;
        const tone =
          typeof detail.type === 'string' && NOTICE_TONES.has(detail.type) ? detail.type : 'info';
        this.context.notify({ text: detail.message, tone: tone as Notice['tone'] });
      },
      { signal }
    );
    this.element.addEventListener(
      'modal-closed',
      () => {
        const settle = this.closed;
        this.closed = null;
        settle?.(this.landed);
      },
      { signal }
    );
  }

  get isOpen(): boolean {
    return this.element.isOpen;
  }

  destroy(): void {
    this.listening.abort();
    this.element.remove();
  }

  /**
   * Read the branch and the changes, then open the review on them; resolves
   * with the commit made, or null when it closed without one, found nothing to
   * commit, or could not read.
   */
  async open(): Promise<HostCommit | null> {
    if (this.opening || this.closed !== null || this.isOpen) return null;
    const { client } = this.context;
    let changes: HostChange[];
    let branch: string | null;
    this.opening = true;
    try {
      const [git, read] = await Promise.all([client.git(), client.changes()]);
      if (!read.ok) {
        this.context.notify({ text: words.commit.readFailed(read.message), tone: 'error' });
        return null;
      }
      changes = read.changes;
      branch = git.branch;
    } catch (error) {
      this.context.notify({ text: words.commit.readFailed(String(error)), tone: 'error' });
      return null;
    } finally {
      this.opening = false;
    }
    if (changes.length === 0) {
      this.context.notify({ text: words.commit.nothing, tone: 'info' });
      return null;
    }
    this.landed = null;
    const unsaved = this.context.unsaved();
    const closing = new Promise<HostCommit | null>((resolve) => (this.closed = resolve));
    this.element.open({
      files: commitFiles(changes),
      words: COMMIT_WORDS,
      title: '',
      titleRequired: true,
      branch: { current: branch, offerNew: true },
      ...(unsaved === null ? {} : { note: words.commit.unsaved(unsaved) }),
      refusalField,
    });
    return closing;
  }

  /** The changes may have moved: while the review is open, read them again and give them to it. */
  changesMoved(): Promise<void> {
    if (!this.isOpen) return Promise.resolve();
    if (this.reading) {
      this.readAgain = true;
      return this.reading;
    }
    this.reading = (async () => {
      do {
        this.readAgain = false;
        let read: Result<{ changes: HostChange[] }>;
        try {
          read = await this.context.client.changes();
        } catch (error) {
          read = fail('HOST_READ_FAILED', String(error));
        }
        if (!this.isOpen) return;
        if (read.ok) this.element.setFiles(commitFiles(read.changes));
        else this.element.showMessage(words.commit.readFailed(read.message));
      } while (this.readAgain);
    })().finally(() => (this.reading = null));
    return this.reading;
  }

  /** The review's `checkin`: the page's commit, `done` with the notice's words, or its refusal. */
  private async answer(raw: Record<string, unknown>): Promise<Result<object>> {
    const op = raw.type === 'checkin' ? checkinOpFrom(raw) : null;
    if (!op) return fail('APP_OP_INVALID', `The commit dialog does not ask "${String(raw.type)}"`);
    let made: Result<HostCommit>;
    try {
      made = await this.context.commit(commitRequestOf(op, ''));
    } catch (error) {
      made = fail('HOST_COMMIT_FAILED', String(error));
    }
    if (!made.ok) {
      // The changes moved under the request: the review shows them as they are now.
      if (made.code === 'HOST_NOT_CHANGED') void this.changesMoved();
      return made;
    }
    this.landed = { commit: made.commit, short: made.short, branch: made.branch };
    return ok({ status: 'done', message: words.commit.notice(made.short, made.branch) });
  }
}
