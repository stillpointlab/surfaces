/// <reference lib="dom" />

import {
  createNotice,
  createRawView,
  createReadyGate,
  createViewState,
  defineElement,
  parseView,
  type RawView,
  type ReadyGate,
} from '@stillpointlab/common-format';

import { parseCsv, type CsvParseResult } from '../csv';
import { serializeSheetDocument } from '../document';
import {
  resolveSheetPresentation,
  snapshotSheetPresentation,
  type SheetContentOptions,
  type SheetPresentation,
} from '../presentation/presentation';
import { snapshotSuccessfulModel } from '../shared/model';
import { renderTable } from '../shared/render';
import { tableStyles } from '../shared/table.styles';

import type { ParsedSheetDocument } from '../document';
import type { PreviewElement } from '@stillpointlab/common-format';

/**
 * A read-only grid of one sheet. Implements PreviewElement and the raw view
 * convention: `view="raw"` shows the source, and CSV that does not parse shows its
 * source with the error until valid content arrives. A document given through
 * `setDocument` has no source text of its own, so its raw view is the document
 * serialised.
 */
export class SheetPreview extends HTMLElement implements PreviewElement {
  private readonly root: ShadowRoot;
  // Rendering is synchronous: settled whenever connected and rendered; in raw,
  // once the raw view (a lazy <code-preview> when registered) is ready.
  private readonly ready: ReadyGate = createReadyGate(this);
  private model: CsvParseResult = parseCsv('');
  private presentation: SheetPresentation = {};
  private readonly viewState = createViewState(this);
  private source = '';
  // True while showing raw only because the CSV does not parse.
  private fallback = false;
  private raw: RawView | null = null;

  static get observedAttributes(): string[] {
    return ['view'];
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  attributeChangedCallback(_name: string, _oldValue: string | null, newValue: string | null): void {
    if (this.viewState.reflecting) return;
    const view = parseView(newValue);
    // The grid cannot show CSV that does not parse; refuse and keep the source.
    if (view === 'rich' && !this.model.ok) {
      this.viewState.reflect();
      return;
    }
    this.fallback = false;
    this.viewState.commit(view, 'host');
    if (this.isConnected) this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  disconnectedCallback(): void {
    this.ready.begin();
  }

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  setContent(content: string, options: SheetContentOptions = {}): void {
    this.model = parseCsv(content);
    this.presentation = snapshotSheetPresentation(options.presentation);
    this.loaded(content);
  }

  setDocument(document: ParsedSheetDocument, options: SheetContentOptions = {}): void {
    this.model = snapshotSuccessfulModel(document.data);
    this.presentation = resolveSheetPresentation(document.presentation, options.presentation);
    this.loaded(
      serializeSheetDocument({
        format: document.format,
        rows: document.data.rows,
        presentation: document.presentation,
      })
    );
  }

  private loaded(source: string): void {
    this.source = source;
    if (!this.model.ok && this.viewState.current === 'rich') {
      this.fallback = true;
      this.viewState.commit('raw', 'fallback');
    } else if (this.model.ok && this.fallback) {
      // A preview's fallback is not sticky: nobody can fix the text here.
      this.fallback = false;
      this.viewState.commit('rich', 'fallback');
    }
    this.raw?.setValue(source);
    if (this.isConnected) this.render();
  }

  private render(): void {
    if (this.viewState.current === 'raw') {
      this.renderRaw();
      return;
    }
    this.raw = null;
    renderTable(this.root, this.model, {
      addressed: true,
      headerRow: false,
      label: 'Spreadsheet preview',
      emptyMessage: 'No sheet data.',
      presentation: this.presentation,
    });
    this.ready.settle();
  }

  private renderRaw(): void {
    const style = document.createElement('style');
    style.textContent = tableStyles;
    const surface = document.createElement('div');
    surface.className = 'sheet-surface sheet-surface--raw';
    if (!this.model.ok) {
      surface.append(
        createNotice({
          tone: 'error',
          title: 'This sheet could not be read; showing the raw text.',
          items: [this.model.error.message],
        })
      );
    }
    this.raw ??= createRawView({ value: this.source, label: 'Sheet source' });
    const body = document.createElement('div');
    body.className = 'sheet-surface__raw';
    body.append(this.raw.element);
    surface.append(body);
    this.root.replaceChildren(style, surface);
    const view = this.raw;
    const cycle = this.ready.begin();
    void view.whenReady().then(() => this.ready.settle(cycle));
  }
}

defineElement('sheet-preview', SheetPreview);
