// The pane: one file at a time, in its format's preview or editor. It owns what
// is open (the session), the header (the path, the Preview / Edit switch, Save and
// the unsaved mark), the banner for a file that changed on disk under unsaved
// edits, and every read and write for the open file. The page decides what to
// open (the tree, the address) and asks before edits are lost; the pane does the
// rest.
//
// Opening is coalesced: one open runs at a time, and while it runs only the
// newest request waits, so holding an arrow key in the tree reads two files, not
// one per row. Every step of an open checks it is still the newest after each
// await, so a late answer for a file no longer wanted never lands.
//
// The explorer's own renames and deletes go through `followWrite`: the open file
// follows a rename (keeping its element and its edits) or closes on a delete, and
// a change event for the write, which may arrive before the write's answer, waits
// until it has, so the page's own write raises no banner.
//
// The Changes view (`diff`) shows a file against the last commit in `<code-diff>`:
// the text at `HEAD` on the left (a moved file's, under its old path), the file
// on the right. It is offered for a `changed` or `moved` file (`statusOf`, which
// the page answers only in a repository) whose format takes text; an image has no
// text to compare. The switch comes and goes with the status, and never touches
// the element or its edits; a Changes view whose file is no longer changed asks
// for the preview.

import { languageFromPath } from '@stillpointlab/code-format/format';
import { fileNameOf } from '@stillpointlab/common-format/format';
import { html, render } from '@stillpointlab/common-format/html';

import { cannotOpen, words } from './words';

import type { View } from './address';
import type { Confirm } from './confirm';
import type { HostClient } from './host-client';
import type { DiffElement, EditorElement } from '@stillpointlab/common-format';
import type { FormatDescriptor, FormatRegistry } from '@stillpointlab/common-format/format';
import type { FileStatus, PortChange } from '@stillpointlab/common-format/host';

/** What the pane shows, for the page: the address, the title, leaving guards. */
export interface PaneState {
  path: string;
  /** The view shown, which is the preview when the format has no editor. */
  view: View;
  /** The editor holds edits that are not on disk. */
  dirty: boolean;
}

export interface PaneOptions {
  client: HostClient;
  registry: FormatRegistry;
  confirm: Confirm;
  /** What must happen before a format's element mounts (md's sanitizing renderer). */
  prepare?: (format: FormatDescriptor) => Promise<void>;
  /**
   * The person asked for another view of the open file, with the switch; or the
   * pane did (`replace`), when the Changes view's file stopped being changed.
   */
  onViewRequest?: (view: View, how?: 'push' | 'replace') => void;
  /** A file's status against the last commit; only `changed` and `moved` offer Changes. */
  statusOf?: (path: string) => FileStatus | undefined;
  /** The element the Changes view mounts: `<code-diff>` by default. */
  diff?: { tag: string; load(): Promise<unknown> };
  /** What is shown changed: another file or view, the unsaved mark, or nothing. */
  onState?: (state: PaneState | null) => void;
}

type Banner = { kind: 'changed'; version: string | null } | { kind: 'deleted' };

type PutResult = Awaited<ReturnType<HostClient['put']>>;

/** What is open. With no element the pane shows a message for the path instead. */
interface Session {
  path: string;
  view: View;
  format: FormatDescriptor | null;
  element: HTMLElement | null;
  /** The version the file was opened or last saved at, for a text format. */
  version: string | null;
  /** The text at that version. */
  text: string | null;
  /** In the Changes view, the text at `HEAD`. */
  base?: string;
  dirty: boolean;
  banner: Banner | null;
  saveError: string | null;
  listeners: AbortController;
}

interface OpenRequest {
  seq: number;
  path: string;
  view: View;
  focus: boolean;
}

/** Refusals that mean the path has no file to show, for a format that takes a URL. */
const GONE = new Set(['HOST_FILE_NOT_FOUND', 'HOST_PATH_OUTSIDE_ROOT']);

const CODE_DIFF = { tag: 'code-diff', load: () => import('@stillpointlab/code-format/diff') };

/** The views the switch offers, in its order, and their words. */
const VIEWS: readonly View[] = ['preview', 'edit', 'diff'];
const VIEW_WORDS: Record<View, string> = {
  preview: words.preview,
  edit: words.edit,
  diff: words.changes,
};

export class FilePane {
  private readonly options: PaneOptions;
  private readonly header: HTMLElement;
  private readonly pathText: HTMLElement;
  private readonly unsavedMark: HTMLElement;
  private readonly views: HTMLElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly banner: HTMLElement;
  private readonly bannerText: HTMLElement;
  private readonly reloadButton: HTMLButtonElement;
  private readonly error: HTMLElement;
  private readonly body: HTMLElement;

  private session: Session | null = null;
  private latest = 0;
  private pending: OpenRequest | null = null;
  private loading: OpenRequest | null = null;
  private running: Promise<void> | null = null;
  private saving: Promise<unknown> | null = null;
  /** The page's own moves and deletes, until the open file has followed each. */
  private readonly writes = new Set<Promise<void>>();
  private checking = false;
  private recheck = false;
  /** The views the switch has buttons for now, so it is drawn again only when they change. */
  private switchViews = '';

  constructor(container: HTMLElement, options: PaneOptions) {
    this.options = options;
    render(
      container,
      html`<header class="pane-header" hidden><span class="pane-path" dir="auto"></span><span class="pane-unsaved" role="img" aria-label="${words.unsaved}" title="${words.unsaved}" hidden>●</span><span class="pane-views" role="group" aria-label="View" hidden></span><button type="button" class="button button-primary pane-save" hidden disabled>${words.save}</button></header><div class="pane-banner" role="alert" hidden><span class="pane-banner-text"></span><button type="button" class="button pane-reload">${words.banner.reload}</button></div><p class="pane-error" role="alert" hidden></p><div class="pane-body"></div>`
    );
    const find = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
    this.header = find('.pane-header');
    this.pathText = find('.pane-path');
    this.unsavedMark = find('.pane-unsaved');
    this.views = find('.pane-views');
    this.saveButton = find('.pane-save');
    this.banner = find('.pane-banner');
    this.bannerText = find('.pane-banner-text');
    this.reloadButton = find('.pane-reload');
    this.error = find('.pane-error');
    this.body = find('.pane-body');

    this.views.addEventListener('click', (event) => {
      const view = (event.target as Element).closest<HTMLElement>('[data-view]')?.dataset.view;
      const known = VIEWS.find((v) => v === view);
      if (known && known !== this.session?.view) this.options.onViewRequest?.(known);
    });
    this.saveButton.addEventListener('click', () => void this.save());
    this.reloadButton.addEventListener('click', () => void this.reload());
    this.showNothing();
  }

  /** What is shown, or `null` when nothing is open. */
  get current(): PaneState | null {
    const s = this.session;
    return s ? { path: s.path, view: s.view, dirty: s.dirty } : null;
  }

  /** An open is running: what is shown is about to change. */
  get busy(): boolean {
    return this.running !== null;
  }

  /**
   * The view a path would open in, asked for `view`: the preview when its format
   * has no editor, or when it has no changes to show.
   */
  viewFor(path: string, view: View): View {
    if (view === 'diff') return this.canDiff(path) ? 'diff' : 'preview';
    const format = this.formatOf(path);
    return view === 'edit' && format?.editor ? 'edit' : 'preview';
  }

  /** Whether the Changes view is offered for `path`: changed or moved, in a format that takes text. */
  canDiff(path: string): boolean {
    const status = this.options.statusOf?.(path);
    return (status === 'changed' || status === 'moved') && this.formatOf(path)?.needs === 'text';
  }

  /**
   * The statuses changed. The switch follows; a Changes view whose file is no
   * longer changed asks for the preview, and after `HEAD` may have moved (`head`)
   * one that still is reads its two sides again.
   */
  statusChanged(options: { head?: boolean } = {}): void {
    const s = this.session;
    if (!s) return;
    if (s.view === 'diff' && !this.canDiff(s.path)) {
      if (!this.busy) this.options.onViewRequest?.('preview', 'replace');
      return;
    }
    this.renderChrome();
    if (options.head && s.view === 'diff' && s.element) void this.refreshDiff(s);
  }

  private formatOf(path: string): FormatDescriptor | null {
    return this.options.registry.find(path) ?? this.options.registry.fallback;
  }

  /**
   * Open `path` in `view` (the preview when its format has no editor). The page
   * has asked about unsaved edits already. Resolves once this request, or a newer
   * one that replaced it, has settled.
   */
  open(
    path: string,
    view: View,
    options: { force?: boolean; focus?: boolean } = {}
  ): Promise<void> {
    const s = this.session;
    const newest = this.pending ?? this.loading;
    if (!options.force) {
      if (newest) {
        if (newest.path === path && newest.view === view) return this.running ?? Promise.resolve();
      } else if (s && s.path === path && s.view === this.viewFor(path, view)) {
        return Promise.resolve();
      }
    }
    this.pending = { seq: ++this.latest, path, view, focus: options.focus ?? false };
    this.running ??= this.drain();
    return this.running;
  }

  /** Show nothing open. */
  close(): void {
    this.latest += 1;
    this.pending = null;
    this.showNothing();
  }

  /** Ask before the unsaved edits are lost; true when there are none. */
  async confirmLeave(): Promise<boolean> {
    const s = this.session;
    if (!s?.dirty) return true;
    return this.options.confirm(words.discard(fileNameOf(s.path)));
  }

  /** Save the editor's content: Save, Ctrl+S or Cmd+S. */
  async save(): Promise<void> {
    const s = this.session;
    if (!s?.element || s.view !== 'edit' || this.saving) return;
    if (!s.dirty && !s.banner) return;
    const banner = s.banner;
    if (banner?.kind === 'changed' && !(await this.options.confirm(words.saveOver))) return;
    if (banner?.kind === 'deleted' && !(await this.options.confirm(words.saveDeleted))) return;
    if (this.session !== s || this.saving) return;

    const editor = s.element as EditorElement;
    const content = editor.getContent();
    const change: PortChange =
      banner?.kind === 'deleted'
        ? { kind: 'create', path: s.path, content }
        : {
            kind: 'write',
            path: s.path,
            content,
            base: (banner?.kind === 'changed' ? banner.version : s.version) ?? undefined,
          };
    const saving = this.options.client.put([change]);
    this.saving = saving;
    this.saveButton.disabled = true;
    let result: Awaited<typeof saving>;
    try {
      result = await saving;
    } finally {
      this.saving = null;
    }
    if (this.session !== s) return;
    if (result.ok) {
      s.version = result.versions[s.path] ?? null;
      s.text = content;
      s.banner = null;
      s.saveError = null;
      s.dirty = editor.getContent() !== content;
    } else if (result.code === 'HOST_FILE_CHANGED' || result.code === 'HOST_PATH_EXISTS') {
      // The server's own check: the banner shows whether or not an event came.
      await this.learnDisk(s);
    } else if (result.code === 'HOST_FILE_NOT_FOUND') {
      s.banner = { kind: 'deleted' };
    } else {
      s.saveError = words.saveFailed(result.message);
    }
    if (this.session === s) this.renderChrome();
  }

  /**
   * Files changed on disk. When one is the open file, read it again and compare
   * versions, so the page's own save raises nothing.
   */
  async fileChanged(paths: readonly string[]): Promise<void> {
    const s = this.session;
    if (!s || !paths.includes(s.path)) return;
    if (this.checking) {
      this.recheck = true;
      return;
    }
    this.checking = true;
    try {
      do {
        this.recheck = false;
        // A save's own change is compared with the version it answers, and a
        // move's or a delete's waits until the open file has followed it.
        while (this.saving || this.writes.size > 0) {
          await this.saving?.catch(() => undefined);
          await Promise.all(this.writes);
        }
        if (this.session !== s) return;
        await this.check(s);
      } while (this.recheck && this.session === s);
    } finally {
      this.checking = false;
    }
  }

  /** The version the open file was read or saved at, when `path` is the open file. */
  versionOf(path: string): string | null {
    return this.session?.path === path ? this.session.version : null;
  }

  /**
   * The page's own write that moves or deletes files. Once it lands, the open
   * file follows it: `where` answers where the open path went, `null` when it was
   * deleted, or `undefined` when the write left it alone. Answers the write's
   * result.
   */
  followWrite(
    write: Promise<PutResult>,
    where: (path: string) => string | null | undefined
  ): Promise<PutResult> {
    const landed = write.then((result) => {
      if (result.ok) this.follow(where);
      return result;
    });
    const tracked: Promise<void> = landed.then(
      () => void this.writes.delete(tracked),
      () => void this.writes.delete(tracked)
    );
    this.writes.add(tracked);
    return landed;
  }

  /** Move the open file to where the write put it, or close it if the write deleted it. */
  private follow(where: (path: string) => string | null | undefined): void {
    const s = this.session;
    if (!s) return;
    const to = where(s.path);
    if (to === undefined) return;
    if (to === null) {
      this.close();
      return;
    }
    // A move keeps the bytes, so the version the session holds is still the file's.
    s.path = to;
    if (s.view === 'diff') {
      // Both sides are read again: the left is now found under the old path.
      void this.open(to, 'diff', { force: true });
      this.renderChrome();
      return;
    }
    const { registry } = this.options;
    const format = registry.find(to) ?? registry.fallback;
    if (s.element && s.format && s.format === format) {
      // The same format: the element stays. With no edits it is handed the new
      // path, which a format may read (code's language, an image's URL).
      if (!s.dirty) this.apply(s.format, s.element, to, s.text);
    } else if (!s.dirty) {
      // Another format, or a message: open the file again where it is now.
      void this.open(to, s.view, { force: true });
    }
    // With edits under another format, the element and its edits stay until the
    // file is opened again; saving writes to the new path.
    this.renderChrome();
  }

  // ---- opening ----

  private stale(request: OpenRequest): boolean {
    return request.seq !== this.latest;
  }

  private async drain(): Promise<void> {
    this.body.setAttribute('aria-busy', 'true');
    try {
      while (this.pending) {
        const request = this.pending;
        this.pending = null;
        this.loading = request;
        try {
          await this.load(request);
        } catch (error) {
          if (!this.stale(request)) this.showMessage(request.path, request.view, String(error));
        }
      }
    } finally {
      this.loading = null;
      this.running = null;
      this.body.removeAttribute('aria-busy');
    }
  }

  private async load(request: OpenRequest): Promise<void> {
    if (request.view === 'diff') return this.loadDiff(request);
    const { client, registry } = this.options;
    const { path } = request;
    const matched = registry.find(path);
    let format = matched;
    let text: string | null = null;
    let version: string | null = null;
    // A format that takes a URL loads the file itself, and says so if it cannot.
    if (matched?.needs !== 'url') {
      const got = await client.get(path);
      if (this.stale(request)) return;
      if (!got.ok) {
        const message =
          got.code === 'HOST_NOT_TEXT'
            ? matched
              ? words.formatNotText
              : words.cannotOpen.notText
            : cannotOpen(got.code, got.message);
        return this.showMessage(path, request.view, message);
      }
      format ??= registry.fallback;
      text = got.text;
      version = got.version;
    }
    if (!format) return this.showMessage(path, request.view, words.cannotOpen.notText);

    const view: View = request.view === 'edit' && format.editor ? 'edit' : 'preview';
    const entry = view === 'edit' ? format.editor! : format.preview;
    try {
      await this.options.prepare?.(format);
      await entry.load();
    } catch (error) {
      if (this.stale(request)) return;
      console.error('surfaces: a format could not load', error);
      return this.showMessage(path, view, words.loadFailed);
    }
    if (this.stale(request)) return;

    const element = document.createElement(entry.tag);
    this.begin({
      path,
      view,
      format,
      element,
      version,
      text,
      dirty: false,
      banner: null,
      saveError: null,
      listeners: new AbortController(),
    });
    this.apply(format, element, path, text);
    if (request.focus && view === 'edit') {
      const editor = element as EditorElement;
      void editor.whenReady?.().then(() => {
        if (this.session?.element === element) editor.focus();
      });
    }
  }

  /** The Changes view: the file and its text at `HEAD`, side by side. */
  private async loadDiff(request: OpenRequest): Promise<void> {
    const { client } = this.options;
    const { path } = request;
    const format = this.formatOf(path);
    const [got, base] = await Promise.all([client.get(path), client.base(path)]);
    if (this.stale(request)) return;
    if (!got.ok) {
      const message =
        got.code === 'HOST_NOT_TEXT' ? words.formatNotText : cannotOpen(got.code, got.message);
      return this.showMessage(path, 'diff', message, format);
    }
    if (!base.ok) return this.showMessage(path, 'diff', diffMessage(base), format);
    const diff = this.options.diff ?? CODE_DIFF;
    try {
      await diff.load();
    } catch (error) {
      if (this.stale(request)) return;
      console.error('surfaces: the diff could not load', error);
      return this.showMessage(path, 'diff', words.loadFailed, format);
    }
    if (this.stale(request)) return;
    const element = document.createElement(diff.tag);
    this.begin({
      path,
      view: 'diff',
      format,
      element,
      version: got.version,
      text: got.text,
      base: base.text,
      dirty: false,
      banner: null,
      saveError: null,
      listeners: new AbortController(),
    });
    this.applyDiff(element, path, base.text, got.text);
  }

  private applyDiff(element: HTMLElement, path: string, left: string, right: string): void {
    const language = languageFromPath(path);
    if (language) element.setAttribute('language', language);
    else element.removeAttribute('language');
    (element as HTMLElement & DiffElement).setContents({ left, right });
  }

  /** The Changes view's two sides, read again; drawn again only when one differs. */
  private async refreshDiff(s: Session): Promise<void> {
    const { client } = this.options;
    const [got, base] = await Promise.all([client.get(s.path), client.base(s.path)]);
    if (this.session !== s || !s.element) return;
    if (!got.ok || !base.ok) {
      // Gone, or no longer comparable: opening again says which.
      await this.open(s.path, 'diff', { force: true });
      return;
    }
    if (got.text === s.text && base.text === s.base) return;
    Object.assign(s, { version: got.version, text: got.text, base: base.text });
    this.applyDiff(s.element, s.path, base.text, got.text);
  }

  /** Hand the element its content: the text, or a URL the element loads. */
  private apply(
    format: FormatDescriptor,
    element: HTMLElement,
    path: string,
    text: string | null
  ): void {
    format.apply(
      element,
      format.needs === 'url'
        ? { path, url: this.options.client.urlFor(path) }
        : { path, text: text ?? '' }
    );
  }

  /** Make `session` what is open, in place of whatever was. */
  private begin(session: Session): void {
    this.session?.listeners.abort();
    this.session = session;
    if (session.element) {
      this.body.replaceChildren(session.element);
      if (session.view === 'edit') {
        session.element.addEventListener(
          'content-change',
          (event) => {
            const content = (event as CustomEvent<{ content?: unknown }>).detail?.content;
            const dirty = typeof content === 'string' ? content !== session.text : true;
            if (dirty !== session.dirty) {
              session.dirty = dirty;
              this.renderChrome();
            }
          },
          { signal: session.listeners.signal }
        );
      }
    }
    this.renderChrome();
  }

  private showMessage(
    path: string,
    view: View,
    message: string,
    format: FormatDescriptor | null = null
  ): void {
    this.begin({
      path,
      view,
      format,
      element: null,
      version: null,
      text: null,
      dirty: false,
      banner: null,
      saveError: null,
      listeners: new AbortController(),
    });
    render(this.body, html`<p class="pane-message">${message}</p>`);
  }

  private showNothing(): void {
    this.session?.listeners.abort();
    this.session = null;
    render(this.body, html`<p class="pane-message">${words.nothingOpen}</p>`);
    this.renderChrome();
  }

  // ---- a change on disk ----

  private async check(s: Session): Promise<void> {
    // A message in place of the file (it went, or could not be read): try again.
    if (!s.element || !s.format) {
      await this.open(s.path, s.view, { force: true });
      return;
    }
    if (s.view === 'diff') {
      await this.refreshDiff(s);
      return;
    }
    const got = await this.options.client.get(s.path);
    if (this.session !== s) return;

    if (s.format.needs === 'url') {
      if (!got.ok && GONE.has(got.code)) {
        this.showMessage(s.path, s.view, words.deletedOnDisk);
        return;
      }
      // A new element, so the image is loaded again rather than kept.
      const element = document.createElement(s.element.localName);
      this.begin({ ...s, element, listeners: new AbortController() });
      this.apply(s.format, element, s.path, null);
      return;
    }

    if (got.ok) {
      if (got.version === s.version) {
        if (s.banner) {
          s.banner = null;
          this.renderChrome();
        }
        return;
      }
      const editor = s.element as Partial<EditorElement>;
      if (s.dirty && editor.getContent?.() === got.text) {
        // The disk now holds exactly the edits: nothing is unsaved any more.
        Object.assign(s, { version: got.version, text: got.text, dirty: false, banner: null });
      } else if (s.dirty) {
        s.banner = { kind: 'changed', version: got.version };
      } else {
        Object.assign(s, { version: got.version, text: got.text, banner: null });
        this.apply(s.format, s.element, s.path, got.text);
      }
    } else if (s.dirty) {
      s.banner =
        got.code === 'HOST_FILE_NOT_FOUND'
          ? { kind: 'deleted' }
          : { kind: 'changed', version: null };
    } else {
      const message =
        got.code === 'HOST_FILE_NOT_FOUND'
          ? words.deletedOnDisk
          : got.code === 'HOST_NOT_TEXT'
            ? words.formatNotText
            : cannotOpen(got.code, got.message);
      this.showMessage(s.path, s.view, message);
      return;
    }
    this.renderChrome();
  }

  /** After a save the server refused as stale: what is on disk now, for the banner. */
  private async learnDisk(s: Session): Promise<void> {
    const got = await this.options.client.get(s.path);
    if (this.session !== s) return;
    if (got.ok) s.banner = { kind: 'changed', version: got.version };
    else if (got.code === 'HOST_FILE_NOT_FOUND') s.banner = { kind: 'deleted' };
    else s.banner = { kind: 'changed', version: null };
  }

  /** The banner's Reload: the file from disk, over the unsaved edits, once asked. */
  private async reload(): Promise<void> {
    const s = this.session;
    if (!s?.element || !s.format || s.banner?.kind !== 'changed') return;
    if (!(await this.options.confirm(words.reload))) return;
    if (this.session !== s) return;
    const got = await this.options.client.get(s.path);
    if (this.session !== s) return;
    if (got.ok) {
      Object.assign(s, {
        version: got.version,
        text: got.text,
        dirty: false,
        banner: null,
        saveError: null,
      });
      this.apply(s.format, s.element, s.path, got.text);
    } else if (got.code === 'HOST_FILE_NOT_FOUND') {
      s.banner = { kind: 'deleted' };
    } else {
      this.showMessage(s.path, s.view, cannotOpen(got.code, got.message));
      return;
    }
    this.renderChrome();
  }

  // ---- the header and the banner ----

  private renderChrome(): void {
    const s = this.session;
    this.header.hidden = s === null;
    this.pathText.textContent = s?.path ?? '';
    this.pathText.title = s?.path ?? '';
    this.unsavedMark.hidden = !s?.dirty;

    // Preview always; Edit where the format has an editor; Changes where there are
    // changes to show. A Changes view showing a message keeps its switch, so the
    // way back is there.
    const shown = Boolean(s?.element) || s?.view === 'diff';
    const offered = VIEWS.filter((view) =>
      view === 'preview'
        ? shown
        : view === 'edit'
          ? shown && Boolean(s?.format?.editor)
          : shown && (s?.view === 'diff' || (s !== null && this.canDiff(s.path)))
    );
    this.views.hidden = offered.length < 2;
    if (offered.join() !== this.switchViews) {
      this.switchViews = offered.join();
      render(
        this.views,
        html`${offered.map(
          (view) =>
            html`<button type="button" class="button" data-view="${view}" aria-pressed="false">${VIEW_WORDS[view]}</button>`
        )}`
      );
    }
    for (const button of this.views.querySelectorAll<HTMLElement>('[data-view]')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === s?.view));
    }
    const editing = Boolean(s?.element && s.view === 'edit');
    this.saveButton.hidden = !editing;
    this.saveButton.disabled = !editing || this.saving !== null || !(s?.dirty || s?.banner);

    const banner = s?.banner ?? null;
    this.banner.hidden = banner === null;
    this.bannerText.textContent = banner ? words.banner[banner.kind] : '';
    this.reloadButton.hidden = banner?.kind !== 'changed';
    this.error.hidden = !s?.saveError;
    this.error.textContent = s?.saveError ?? '';

    this.options.onState?.(this.current);
  }
}

/** What the Changes view says when the last commit's side cannot be read. */
function diffMessage(refusal: { code: string; message: string }): string {
  switch (refusal.code) {
    case 'HOST_FILE_NOT_FOUND':
      return words.diff.notInHead;
    case 'HOST_NOT_TEXT':
      return words.diff.HOST_NOT_TEXT;
    case 'HOST_FILE_TOO_LARGE':
      return words.diff.HOST_FILE_TOO_LARGE;
    default:
      return words.diff.failed(refusal.message);
  }
}
