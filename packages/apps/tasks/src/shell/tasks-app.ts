/// <reference lib="dom" />
/**
 * `<spl-tasks-app>`: the tasks app's page around its elements (the app
 * contract's `AppShellElement`). A host gives it a base, a view, its state and
 * what the page embeds beside it (`extras`: the strip's state and the folder
 * boards go in); the shell lays out the top bar (back, the location, Refresh
 * and, on a board, Settings) and `<spl-tasks-nav>` beside `<spl-task-board>`,
 * or the empty state where no board is, and builds the strip's links from the
 * base and the module's pages.
 *
 * What it does itself: Refresh asks the host `refresh`, then reads the nav and
 * the view again with `project`; after a dialog's change (`edit-manifest`,
 * `create-card`, `set-title`, `set-tags`) it reads the board again; a pool
 * reorder is sent with the view on screen (`opView`); and the two ops that
 * only read a view, `refresh-stage` and `close-candidates`, are its own,
 * answered through `project`, so they never reach the host.
 *
 * Check-in is the shell's too: it holds one `<checkin-review>`, takes the
 * board's `checkin-request` (a host never hears it), and opens the review on
 * the request's cards, order file and housekeeping, grouped by phase on a stage
 * view, titled "Tasks check-in: <board>", with the board's path and the stage
 * as the op's context. The review asks the host `checkin`, in the host's words
 * (`input.checkin`) or the shell's own. After a `started` reply the board marks
 * the paths in flight until the host calls `checkinSettled()`. When the board
 * is given a new state while the review is open, its rows follow.
 *
 * What stays the host's: navigation (a link click, and every page the strip or
 * a refresh goes to, raise `navigate`; the shell never sets `location`), the
 * options menu, opening a card, answering `checkin`, reloading and the banner:
 * the elements' other requests bubble through it unchanged.
 */
import '@stillpointlab/checkin-review-component';
import '@stillpointlab/spl-icon-component';
import '../element/task-board.js';
import '../element/tasks-nav.js';

import { CHECKIN_ACCEPTED_EVENT } from '@stillpointlab/checkin-review-component';
import {
  APP_OP_EVENT,
  createReadyGate,
  fail,
  ok,
  reportError,
  requestOp,
} from '@stillpointlab/common-format/app';
import { defineElement } from '@stillpointlab/common-format/elements';
import { html, render } from '@stillpointlab/common-format/html';

import { checkinRequestOf } from '../checkinRequest.js';
import { TASKS_SHELL_OPS } from '../elementOps.js';

import {
  checkinContextOf,
  tasksCheckinFiles,
  TASKS_CHECKIN_WORDS,
  tasksCheckinTitle,
} from './checkin.js';
import {
  asNavProjection,
  currentOf,
  docsRootOf,
  landingHref,
  leavesPage,
  navStateOf,
  tasksLinks,
} from './links.js';
import { shellStyles } from './shell.styles';

import type { TasksShellView } from './links.js';
import type { TaskBoard, TaskBoardCheckinRequest } from '../element/task-board.js';
import type { TasksNav } from '../element/tasks-nav.js';
import type { SharedTaskBoardState, SharedTaskStageState } from '../types.js';
import type { CheckinAccepted, CheckinReview } from '@stillpointlab/checkin-review-component';
import type {
  AppOpDetail,
  AppShellElement,
  AppShellInput,
  AppShellOps,
  Result,
} from '@stillpointlab/common-format/app';
import type { SafeHtml } from '@stillpointlab/common-format/html';

/**
 * Raised (bubbling, composed, cancelable) with `{ href }` when a link in the
 * shell is followed, and when the app goes to a page with no link behind it.
 * A host that claims it calls `preventDefault()` and navigates itself.
 */
export const NAVIGATE_EVENT = 'navigate';

/** The `navigate` event's detail. */
export interface TasksNavigate {
  href: string;
}

/**
 * The ops after which the shell reads the board again: those whose change the
 * board behind a dialog shows, and those that write a file beside the card they
 * name (the pool's order on a move out of it, other cards' links, the manifest's
 * tags), whose marks the count and the check-in would otherwise miss.
 */
const READS_THE_BOARD_AGAIN: ReadonlySet<string> = new Set([
  'edit-manifest',
  'create-card',
  'set-title',
  'set-tags',
  'move-file',
  'fix-references',
  'add-tag',
]);

/** The elements' ops the shell answers itself, through `project`. */
const CLAIMED_OPS: ReadonlySet<string> = new Set(TASKS_SHELL_OPS);

/** The board's request to check in what changed; it stops at the shell. */
const CHECKIN_REQUEST_EVENT = 'checkin-request';

const REFRESH_LABEL = '⟳ Refresh';
const SETTINGS_UNAVAILABLE = 'Board settings is unavailable — the board state did not load.';

type NotificationType = 'info' | 'success' | 'warning' | 'error';

/** What the body shows: a phase's board, a stage's swimlanes, the empty state, or nothing known. */
type Body = 'board' | 'stage' | 'empty' | 'missing';

type ClaimedOp = { type: string } & Record<string, unknown>;

/** The view a host gave, as the shell tells them apart; `undefined` for one it does not know. */
function viewOf(input: AppShellInput): TasksShellView | undefined {
  const { view } = input;
  if (view === null) return null;
  if (view.type === 'board' && typeof view.path === 'string') {
    return { type: 'board', path: view.path };
  }
  if (view.type === 'stage' && typeof view.stage === 'number') {
    return { type: 'stage', stage: view.stage };
  }
  return undefined;
}

function bodyOf(view: TasksShellView | undefined): Body {
  if (view === undefined) return 'missing';
  return view === null ? 'empty' : view.type;
}

/** Whether a click on `link` is one the page would follow in place: no modifier, no new window. */
function followsInPlace(event: MouseEvent, link: HTMLAnchorElement): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.hasAttribute('download')) return false;
  const target = link.getAttribute('target');
  return target === null || target === '' || target === '_self';
}

const sameView = (a: TasksShellView | undefined, b: TasksShellView | undefined): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export class TasksApp extends HTMLElement implements AppShellElement {
  private input: AppShellInput | null = null;
  /** The input changed since it was last painted. */
  private stale = false;
  private readonly ready = createReadyGate(this);
  private styleElement: HTMLStyleElement | null = null;
  /** What the layout was built for: the body, the view, whether it had state, the empty state's folder. */
  private shown: string | null = null;
  private bar: HTMLElement | null = null;
  private board: TaskBoard | null = null;
  private strip: TasksNav | null = null;
  private review: CheckinReview | null = null;
  private refreshing = false;
  private settingsUnavailable = false;
  /** Issue order of the reads: only the newest may settle what it read (Context Manager's rule). */
  private viewReads = 0;
  private navReads = 0;

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  setState(input: AppShellInput): void {
    this.input = input;
    this.stale = true;
    this.refresh();
    this.reviewFollows();
  }

  /** A check-in the host answered `started` has settled: the board's in-flight marks go. */
  checkinSettled(): void {
    this.board?.clearCheckinInFlight();
  }

  /**
   * After a change lands that the board, or the strip, does not show by itself,
   * it is read again: the strip after the manifest's settings (its done column
   * decides what "Close…" lists).
   */
  learn(op: { type: string }, _reply: object): void {
    if (op.type === 'edit-manifest') void this.readNavAgain();
    if (!READS_THE_BOARD_AGAIN.has(op.type)) return;
    if (this.view()?.type !== 'board') return;
    void this.readViewAgain();
  }

  /** A pool reorder answers the pool of the view on screen: a board's, or a stage's. */
  opView(op: { type: string }): ({ type: string } & Record<string, unknown>) | undefined {
    if (op.type !== 'reorder-pool') return undefined;
    return this.view() ?? undefined;
  }

  connectedCallback(): void {
    this.addEventListener('click', this.handleClick);
    // Capture, so the shell claims its two ops before a host's listener on the shell sees them.
    this.addEventListener(APP_OP_EVENT, this.claimOps, true);
    // And so it takes the board's check-in request before a host's listener hears it.
    this.addEventListener(CHECKIN_REQUEST_EVENT, this.openCheckin, true);
    this.addEventListener(CHECKIN_ACCEPTED_EVENT, this.checkinAccepted);
    this.refresh();
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.handleClick);
    this.removeEventListener(APP_OP_EVENT, this.claimOps, true);
    this.removeEventListener(CHECKIN_REQUEST_EVENT, this.openCheckin, true);
    this.removeEventListener(CHECKIN_ACCEPTED_EVENT, this.checkinAccepted);
    this.ready.begin();
  }

  private view(): TasksShellView | undefined {
    return this.input ? viewOf(this.input) : undefined;
  }

  private refresh(): void {
    if (!this.isConnected || !this.input) return;
    if (this.stale) {
      this.stale = false;
      this.paint(this.input);
    }
    this.ready.settle();
  }

  // ---- Painting ----------------------------------------------------------------

  private paint(input: AppShellInput): void {
    const view = viewOf(input);
    const body = bodyOf(view);
    // A new page gets new elements, as a page load gave them: a board reads its
    // variant once, and keeps no filter or selection from another view.
    const shown = JSON.stringify([
      body,
      view ?? null,
      input.state === null,
      body === 'empty' ? docsRootOf(input.extras) : '',
    ]);
    if (shown !== this.shown || !this.bar) {
      render(
        this,
        html`
          <div class="tasks-topbar"></div>
          <div class="board-layout">
            <nav class="tasks-nav" aria-label="Stages and phases"><spl-tasks-nav></spl-tasks-nav></nav>
            ${this.bodyHtml(body, input)}
          </div>`
      );
      if (!this.styleElement) {
        this.styleElement = document.createElement('style');
        this.styleElement.textContent = shellStyles;
      }
      this.prepend(this.styleElement);
      // The review outlives the layout: it goes back after each one.
      this.review ??= document.createElement('checkin-review') as CheckinReview;
      this.append(this.review);
      this.bar = this.querySelector<HTMLElement>(':scope > .tasks-topbar');
      this.board = this.querySelector<TaskBoard>(':scope > .board-layout > spl-task-board');
      this.strip = this.querySelector<TasksNav>(':scope > .board-layout spl-tasks-nav');
      this.shown = shown;
      this.settingsUnavailable = false;
    }
    this.paintBar();

    const strip = this.strip!;
    strip.links = tasksLinks(input.base);
    const navState = navStateOf(input.extras);
    if (navState) strip.setState(navState);

    if (this.board && input.state !== null) {
      if (body === 'stage') this.board.setStageState(input.state as SharedTaskStageState);
      else this.board.setState(input.state as SharedTaskBoardState);
    }
  }

  private bodyHtml(body: Body, input: AppShellInput): SafeHtml {
    if (body === 'board' || body === 'stage') {
      // Without a state the board says it could not load.
      return html`<spl-task-board variant="${body}" storage-key="${input.base}"></spl-task-board>`;
    }
    if (body === 'empty') {
      const docsRoot = docsRootOf(input.extras);
      return html`
        <section class="task-board-empty">
          <h2>No boards yet</h2>
          <p>
            A board is a <code>stage&lt;N&gt;/phase&lt;M&gt;</code> folder under
            <code>${docsRoot === '' ? 'the repository root' : `${docsRoot}/`}</code> containing
            both a <code>briefs/</code> and a <code>specs/</code> subfolder — no folder there
            qualifies yet.
          </p>
          <p>
            Use <strong>+ stage</strong> above to create the first one here (local until
            check-in), or add the folders upstream and hit <strong>⟳ Refresh</strong> above.
          </p>
        </section>`;
    }
    return html`
      <div class="tasks-app-missing" role="status">
        <p>There is nothing to show here.</p>
        <a href="${landingHref(input.base)}">Open the tasks</a>
      </div>`;
  }

  private paintBar(): void {
    const input = this.input;
    if (!this.bar || !input) return;
    const { back, location } = input;
    const onBoard = bodyOf(viewOf(input)) === 'board';
    render(
      this.bar,
      html`
        ${
          back
            ? html`
              <a class="back-button" href="${back.href}" aria-label="${back.label}" title="${back.label}">
                <spl-icon icon-name="back-arrow" data-size="medium" data-padding="none" aria-hidden="true" inert></spl-icon>
              </a>`
            : ''
        }
        <spl-icon icon-name="task" data-size="medium" data-padding="none" aria-hidden="true" inert></spl-icon>
        ${
          typeof location === 'string' && location !== ''
            ? html`<span class="task-board-repo" title="${location}">${location}</span>`
            : ''
        }
        <button
          type="button"
          class="tasks-nav-button tasks-refresh"
          title="Refresh — sync the repository and update this board"
          aria-busy="${this.refreshing ? 'true' : 'false'}"
          ${this.refreshing ? html`disabled` : ''}
        >${this.refreshing ? 'Refreshing…' : REFRESH_LABEL}</button>
        ${
          onBoard
            ? html`<button
                type="button"
                class="tasks-nav-button tasks-board-settings"
                title="${
                  this.settingsUnavailable
                    ? SETTINGS_UNAVAILABLE
                    : 'Board settings — columns, kinds, default and done columns (edits tasks.yaml locally until check-in)'
                }"
                ${this.settingsUnavailable ? html`disabled` : ''}
              >⚙ Settings</button>`
            : ''
        }`
    );
  }

  // ---- Refresh and reads -----------------------------------------------------------

  /** Refresh: the host brings the instance up to date, then the nav and the view are read again. */
  private async refreshFromSource(): Promise<void> {
    if (this.refreshing) return;
    this.setRefreshing(true);
    try {
      const res = await requestOp<AppShellOps, 'refresh'>(this, { type: 'refresh' });
      if (!res.ok) {
        reportError('Failed to refresh the tasks', res);
        this.notify(res.message || 'Could not refresh.', 'error');
        return;
      }
      await Promise.all([
        this.readNavAgain(),
        this.view() === null ? Promise.resolve() : this.readViewAgain(),
      ]);
    } finally {
      this.setRefreshing(false);
    }
  }

  /** The Refresh button's busy state, set in place so the button keeps its focus. */
  private setRefreshing(busy: boolean): void {
    this.refreshing = busy;
    const button = this.bar?.querySelector<HTMLButtonElement>('.tasks-refresh');
    if (!button) return;
    button.disabled = busy;
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
    button.textContent = busy ? 'Refreshing…' : REFRESH_LABEL;
  }

  /** Read the view on screen again and hand it to the board. */
  private async readViewAgain(): Promise<void> {
    const view = this.view();
    if (!view) return;
    const read = ++this.viewReads;
    const res = await requestOp<AppShellOps, 'project'>(this, { type: 'project', view });
    if (read !== this.viewReads || !sameView(view, this.view())) return;
    if (!res.ok) {
      reportError('Failed to read the board again', res);
      return;
    }
    if (res.state === null || !this.board || !this.input) return;
    this.input = { ...this.input, state: res.state };
    if (view.type === 'stage') this.board.setStageState(res.state as SharedTaskStageState);
    else this.board.setState(res.state as SharedTaskBoardState);
    this.reviewFollows();
  }

  /**
   * Read the nav again and hand it to the strip, keeping the page's selection;
   * or leave for the landing when the page has nothing left to show.
   */
  private async readNavAgain(): Promise<void> {
    const view = this.view();
    if (view === undefined) return;
    const read = ++this.navReads;
    const res = await requestOp<AppShellOps, 'project'>(this, {
      type: 'project',
      view: { type: 'nav' },
    });
    if (read !== this.navReads || !sameView(view, this.view()) || !this.input) return;
    if (!res.ok) {
      reportError('Failed to read the tasks navigation again', res);
      return;
    }
    const nav = asNavProjection(res.state);
    if (!nav) {
      reportError('The tasks navigation read again is not a nav');
      return;
    }
    if (leavesPage(view, nav)) {
      this.navigate(landingHref(this.input.base));
      return;
    }
    const current =
      this.strip?.navState?.current ??
      navStateOf(this.input.extras)?.current ??
      currentOf(view, nav);
    this.strip?.setState({ ...nav, current });
  }

  // ---- The two ops the shell answers ---------------------------------------------

  /** Claim `refresh-stage` and `close-candidates` from the elements and answer them here. */
  private readonly claimOps = (event: Event): void => {
    if (event.target === this) return;
    const detail = (event as CustomEvent<AppOpDetail<ClaimedOp>>).detail;
    if (!detail || typeof detail.respond !== 'function') return;
    if (!CLAIMED_OPS.has(String(detail.op?.type))) return;
    event.preventDefault();
    event.stopPropagation();
    detail.respond(this.answerClaimed(detail.op));
  };

  private async answerClaimed(op: ClaimedOp): Promise<Result<object>> {
    if (op.type === 'refresh-stage') {
      const { stage } = op;
      if (typeof stage !== 'number') return fail('APP_OP_INVALID', 'refresh-stage needs a stage');
      const res = await requestOp<AppShellOps, 'project'>(this, {
        type: 'project',
        view: { type: 'stage', stage },
      });
      if (!res.ok) return res;
      if (res.state === null) return fail('TASKS_STAGE_NOT_FOUND', `There is no stage ${stage}`);
      return ok({ stage: res.state });
    }
    const { path } = op;
    if (typeof path !== 'string') return fail('APP_OP_INVALID', 'close-candidates needs a path');
    const res = await requestOp<AppShellOps, 'project'>(this, {
      type: 'project',
      view: { type: 'board', path },
    });
    if (!res.ok) return res;
    const state = res.state as Partial<SharedTaskBoardState> | null;
    if (!state || !Array.isArray(state.cards)) {
      return fail('TASKS_BOARD_NOT_FOUND', `There is no board at ${path}`);
    }
    return ok({
      cards: state.cards.map((card) => ({
        path: card.path,
        title: card.frontmatterTitle ?? card.title,
        column: card.column,
      })),
    });
  }

  // ---- Check-in ----------------------------------------------------------------------

  /** The board's check-in request stops here: the review opens on what it carries. */
  private readonly openCheckin = (event: Event): void => {
    if (event.target === this) return;
    event.stopPropagation();
    const request = (event as CustomEvent<TaskBoardCheckinRequest>).detail;
    const input = this.input;
    if (!input || !this.review || !request || !Array.isArray(request.cards)) return;
    this.review.open({
      files: tasksCheckinFiles(request),
      words: input.checkin?.words ?? TASKS_CHECKIN_WORDS,
      title: tasksCheckinTitle(request.boardLabel),
      context: checkinContextOf(request),
      ...(input.checkin?.branch ? { branch: input.checkin.branch } : {}),
    });
  };

  /** A check-in the host took: one that runs on marks its paths in flight on the board. */
  private readonly checkinAccepted = (event: Event): void => {
    if (event.target !== this.review) return;
    const { op, reply } = (event as CustomEvent<CheckinAccepted>).detail;
    if (reply.status === 'started') this.board?.markCheckinInFlight(op.paths);
  };

  /** The rows of an open review follow the state the board was given. */
  private reviewFollows(): void {
    const review = this.review;
    const state = this.input?.state;
    if (!review?.isOpen || !state) return;
    const body = bodyOf(this.view());
    if (body !== 'board' && body !== 'stage') return;
    const request = checkinRequestOf(state as SharedTaskBoardState | SharedTaskStageState, body);
    review.setFiles(tasksCheckinFiles(request));
  }

  // ---- Requests --------------------------------------------------------------------

  private notify(message: string, type: NotificationType): void {
    this.dispatchEvent(
      new CustomEvent('notification', { detail: { message, type }, bubbles: true, composed: true })
    );
  }

  /** Ask the host to go to `href`; whether it goes is the host's. */
  private navigate(href: string): boolean {
    return !this.dispatchEvent(
      new CustomEvent<TasksNavigate>(NAVIGATE_EVENT, {
        detail: { href },
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    );
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('button');
    if (button && this.bar?.contains(button)) {
      if (button.classList.contains('tasks-refresh')) void this.refreshFromSource();
      else if (button.classList.contains('tasks-board-settings')) this.openSettings();
      return;
    }
    // A followed link is the host's to navigate: it claims `navigate`, or the browser follows it.
    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (!link || !this.contains(link) || !followsInPlace(event, link)) return;
    if (this.navigate(link.getAttribute('href')!)) event.preventDefault();
  };

  /** Settings is the board's dialog; with no board state to edit, the button says so. */
  private openSettings(): void {
    if (this.board?.openSettings()) return;
    this.settingsUnavailable = true;
    const button = this.bar?.querySelector<HTMLButtonElement>('.tasks-board-settings');
    if (!button) return;
    button.disabled = true;
    button.title = SETTINGS_UNAVAILABLE;
  }
}

defineElement('spl-tasks-app', TasksApp);

declare global {
  interface HTMLElementTagNameMap {
    'spl-tasks-app': TasksApp;
  }
}
