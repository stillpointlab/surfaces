// The app pane: one instance's shell, beside the file pane in the page's `<main>`.
// One of the two shows at a time; the page decides which (`navigate`).
//
// It loads the app's shell through the page's registration, resolves the page
// the address names on the server (`HostClient.appPage`), and sets the shell's
// input: `base` is `#/app/<manifestPath>`, `location` the served folder's name,
// there is no back link, and `checkin` is a commit's: the commit's words, and
// in a repository the branch, read again each time the input is set, with a new
// one offered. It answers the shell's ops (`answerOps`):
//
// - a core op goes to the server with `shell.opView(op)`, read before the first
//   wait, and its reply to `shell.learn(op, reply)`; one the host wrote with no
//   undo step (its `notice`) says so in the page's notice;
// - `project` reads one view; `refresh` reads the listing, the statuses and the
//   instances again;
// - `checkin`, the shell's check-in review confirmed, is the page's commit of
//   its paths: the title is the summary ("<the app's label> check-in" when there
//   is none) and the body the details, `branch` a new branch. The reply is
//   `done` with the commit notice's words; a refusal goes back as it is, so the
//   review shows git's own words. The commit raises `status`, and the page is
//   resolved again, so the app's marks clear;
// - a host op the registration names (inventory's `link-editor`) is answered in
//   the page; any other goes to the server.
//
// It answers the shell's requests: `navigate` to an address in the page is
// claimed and opened through the page, `open-card` opens the file's preview, a
// `notification` goes to the page's notice, `reload-request` resolves the page
// again, and `open-options-menu` (`{ items, anchor }`) opens the page's menu at
// the anchor, a chosen entry answered with `options-menu-select` (`{ itemId }`)
// on the element that asked. A shell takes its elements' `checkin-request`
// itself.
//
// Staying current: a `changed` event for a path in the instance's region, a
// `listed` or a `status` resolves the page again. One that arrives while the
// pane's own op is unanswered waits for the answer; the shell's input is then
// set only when the resolved revision, or the branch, differs from the one it
// shows, so the pane's own op, already learned from its reply, sets nothing
// twice.
//
// An instance discovery marks invalid shows its errors and "Show files…", and
// no shell.

import { answerOps, fail, ok } from '@stillpointlab/common-format/app';
import { html, render } from '@stillpointlab/common-format/html';

import { appBase, inRegion } from '../../shared/apps';
import { formatAddress } from '../address';
import { checkinOpFrom, COMMIT_WORDS, commitRequestOf } from '../commit/rows';
import { words } from '../words';

import type { AppAddress } from '../address';
import type { HostClient, HostEvent } from '../host-client';
import type { ClientApp, ClientApps } from './registry';
import type { FoundInstance } from '../../shared/apps';
import type { AppShellElement, AppShellInput, Result } from '@stillpointlab/common-format/app';
import type { HostCommit, HostCommitRequest, HostGit } from '@stillpointlab/common-format/host';

/** A notice for the page: a line, and a short list under it. */
export interface Notice {
  text: string;
  lines?: readonly string[];
  tone?: 'info' | 'success' | 'warning' | 'error';
}

export interface AppPaneOptions {
  client: HostClient;
  apps: ClientApps;
  /** The served folder's name: the shell's `location`. */
  location(): string;
  /** Open an address in the page, as a link to it would: `#/…`. */
  navigate(hash: string, how?: 'push' | 'replace'): void;
  /** Show a notice in the page's one notice. */
  notify(notice: Notice): void;
  /** Read the listing, the statuses and the instances again. */
  refresh(): Promise<void>;
  /** "Show files…", from the pane of an instance that cannot open. */
  showFiles(instance: FoundInstance): void;
  /** The folder's git, read again; `null` outside a repository. */
  git(): Promise<HostGit | null>;
  /** The page's commit, which an app's check-in is here: the marks and the branch follow it. */
  commit(request: HostCommitRequest): Promise<Result<HostCommit>>;
  /** Open the page's menu with these items at the anchor; `choose` answers the one picked. */
  openMenu(request: {
    anchor: Element;
    items: readonly OptionsMenuItem[];
    choose(itemId: string): void;
  }): void;
  /** What the pane shows changed its title (`null`: nothing open). */
  onTitle(title: string | null): void;
}

/** One entry an element asks the page's menu for. */
export interface OptionsMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  title?: string;
}

type Op = { type: string } & Record<string, unknown>;

/** The items an `open-options-menu` carries, keeping only what has the right shape. */
function itemsOf(value: unknown): OptionsMenuItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    const { id, label, disabled, title } = (item ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || typeof label !== 'string') return [];
    return [
      {
        id,
        label,
        ...(disabled === true ? { disabled: true } : {}),
        ...(typeof title === 'string' ? { title } : {}),
      },
    ];
  });
}
type Shell = AppShellElement & HTMLElement;

interface Mounted {
  manifestPath: string;
  app: ClientApp;
  shell: Shell;
  stop: AbortController;
}

const NOTICE_TONES = new Set(['info', 'success', 'warning', 'error']);

export class AppPane {
  private readonly options: AppPaneOptions;
  private readonly message: HTMLElement;
  private readonly body: HTMLElement;
  private address: AppAddress | null = null;
  private instance: FoundInstance | null = null;
  private mounted: Mounted | null = null;
  /** The revision, the address and the branch (`undefined` outside a repository) the shell's input was last set for. */
  private shown: { key: string; revision: string; branch: string | null | undefined } | null = null;
  private title: string | null = null;
  private seq = 0;
  /** The pane's own ops, until each is answered. */
  private readonly ops = new Set<Promise<unknown>>();
  private resolving: Promise<void> | null = null;
  private resolveAgain = false;

  constructor(
    readonly element: HTMLElement,
    options: AppPaneOptions
  ) {
    this.options = options;
    render(
      element,
      html`<div class="app-pane-message" role="status" hidden></div><div class="app-pane-body"></div>`
    );
    this.message = element.querySelector<HTMLElement>('.app-pane-message')!;
    this.body = element.querySelector<HTMLElement>('.app-pane-body')!;
    this.message.addEventListener('click', (event) => {
      const button = (event.target as Element).closest('[data-action="show-files"]');
      if (button && this.instance) this.options.showFiles(this.instance);
    });
  }

  /** The instance shown, and its page's title; `null` when the pane shows nothing. */
  get current(): { manifestPath: string | null; title: string | null } | null {
    return this.address ? { manifestPath: this.address.manifestPath, title: this.title } : null;
  }

  /** The shell on screen, if one is. */
  get shell(): Shell | null {
    return this.mounted?.shell ?? null;
  }

  /** Open the page an address names, for the instance at it (`null`: none the page knows). */
  async open(address: AppAddress, instance: FoundInstance | null): Promise<void> {
    const seq = ++this.seq;
    const sameInstance =
      this.instance !== null &&
      instance !== null &&
      this.instance.manifestPath === instance.manifestPath;
    this.address = address;
    this.instance = instance;
    if (!sameInstance) this.shown = null;

    if (!instance) return this.showMessage(words.apps.noApp, null);
    if (!instance.valid) return this.showInvalid(instance);
    const app = Object.hasOwn(this.options.apps, instance.app)
      ? this.options.apps[instance.app]
      : undefined;
    if (!app) return this.showMessage(words.apps.unknownApp(instance.app), instance.label);

    if (this.mounted?.manifestPath !== instance.manifestPath) {
      this.unmount();
      this.showMessage(words.apps.loading, instance.label);
      try {
        await app.shell.load();
      } catch (error) {
        if (seq !== this.seq) return;
        console.error('surfaces: an app could not load', error);
        return this.showMessage(words.apps.loadFailed, instance.label);
      }
      if (seq !== this.seq) return;
      this.mount(instance.manifestPath, app);
    }
    await this.resolve();
  }

  /** Show nothing: the file pane is showing. */
  close(): void {
    this.seq += 1;
    this.address = null;
    this.instance = null;
    this.shown = null;
    this.unmount();
    this.setTitle(null);
    this.message.hidden = true;
  }

  /** The instances were read again: the open one may have changed, or gone. */
  instancesChanged(instances: readonly FoundInstance[]): void {
    const address = this.address;
    const was = this.instance;
    if (!address || address.manifestPath === null) return;
    const now =
      instances.find((instance) => instance.manifestPath === address.manifestPath) ?? null;
    const invalidAgain =
      now !== null &&
      !now.valid &&
      (now.unlocked !== was?.unlocked || now.errors.join('\n') !== was?.errors.join('\n'));
    if (
      now === null ||
      was === null ||
      now.valid !== was.valid ||
      now.app !== was.app ||
      invalidAgain
    ) {
      void this.open(address, now);
      return;
    }
    this.instance = now;
  }

  /** One of the host's events: read the page again when it may have moved. */
  hostEvent(event: HostEvent): void {
    const instance = this.instance;
    if (!instance?.valid || !this.mounted) return;
    if (event.type === 'changed' && !event.paths.some((path) => inRegion(instance, path))) return;
    void this.resolveSoon();
  }

  /** Read the page again once the pane's own ops are answered; one read at a time. */
  resolveSoon(): Promise<void> {
    if (this.resolving) {
      this.resolveAgain = true;
      return this.resolving;
    }
    this.resolving = (async () => {
      do {
        this.resolveAgain = false;
        while (this.ops.size > 0)
          await Promise.all([...this.ops].map((op) => op.catch(() => undefined)));
        await this.resolve();
      } while (this.resolveAgain);
    })().finally(() => (this.resolving = null));
    return this.resolving;
  }

  /**
   * Read the page again and give the shell what comes back, even at the revision
   * it last showed: an op's reply shows the shell only part of the page (a
   * board, not the strip beside it), so a shell that asks for its page again
   * has not seen the rest.
   */
  private showAgain(): Promise<void> {
    this.shown = null;
    return this.resolveSoon();
  }

  // ---- the page ----

  private async resolve(): Promise<void> {
    const address = this.address;
    const mounted = this.mounted;
    if (!address || address.manifestPath === null || !mounted) return;
    const seq = this.seq;
    const [answer, git] = await Promise.all([
      this.options.client.appPage(address.manifestPath, address.subPath, address.query),
      this.options.git().catch(() => null),
    ]);
    if (seq !== this.seq || this.mounted !== mounted) return;
    if (!answer.ok) {
      const message =
        answer.code === 'HOST_APP_PAGE_NOT_FOUND'
          ? words.apps.notFound
          : answer.code === 'HOST_APP_NOT_FOUND'
            ? words.apps.noApp
            : words.apps.readFailed(answer.message);
      this.shown = null;
      mounted.shell.hidden = true;
      return this.showMessage(message, this.instance?.label ?? null);
    }
    if ('redirect' in answer) {
      this.options.navigate(answer.redirect, 'replace');
      return;
    }
    const key = formatAddress(address);
    this.message.hidden = true;
    mounted.shell.hidden = false;
    this.setTitle(answer.title);
    const branch = git === null ? undefined : git.branch;
    if (
      this.shown?.key === key &&
      this.shown.revision === answer.revision &&
      this.shown.branch === branch
    ) {
      return;
    }
    this.shown = { key, revision: answer.revision, branch };
    const input: AppShellInput = {
      base: appBase(address.manifestPath),
      location: this.options.location(),
      view: answer.view,
      state: answer.state,
      ...(answer.extras ? { extras: answer.extras } : {}),
      checkin: {
        words: COMMIT_WORDS,
        ...(git === null ? {} : { branch: { current: git.branch, offerNew: true } }),
      },
    };
    mounted.shell.setState(input);
  }

  // ---- the shell ----

  private mount(manifestPath: string, app: ClientApp): void {
    const shell = document.createElement(app.shell.tag) as Shell;
    shell.classList.add('app-shell');
    const stop = new AbortController();
    const { signal } = stop;
    this.mounted = { manifestPath, app, shell, stop };
    const stopOps = answerOps<Record<string, { op: object; reply: object }>>(shell, (op) =>
      this.answer(op as Op)
    );
    signal.addEventListener('abort', stopOps);
    shell.addEventListener('navigate', (event) => this.onNavigate(event), { signal });
    shell.addEventListener(
      'open-card',
      (event) => {
        const path = (event as CustomEvent<{ path?: unknown }>).detail?.path;
        if (typeof path === 'string' && path !== '') {
          this.options.navigate(formatAddress({ view: 'preview', path }));
        }
      },
      { signal }
    );
    shell.addEventListener(
      'notification',
      (event) => {
        const detail = (event as CustomEvent<{ message?: unknown; type?: unknown }>).detail;
        if (typeof detail?.message !== 'string') return;
        const tone =
          typeof detail.type === 'string' && NOTICE_TONES.has(detail.type) ? detail.type : 'info';
        this.options.notify({ text: detail.message, tone: tone as Notice['tone'] });
      },
      { signal }
    );
    shell.addEventListener('reload-request', () => void this.showAgain(), { signal });
    shell.addEventListener(
      'open-options-menu',
      (event) => {
        const detail = (event as CustomEvent<{ items?: unknown; anchor?: unknown }>).detail;
        const asker = event.target;
        const anchor = detail?.anchor;
        if (!(anchor instanceof Element) || !(asker instanceof EventTarget)) return;
        this.options.openMenu({
          anchor,
          items: itemsOf(detail.items),
          choose: (itemId) =>
            asker.dispatchEvent(new CustomEvent('options-menu-select', { detail: { itemId } })),
        });
      },
      { signal }
    );
    this.body.replaceChildren(shell);
  }

  private unmount(): void {
    if (!this.mounted) return;
    this.mounted.stop.abort();
    this.mounted.shell.remove();
    this.mounted = null;
    this.shown = null;
  }

  private onNavigate(event: Event): void {
    const href = (event as CustomEvent<{ href?: unknown }>).detail?.href;
    if (typeof href !== 'string' || !href.startsWith('#/')) return;
    event.preventDefault();
    // To the page on screen (a close whose next phase is the one shown): the
    // address does not move, so the shell is shown its page again.
    if (this.address && href === formatAddress(this.address)) {
      void this.showAgain();
      return;
    }
    this.options.navigate(href);
  }

  private async answer(op: Op): Promise<Result<object>> {
    const mounted = this.mounted;
    const address = this.address;
    if (!mounted || !address || address.manifestPath === null) {
      return fail('HOST_APP_NOT_FOUND', words.apps.noApp);
    }
    const { client } = this.options;
    if (op.type === 'project') {
      const read = await client.appProject(address.manifestPath, op.view);
      return read.ok ? ok({ state: read.state }) : read;
    }
    if (op.type === 'refresh') {
      await this.options.refresh();
      return ok();
    }
    if (op.type === 'checkin') return this.checkin(op, mounted.app.meta.label);
    const pageOp = mounted.app.pageOps?.[op.type];
    if (pageOp) return pageOp(op);

    // The view goes with this op alone: read before the first wait.
    const view = mounted.shell.opView(op);
    const sending = client.appOp(address.manifestPath, op, view);
    this.ops.add(sending);
    let answer: Awaited<typeof sending>;
    try {
      answer = await sending;
    } finally {
      this.ops.delete(sending);
    }
    if (!answer.ok) return answer;
    // Written, but with no step: say it cannot be undone.
    if (answer.notice?.kind === 'cannot-undo') {
      this.options.notify({
        text: words.journal.opCannotUndo(answer.notice.reason),
        tone: 'warning',
      });
    }
    if (answer.revision !== undefined && this.mounted === mounted) {
      mounted.shell.learn(op, answer.reply);
      // What the reply showed is what the page now is.
      if (this.shown) this.shown = { ...this.shown, revision: answer.revision };
    }
    return ok(answer.reply);
  }

  /** An app's check-in: the page's commit of its paths, `done` with the notice's words, or the refusal. */
  private async checkin(raw: Op, label: string): Promise<Result<object>> {
    const op = checkinOpFrom(raw);
    if (!op) return fail('APP_OP_INVALID', 'A check-in names its files by path.');
    let made: Result<HostCommit>;
    try {
      made = await this.options.commit(commitRequestOf(op, words.apps.checkinTitle(label)));
    } catch (error) {
      made = fail('HOST_COMMIT_FAILED', String(error));
    }
    if (!made.ok) return made;
    return ok({ status: 'done', message: words.commit.notice(made.short, made.branch) });
  }

  // ---- what else the pane shows ----

  private showMessage(message: string, title: string | null): void {
    this.message.hidden = false;
    render(this.message, html`<p class="pane-message">${message}</p>`);
    if (this.mounted) this.mounted.shell.hidden = true;
    this.setTitle(title);
  }

  private showInvalid(instance: FoundInstance): void {
    this.unmount();
    this.message.hidden = false;
    render(
      this.message,
      html`<section class="app-invalid"><h2 class="app-invalid-title">${words.apps.invalidTitle(instance.label)}</h2><p>${words.apps.invalidIntro}</p><ul class="app-invalid-errors">${instance.errors.map(
        (error) => html`<li>${error}</li>`
      )}</ul><p>${words.apps.invalidHelp}</p>${
        instance.unlocked
          ? ''
          : html`<button type="button" class="button" data-action="show-files">${words.apps.showFiles}</button>`
      }</section>`
    );
    this.setTitle(instance.label);
  }

  private setTitle(title: string | null): void {
    if (title === this.title) return;
    this.title = title;
    this.options.onTitle(title);
  }
}
