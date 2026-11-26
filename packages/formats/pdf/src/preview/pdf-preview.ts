/// <reference lib="dom" />

import {
  createLazyLoader,
  createReadyGate,
  createStatus,
  defineElement,
  type ReadyGate,
  reportError,
  STATUS_MESSAGES,
} from '@stillpointlab/common-format';

import { failureOf, type PdfFailure } from './failure';
import { PackageFiles } from './files';
import { pageWorker, type PageWorker } from './page-worker';
import { PageColumn, type PageSource } from './pages';
import { previewStyles } from './preview.styles';

import type { UrlPreviewElement } from '@stillpointlab/common-format';
import type { PDFDocumentLoadingTask } from 'pdfjs-dist';

/**
 * What a host may ask of `<pdf-preview>`: the contract of every preview given a
 * URL, under this format's own name. Add here what is this format's alone (a
 * page to show) once a host asks for it, and not before.
 */
export interface PdfPreviewElement extends UrlPreviewElement {}

type PdfState = 'empty' | 'loading' | 'loaded' | 'failed';

/** What the element says in place of the pages, for each of the three failures. */
const FAILED: Record<PdfFailure, string> = {
  load: "Couldn't load this PDF.",
  read: "This file can't be read as a PDF.",
  password: "This PDF needs a password, and this preview can't ask for one yet.",
};

// pdf.js's document API, imported the first time a PDF opens and shared by every
// instance. A failed import is tried again by the next PDF.
const loadEngine = createLazyLoader(() => import('./engine'));

type Engine = Awaited<ReturnType<typeof loadEngine>>;

/** One source, from the moment it is set until it is let go. */
interface Opened {
  readonly src: string;
  task: PDFDocumentLoadingTask | null;
  column: PageColumn | null;
}

/**
 * Read-only view of the PDF at a URL the host gives it: its pages one under
 * another in a column that scrolls, each as wide as the element allows up to its
 * size at 100%, on a quiet ground, drawn by pdf.js in the page's one worker,
 * with its text laid over it to be selected, found and read aloud. The file's
 * name labels the whole; each page is labelled "Page 3 of 12", a group holding
 * its text, or a picture when it has none (a scan). The source and its name are
 * the `src` and `name` attributes, which `setSource` sets.
 *
 * Pages are drawn as they come near view (see `PageColumn`), at the screen's
 * pixel ratio within a bound on a canvas's size, and only those near view hold
 * their text. Ready is pending until the first page is drawn (not its text) or
 * the load has failed, and settles at once when there is nothing to show. A
 * failure is said in one of three sentences in place of the pages and reported
 * once; a page that cannot be drawn says so in its own place.
 *
 * A new source lets the old one go: its document is destroyed and its download
 * ended. Leaving the page's tree stops drawing and keeps the document, so put
 * back it draws again where it was.
 */
export class PdfPreview extends HTMLElement implements PdfPreviewElement {
  private readonly root: ShadowRoot;
  private readonly frame: HTMLDivElement;
  private readonly cover: HTMLDivElement;
  // Settled whenever connected with nothing left to load.
  private readonly ready: ReadyGate = createReadyGate(this);
  private state: PdfState = 'empty';
  private failure: PdfFailure = 'load';
  // The source shown or loading; null while there is none.
  private opened: Opened | null = null;

  static get observedAttributes(): string[] {
    return ['src', 'name'];
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = previewStyles;
    this.frame = document.createElement('div');
    this.frame.className = 'pdf-preview';
    this.frame.setAttribute('part', 'container');
    this.cover = document.createElement('div');
    this.cover.className = 'pdf-preview__loading';
    this.cover.append(createStatus('loading', STATUS_MESSAGES.loading));
    this.root.append(style, this.frame);
  }

  connectedCallback(): void {
    this.update();
  }

  disconnectedCallback(): void {
    this.ready.begin();
    // Out of the page it stops drawing; a move, out and back in one task, does not.
    const opened = this.opened;
    queueMicrotask(() => {
      if (!this.isConnected) opened?.column?.stop();
    });
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    // A new name for the same source relabels it; nothing reloads.
    if (name === 'name') this.label();
    else if (this.isConnected) this.update();
  }

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  setSource(src: string, name?: string): void {
    if (name !== undefined) this.setAttribute('name', name);
    if (src) this.setAttribute('src', src);
    else this.removeAttribute('src');
  }

  private get src(): string {
    return this.getAttribute('src')?.trim() ?? '';
  }

  private get sourceName(): string {
    return this.getAttribute('name') ?? '';
  }

  /** Show the current source: a new document for a new one, the same one on a reconnect. */
  private update(): void {
    const src = this.src;
    if (src !== (this.opened?.src ?? '')) {
      this.letGo();
      this.opened = src ? { src, task: null, column: null } : null;
      this.state = src ? 'loading' : 'empty';
      if (this.opened) void this.load(this.opened);
    }
    this.opened?.column?.start();
    this.render();
    // A reconnect keeps a document that has drawn or failed, so it settles at once.
    if (this.state === 'loading') this.ready.begin();
    else this.ready.settle();
  }

  /** Open `opened`'s PDF, lay out its pages, and settle once one is drawn. */
  private async load(opened: Opened): Promise<void> {
    const live = () => this.opened === opened;
    let engine: Engine;
    let worker: PageWorker;
    try {
      engine = await loadEngine();
      if (!live()) return;
      worker = pageWorker();
    } catch {
      // pdf.js or its worker did not arrive (or there is no `Worker` here).
      if (live()) this.failWith('load');
      return;
    }
    const task = engine.openPdf(opened.src, worker.worker, PackageFiles);
    opened.task = task;
    let pages: PageSource[];
    try {
      const doc = await Promise.race([task.promise, worker.failed]);
      if (!live()) return;
      // Every page's size before any is drawn, so each has its place from the start.
      const read = await Promise.allSettled(
        Array.from({ length: doc.numPages }, (_, at) => doc.getPage(at + 1))
      );
      pages = read.map((got) =>
        got.status === 'fulfilled' ? { page: got.value } : { failed: true as const }
      );
    } catch (error) {
      if (live()) this.failWith(failureOf(error));
      return;
    }
    if (!live()) return;
    const column = new PageColumn(pages, engine.TextLayer);
    opened.column = column;
    this.render();
    if (this.isConnected) column.start();
    await column.firstDrawn();
    if (live() && this.state === 'loading') this.settle('loaded');
  }

  /** Let the source go: its document destroyed, its download ended, its canvases given back. */
  private letGo(): void {
    const opened = this.opened;
    if (!opened) return;
    opened.column?.destroy();
    opened.column = null;
    // A task whose worker never started never finishes setting up; nothing waits on it.
    void opened.task?.destroy().catch(() => undefined);
    opened.task = null;
  }

  private failWith(failure: PdfFailure): void {
    this.failure = failure;
    this.settle('failed');
  }

  private settle(state: 'loaded' | 'failed'): void {
    this.state = state;
    if (state === 'failed') {
      reportError('PDF preview failed to load', { src: this.opened?.src ?? '' });
      // Nothing of it is shown, so the document goes now; the source stays, and its words.
      this.letGo();
    }
    this.render();
    // Drawn while detached: the reconnect settles it.
    if (this.isConnected) this.ready.settle();
  }

  /** The whole is labelled with the file's name while there is a source. */
  private label(): void {
    const name = this.sourceName;
    if (this.opened && name) {
      this.frame.setAttribute('role', 'group');
      this.frame.setAttribute('aria-label', name);
    } else {
      this.frame.removeAttribute('role');
      this.frame.removeAttribute('aria-label');
    }
  }

  /**
   * The empty words, the failed words, or the pages: under a loading cover until
   * one is drawn, and the loading words alone until they are laid out.
   */
  private render(): void {
    this.label();
    const column = this.opened?.column ?? null;
    if (!this.opened) this.show(createStatus('empty', 'No PDF selected.'));
    else if (this.state === 'failed') this.show(createStatus('error', FAILED[this.failure]));
    else if (!column) this.show(this.cover);
    else if (this.state === 'loading') this.show(column.element, this.cover);
    else this.show(column.element);
  }

  /**
   * Make the frame's children `nodes`, changing only what differs: the column
   * stays where it is from loading to loaded, so its scroll is kept.
   */
  private show(...nodes: Node[]): void {
    for (const child of [...this.frame.childNodes]) {
      if (!nodes.includes(child)) child.remove();
    }
    nodes.forEach((node, at) => {
      const there = this.frame.childNodes[at] ?? null;
      if (there !== node) this.frame.insertBefore(node, there);
    });
  }
}

defineElement('pdf-preview', PdfPreview);
