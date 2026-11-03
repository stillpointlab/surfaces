/// <reference lib="dom" />

import { createReadyGate, defineElement, type ReadyGate } from '@stillpointlab/common-format';

import { parseCsv, type CsvParseResult } from '../csv';
import {
  resolveSheetPresentation,
  snapshotSheetPresentation,
  type SheetContentOptions,
  type SheetPresentation,
} from '../presentation/presentation';
import { snapshotSuccessfulModel } from '../shared/model';
import { renderTable } from '../shared/render';

import type { ParsedSheetDocument } from '../document';
import type { PreviewElement } from '@stillpointlab/common-format';

export class SheetPreview extends HTMLElement implements PreviewElement {
  private readonly root: ShadowRoot;
  // Rendering is synchronous: settled whenever connected and rendered.
  private readonly ready: ReadyGate = createReadyGate(this);
  private model: CsvParseResult = parseCsv('');
  private presentation: SheetPresentation = {};

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
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
    if (this.isConnected) this.render();
  }

  setDocument(document: ParsedSheetDocument, options: SheetContentOptions = {}): void {
    this.model = snapshotSuccessfulModel(document.data);
    this.presentation = resolveSheetPresentation(document.presentation, options.presentation);
    if (this.isConnected) this.render();
  }

  private render(): void {
    renderTable(this.root, this.model, {
      addressed: true,
      headerRow: false,
      label: 'Spreadsheet preview',
      emptyMessage: 'No sheet data.',
      presentation: this.presentation,
    });
    this.ready.settle();
  }
}

defineElement('sheet-preview', SheetPreview);
