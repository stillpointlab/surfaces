/// <reference lib="dom" />
import './md-icon';

import {
  createLazyLoader,
  createNotice,
  createRawSource,
  createReadyGate,
  createStatus,
  createSwitch,
  createViewState,
  defineElement,
  hydrate,
  isReadonly,
  moveToolbarFocus,
  parseView,
  RAW_VIEW_LABEL,
  type RawSource,
  type ReadyGate,
  reflectReadonly,
  reportError,
  STATUS_MESSAGES,
  type SurfaceView,
  type ViewChangeReason,
} from '@stillpointlab/common-format';

import { editorStyles } from './editor.styles';
import { ProseMirrorToolbar } from './prosemirror-toolbar';
import { getEditorPlugins } from './registry';

import type { frontmatterViewPlugin } from './frontmatter-view';
import type { EditorElement } from '@stillpointlab/common-format';
import type { baseKeymap, lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import type { history, redo, undo } from 'prosemirror-history';
import type { keymap } from 'prosemirror-keymap';
import type { MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown';
import type {
  DOMParser,
  MarkType,
  NodeType,
  Node as ProseMirrorNode,
  Schema,
} from 'prosemirror-model';
import type {
  liftListItem,
  sinkListItem,
  splitListItem,
  wrapInList,
} from 'prosemirror-schema-list';
import type { EditorState, Selection, TextSelection, Transaction } from 'prosemirror-state';
import type {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  goToNextCell,
  isInTable,
  tableEditing,
} from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';

interface EditorModules {
  EditorView: typeof EditorView;
  EditorState: typeof EditorState;
  DOMParser: typeof DOMParser;
  baseKeymap: typeof baseKeymap;
  toggleMark: typeof toggleMark;
  setBlockType: typeof setBlockType;
  wrapIn: typeof wrapIn;
  lift: typeof lift;
  keymap: typeof keymap;
  history: typeof history;
  undo: typeof undo;
  redo: typeof redo;
  splitListItem: typeof splitListItem;
  liftListItem: typeof liftListItem;
  sinkListItem: typeof sinkListItem;
  wrapInList: typeof wrapInList;
  tableEditing: typeof tableEditing;
  addRowBefore: typeof addRowBefore;
  addRowAfter: typeof addRowAfter;
  addColumnBefore: typeof addColumnBefore;
  addColumnAfter: typeof addColumnAfter;
  deleteRow: typeof deleteRow;
  deleteColumn: typeof deleteColumn;
  deleteTable: typeof deleteTable;
  goToNextCell: typeof goToNextCell;
  isInTable: typeof isInTable;
  TextSelection: typeof TextSelection;
  schema: Schema;
  markdownSerializer: MarkdownSerializer;
  markdownParser: MarkdownParser;
  createExtendedKeymap: any;
  createInputRules: any;
  inputRules: any;
  frontmatterViewPlugin: typeof frontmatterViewPlugin;
}

// The engine's modules: imported on first connect and shared by every instance.
const loadEngine = createLazyLoader(async (): Promise<EditorModules> => {
  const modules = await Promise.all([
    import('prosemirror-view'),
    import('prosemirror-state'),
    import('prosemirror-model'),
    import('prosemirror-commands'),
    import('prosemirror-keymap'),
    import('prosemirror-history'),
    import('prosemirror-schema-list'),
    import('prosemirror-tables'),
    import('./prosemirror-schema'),
    import('./prosemirror-markdown'),
    import('./prosemirror-keymap'),
    import('./prosemirror-input-rules'),
    import('prosemirror-inputrules'),
    import('./frontmatter-view'),
  ]);
  return {
    EditorView: modules[0].EditorView,
    EditorState: modules[1].EditorState,
    DOMParser: modules[2].DOMParser,
    baseKeymap: modules[3].baseKeymap,
    toggleMark: modules[3].toggleMark,
    setBlockType: modules[3].setBlockType,
    wrapIn: modules[3].wrapIn,
    lift: modules[3].lift,
    keymap: modules[4].keymap,
    history: modules[5].history,
    undo: modules[5].undo,
    redo: modules[5].redo,
    splitListItem: modules[6].splitListItem,
    liftListItem: modules[6].liftListItem,
    sinkListItem: modules[6].sinkListItem,
    wrapInList: modules[6].wrapInList,
    tableEditing: modules[7].tableEditing,
    addRowBefore: modules[7].addRowBefore,
    addRowAfter: modules[7].addRowAfter,
    addColumnBefore: modules[7].addColumnBefore,
    addColumnAfter: modules[7].addColumnAfter,
    deleteRow: modules[7].deleteRow,
    deleteColumn: modules[7].deleteColumn,
    deleteTable: modules[7].deleteTable,
    goToNextCell: modules[7].goToNextCell,
    isInTable: modules[7].isInTable,
    TextSelection: modules[1].TextSelection,
    schema: modules[8].getSchema(),
    markdownSerializer: modules[9].getMarkdownSerializer(),
    markdownParser: modules[9].getMarkdownParser(),
    createExtendedKeymap: modules[10].createExtendedKeymap,
    createInputRules: modules[11].createInputRules,
    inputRules: modules[12].inputRules,
    frontmatterViewPlugin: modules[13].frontmatterViewPlugin,
  } as EditorModules;
});

/**
 * Build a table node of the given size. The first row uses header cells; the rest
 * use regular cells. Each cell contains an empty paragraph.
 */
export function buildTableNode(schema: Schema, rows: number, cols: number): ProseMirrorNode {
  const tableRows: ProseMirrorNode[] = [];
  for (let i = 0; i < rows; i++) {
    const cells: ProseMirrorNode[] = [];
    for (let j = 0; j < cols; j++) {
      const cellType = i === 0 ? schema.nodes.table_header : schema.nodes.table_cell;
      const cellContent = schema.nodes.paragraph.createAndFill();
      cells.push(cellType.create(null, cellContent));
    }
    tableRows.push(schema.nodes.table_row.create(null, cells));
  }
  return schema.nodes.table.create(null, tableRows);
}

export class ProseMirrorEditor extends HTMLElement implements EditorElement {
  private view: EditorView | null = null;
  private _content = '';
  // Loading until the engine arrives; failed if it could not load.
  private phase: 'loading' | 'loaded' | 'failed' = 'loading';
  // Settled once the ProseMirror view exists with the current content.
  private readonly ready: ReadyGate = createReadyGate(this);
  // True while setContent replaces the doc, so the change is not reported as an edit.
  private applyingContent = false;
  private _shadowRoot!: ShadowRoot;
  private editorModules: EditorModules | null = null;
  private toolbar: ProseMirrorToolbar | null = null;
  // The raw view: its state, its surface while it shows, and why it shows when
  // that is not just the user's choice.
  private readonly viewState = createViewState(this);
  private raw: RawSource | null = null;
  private notice: HTMLElement | null = null;
  // `_content` is the text as set (by setContent or a raw edit). It is what
  // getContent() returns until the user edits in the rich view, so loading and
  // switching views never rewrite the Markdown; after a rich edit the serialiser's
  // output is the content.
  private richEdited = false;
  // A raw edit not yet applied to the ProseMirror document.
  private rawEdited = false;
  // A switch to rich that waits for a retried engine load, and its reason.
  private pendingRich: ViewChangeReason | null = null;

  static get observedAttributes() {
    return ['readonly', 'view'];
  }

  constructor() {
    super();
    this._shadowRoot = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    // A failed load is retried on the next connection.
    if (this.phase === 'failed') this.phase = 'loading';
    this.render();
    this.hydrateView();
  }

  /** Load the engine (shared, once) and build this connection's view. */
  private hydrateView() {
    hydrate(this.ready, {
      load: loadEngine,
      build: (modules) => this.buildView(modules),
      fail: (error) => {
        reportError('Failed to load editor', error);
        this.phase = 'failed';
        // The text is still here: fall back to the raw view.
        if (this.viewState.current === 'rich') this.viewState.commit('raw', 'fallback');
        this.notice = createNotice({
          tone: 'warning',
          title: this.pendingRich
            ? 'The rich editor still could not load; showing the raw text.'
            : 'The rich editor could not load; showing the raw text.',
          announce: this.pendingRich ? 'assertive' : 'polite',
        });
        this.pendingRich = null;
        this.viewState.reflect();
        this.render();
      },
    });
  }

  disconnectedCallback() {
    // Keep the latest text so a reconnect rebuilds the view from it, and tear
    // the view down so the rebuild is allowed; raw mode does not survive either.
    this._content = this.getContent();
    this.richEdited = false;
    this.rawEdited = false;
    this.view?.destroy();
    this.view = null;
    this.toolbar?.destroy();
    this.toolbar = null;
    // The view itself (the attribute) survives; its surface is rebuilt on connect.
    this.raw = null;
    this.ready.begin();
  }

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
    if (name === 'view') {
      if (!this.viewState.reflecting) this.requestView(parseView(newValue), 'host');
      return;
    }
    // Before the view exists the attribute is read once the engine loads.
    if (name === 'readonly') {
      this.raw?.setReadonly(newValue === 'true');
      if (this.view) this.updateReadOnlyState(newValue === 'true');
    }
  }

  private buildView(modules: EditorModules): Promise<void> | void {
    this.editorModules = modules;
    if (this.phase !== 'loaded') {
      this.phase = 'loaded';
      this.render();
    }

    const editorElement = this._shadowRoot.querySelector(
      '.prosemirror-editor-content'
    ) as HTMLElement;
    if (!editorElement) {
      throw new Error('Editor element not found');
    }

    const {
      EditorView,
      EditorState,
      baseKeymap,
      keymap,
      history,
      undo,
      redo,
      splitListItem,
      liftListItem,
      sinkListItem,
      toggleMark,
      setBlockType,
      tableEditing,
      goToNextCell,
      TextSelection,
      schema,
      markdownParser,
      createExtendedKeymap,
      createInputRules,
      inputRules,
      frontmatterViewPlugin,
    } = this.editorModules;

    // Parse initial content
    const doc = this._content
      ? markdownParser.parse(this._content)
      : schema.topNodeType.createAndFill() || undefined;

    // Create keymap
    const listKeymap = {
      Enter: splitListItem(schema.nodes.list_item),
      'Mod-[': liftListItem(schema.nodes.list_item),
      'Mod-]': sinkListItem(schema.nodes.list_item),
    };

    const historyKeymap = {
      'Mod-z': undo,
      'Mod-y': redo,
      'Mod-Shift-z': redo,
    };

    // Open the link popover with Ctrl/Cmd-K.
    const linkKeymap = {
      'Mod-k': () => {
        this.toolbar?.openLinkPopover();
        return true;
      },
    };

    // Table navigation: Tab/Shift-Tab move between cells; ArrowDown at the bottom
    // of a trailing table drops the cursor onto a new paragraph after it (so the
    // user isn't trapped when the table is the last node). Both return false when
    // not applicable, letting list-indent / default cursor movement take over.
    const tableKeymap = {
      Tab: goToNextCell(1),
      'Shift-Tab': goToNextCell(-1),
      ArrowDown: this.makeExitTableDown(schema, TextSelection),
    };

    // Create extended keymap with our additional shortcuts
    const extendedKeymap = createExtendedKeymap(
      schema,
      toggleMark,
      setBlockType,
      sinkListItem,
      liftListItem
    );

    // Create input rules for auto-list creation
    const rules = createInputRules(schema);

    // Create editor state
    const state = EditorState.create({
      doc,
      schema,
      plugins: [
        // First so its handleKeyDown (backspace guard at the body start) wins
        // over the keymaps' joinBackward.
        frontmatterViewPlugin(),
        inputRules({ rules }),
        history(),
        keymap(linkKeymap),
        keymap(tableKeymap),
        keymap(extendedKeymap),
        keymap(listKeymap),
        keymap(historyKeymap),
        keymap(baseKeymap),
        tableEditing(),
      ],
    });

    // Create editor view
    this.view = new EditorView(editorElement, {
      state,
      dispatchTransaction: (transaction: Transaction) => {
        if (!this.view) return;

        const newState = this.view.state.apply(transaction);
        this.view.updateState(newState);

        if (transaction.docChanged) {
          this.handleContentChange();
        }

        // Every transaction refreshes the toolbar, selection changes included
        // (ProseMirror dispatches one for each, mouse selection too), so no polling.
        this.toolbar?.updateState();
      },
      handlePaste: (view: EditorView, event: ClipboardEvent) => {
        const text = event.clipboardData?.getData('text/plain');
        if (text && this.isMarkdown(text)) {
          event.preventDefault();
          const { markdownParser } = this.editorModules!;
          // Frontmatter only exists at document position 0; a pasted fragment
          // starting with `---` must parse with the normal markdown rules.
          const doc = markdownParser.parse(text, { frontmatter: false });
          const { tr } = view.state;
          tr.replaceSelectionWith(doc, false);
          view.dispatch(tr);
          return true;
        }
        return false;
      },
    });

    // Setup toolbar
    this.setupToolbar();

    // Let registered plugins run view setup (e.g. register custom elements).
    for (const plugin of getEditorPlugins()) {
      plugin.onReady?.(this.view);
    }

    this.updateReadOnlyState(isReadonly(this));

    // A switch to rich that waited for this load completes now.
    if (this.pendingRich) {
      const reason = this.pendingRich;
      this.pendingRich = null;
      this.notice = null;
      this.viewState.commit('rich', reason);
    }
    this.syncView();
  }

  private handleContentChange() {
    if (!this.view || !this.editorModules) return;
    if (this.applyingContent) return; // a setContent, not an edit
    this.richEdited = true;

    const { markdownSerializer } = this.editorModules;
    const markdown = markdownSerializer.serialize(this.view.state.doc);

    this.dispatchEvent(
      new CustomEvent('content-change', {
        detail: { content: markdown },
      })
    );
  }

  private setEditorContent(content: string) {
    if (!this.view || !this.editorModules) return;

    const { markdownParser } = this.editorModules;
    const doc = markdownParser.parse(content);
    const state = this.view.state;
    const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
    this.applyingContent = true;
    try {
      this.view.dispatch(tr);
    } finally {
      this.applyingContent = false;
    }
  }

  // Read-only means no user action inside the element changes the content:
  // the editing surface, the toolbar and the raw textarea all go inert.
  // Read-only never changes the view: the editing surface and the toolbar go
  // inert, and so does the raw text; the raw switch keeps working.
  private updateReadOnlyState(readonly: boolean) {
    if (!this.view) return;
    this.view.setProps({ editable: () => !readonly });
    reflectReadonly(this, this.view.dom, readonly);
    this.toolbar?.setReadOnly(readonly);
    this.raw?.setReadonly(readonly);
  }

  // Get current heading level for toolbar display
  getHeadingLevel(): number {
    if (!this.view || !this.editorModules) return 1;
    const { $from } = this.view.state.selection;
    const parent = $from.parent;
    const { schema } = this.editorModules;

    if (parent.type === schema.nodes.heading) {
      return parent.attrs.level;
    }
    return 1;
  }

  getContent(): string {
    // The text as set, until the user edits in the rich view (see `_content`).
    if (!this.richEdited || !this.view || !this.editorModules) return this._content;
    const { markdownSerializer } = this.editorModules;
    return markdownSerializer.serialize(this.view.state.doc);
  }

  setContent(content: string) {
    this._content = content;
    this.richEdited = false;
    this.rawEdited = false;
    if (this.view) {
      this.setEditorContent(content);
    }
    this.raw?.setValue(content);
  }

  override focus() {
    if (this.raw) this.raw.focus();
    else this.view?.focus();
  }

  /** Move to `view`. Markdown always parses, so only a failed engine keeps raw. */
  private requestView(view: SurfaceView, reason: ViewChangeReason): void {
    if (view === this.viewState.current) {
      this.viewState.reflect();
      return;
    }
    if (view === 'rich' && this.phase === 'failed') {
      // Try the engine again; the view switches once it has loaded.
      this.pendingRich = reason;
      this.viewState.reflect();
      this.phase = 'loading';
      this.render();
      this.hydrateView();
      return;
    }
    if (view === 'raw') {
      // The raw view shows exactly what getContent() returns.
      this._content = this.getContent();
      this.richEdited = false;
      this.rawEdited = false;
    } else if (this.rawEdited) {
      this.setEditorContent(this._content);
      this.rawEdited = false;
    }
    this.notice = null;
    this.viewState.commit(view, reason);
    this.syncView();
  }

  /** Show the current view: the ProseMirror view or the raw text, and its toolbar. */
  private syncView(): void {
    if (this.phase === 'loading') return;
    const container = this._shadowRoot.querySelector<HTMLElement>('.prosemirror-editor-container');
    const editorContent = this._shadowRoot.querySelector<HTMLElement>(
      '.prosemirror-editor-content'
    );
    const rawContainer = this._shadowRoot.querySelector<HTMLElement>('.prosemirror-editor-raw');
    const noticeSlot = this._shadowRoot.querySelector<HTMLElement>('.prosemirror-editor-notice');
    if (!container || !editorContent || !rawContainer || !noticeSlot) return;

    const raw = this.viewState.current === 'raw';
    container.classList.toggle('is-raw', raw);
    editorContent.hidden = raw;
    rawContainer.hidden = !raw;
    noticeSlot.replaceChildren(...(this.notice ? [this.notice] : []));

    if (!raw) {
      this.raw = null;
      rawContainer.replaceChildren();
      if (!this.toolbar) this.setupToolbar();
      return;
    }

    this.raw ??= createRawSource({
      value: this._content,
      language: 'markdown',
      label: 'Markdown source',
      readonly: isReadonly(this),
      onInput: (text) => this.handleRawInput(text),
    });
    if (this.raw.element.parentNode !== rawContainer)
      rawContainer.replaceChildren(this.raw.element);
    this.renderRawModeToolbar();
    if (!this.isConnected) return;
    const surface = this.raw;
    const cycle = this.ready.begin();
    void surface.whenReady().then(() => this.ready.settle(cycle));
  }

  private isMarkdown(content: string): boolean {
    // Don't treat single lines of plain text as markdown
    if (
      !content.includes('\n') &&
      !content.includes('#') &&
      !content.includes('*') &&
      !content.includes('[')
    ) {
      return false;
    }

    // Check for common markdown patterns
    const markdownPatterns = [
      /^#{1,6}\s+/m, // Headers
      /\*\*[^*]+\*\*/, // Bold
      /__[^_]+__/, // Bold alt
      /\*[^*\n]+\*/, // Italic
      /_[^_\n]+_/, // Italic alt
      /\[[^\]]+\]\([^)]+\)/, // Links
      /```[\s\S]+```/, // Code blocks
      /^\s*[-*+]\s+/m, // Lists
      /^\s*\d+\.\s+/m, // Numbered lists
      /^>/m, // Blockquotes
      /^\|.+\|.+\|$/m, // Tables
    ];

    // Require at least 2 pattern matches or 1 strong pattern
    const strongPatterns = [/^#{1,6}\s+/m, /```[\s\S]+```/, /^\|.+\|.+\|$/m];
    const hasStrongPattern = strongPatterns.some((pattern) => pattern.test(content));
    const matchCount = markdownPatterns.filter((pattern) => pattern.test(content)).length;

    return hasStrongPattern || matchCount >= 2;
  }

  private render() {
    if (this.phase === 'loading') {
      this._shadowRoot.innerHTML = `
        <style>${this.getStyles()}</style>
        <div class="prosemirror-editor-container"></div>
      `;
      this._shadowRoot.querySelector('.prosemirror-editor-container')?.append(this.status());
      return;
    }

    this._shadowRoot.innerHTML = `
      <style>${this.getStyles()}</style>
      <div class="prosemirror-editor-container">
        <div class="prosemirror-editor-toolbar-container"></div>
        <div class="prosemirror-editor-notice"></div>
        <div class="prosemirror-editor-content"></div>
        <div class="prosemirror-editor-raw" hidden></div>
      </div>
    `;
    // Without an engine (it failed to load) only the raw view can show.
    if (this.phase === 'failed') this.syncView();
  }

  private setupToolbar() {
    if (!this.view || !this.editorModules) return;

    const toolbarContainer = this._shadowRoot.querySelector(
      '.prosemirror-editor-toolbar-container'
    ) as HTMLElement;
    if (!toolbarContainer) return;

    // Clean up existing toolbar if any
    if (this.toolbar) {
      this.toolbar.destroy();
    }

    const { schema } = this.editorModules;
    this.toolbar = new ProseMirrorToolbar(toolbarContainer, this.view, schema);

    // Register all commands
    this.toolbar.registerCommand('toggleBold', {
      execute: () => this.toggleMark(schema.marks.strong),
      isActive: () => this.isMarkActive(schema.marks.strong),
    });

    this.toolbar.registerCommand('toggleItalic', {
      execute: () => this.toggleMark(schema.marks.em),
      isActive: () => this.isMarkActive(schema.marks.em),
    });

    this.toolbar.registerCommand('toggleStrike', {
      execute: () => this.toggleMark(schema.marks.strike),
      isActive: () => this.isMarkActive(schema.marks.strike),
    });

    this.toolbar.registerCommand('toggleCode', {
      execute: () => this.toggleMark(schema.marks.code),
      isActive: () => this.isMarkActive(schema.marks.code),
    });

    this.toolbar.registerCommand('setParagraph', {
      execute: () => this.setBlock(schema.nodes.paragraph),
      isActive: () => this.isNodeActive(schema.nodes.paragraph),
    });

    for (const level of [1, 2, 3, 4, 5, 6]) {
      this.toolbar.registerCommand(`setHeading${level}`, {
        execute: () => this.setBlock(schema.nodes.heading, { level }),
        isActive: () => this.isNodeActive(schema.nodes.heading) && this.getHeadingLevel() === level,
      });
    }

    this.toolbar.registerCommand('toggleBulletList', {
      execute: () => this.toggleList(schema.nodes.bullet_list),
      isActive: () => this.isListActive(schema.nodes.bullet_list),
    });

    this.toolbar.registerCommand('toggleOrderedList', {
      execute: () => this.toggleList(schema.nodes.ordered_list),
      isActive: () => this.isListActive(schema.nodes.ordered_list),
    });

    this.toolbar.registerCommand('toggleCodeBlock', {
      execute: () => this.toggleCodeBlock(),
      isActive: () => this.isNodeActive(schema.nodes.code_block),
    });

    this.toolbar.registerCommand('toggleBlockquote', {
      execute: () => this.toggleBlockquote(),
      isActive: () => this.isBlockquoteActive(),
    });

    // Table editing commands (enabled only when the cursor is inside a table).
    const { isInTable } = this.editorModules;
    const tableCommands: Record<string, () => void> = {
      addRowAbove: () => this.runTableCommand(this.editorModules!.addRowBefore),
      addRowBelow: () => this.runTableCommand(this.editorModules!.addRowAfter),
      addColumnBefore: () => this.runTableCommand(this.editorModules!.addColumnBefore),
      addColumnAfter: () => this.runTableCommand(this.editorModules!.addColumnAfter),
      deleteRow: () => this.runTableCommand(this.editorModules!.deleteRow),
      deleteColumn: () => this.runTableCommand(this.editorModules!.deleteColumn),
      deleteTable: () => this.runTableCommand(this.editorModules!.deleteTable),
    };
    for (const [name, execute] of Object.entries(tableCommands)) {
      this.toolbar.registerCommand(name, {
        execute,
        isEnabled: () => (this.view ? isInTable(this.view.state) : false),
      });
    }

    // Used by the compact-mode overflow menu (inserts a default-sized table).
    this.toolbar.registerCommand('insertTableDefault', {
      execute: () => this.insertTable(),
    });

    this.toolbar.registerCommand('viewMarkdown', {
      execute: () => this.requestView('raw', 'user'),
    });

    // Parameterized actions that don't fit the parameterless command registry.
    this.toolbar.tableInsertHandler = (rows, cols) => this.insertTable(rows, cols);
    this.toolbar.linkHandler = (url) => this.applyLink(url);

    // Render the toolbar
    this.toolbar.render();
    this.toolbar.setReadOnly(isReadonly(this));
  }

  private setBlock(nodeType: NodeType, attrs?: Record<string, unknown>) {
    if (!this.view || !this.editorModules) return;
    const { state, dispatch } = this.view;
    const { setBlockType } = this.editorModules;
    setBlockType(nodeType, attrs)(state, dispatch);
    this.view.focus();
  }

  private runTableCommand(
    command: (state: EditorState, dispatch: (tr: Transaction) => void) => boolean
  ) {
    if (!this.view) return;
    command(this.view.state, this.view.dispatch);
    this.view.focus();
  }

  /**
   * Build an ArrowDown command that lets the user escape a table that is the last
   * node in its container: when the caret is on the last line of a cell in the
   * bottom row, insert a paragraph after the table and move there. Returns false
   * in every other case so normal cursor movement / cell navigation is preserved.
   */
  private makeExitTableDown(schema: Schema, TextSelectionCtor: typeof TextSelection) {
    return (
      state: EditorState,
      dispatch?: (tr: Transaction) => void,
      view?: EditorView
    ): boolean => {
      const { selection } = state;
      if (!selection.empty) return false;

      const $head = selection.$head;
      let tableDepth = -1;
      for (let d = $head.depth; d > 0; d--) {
        if ($head.node(d).type.name === 'table') {
          tableDepth = d;
          break;
        }
      }
      if (tableDepth === -1) return false;

      // Only act on the last visual line of the current cell block.
      if (view && !view.endOfTextblock('down')) return false;

      const tableNode = $head.node(tableDepth);
      if ($head.index(tableDepth) !== tableNode.childCount - 1) return false; // not last row

      const cellDepth = tableDepth + 2;
      if ($head.depth >= cellDepth) {
        const cellNode = $head.node(cellDepth);
        if ($head.index(cellDepth) !== cellNode.childCount - 1) return false; // not last block in cell
      }

      // The table must be the last child of its container.
      const parentDepth = tableDepth - 1;
      const parent = $head.node(parentDepth);
      if ($head.index(parentDepth) !== parent.childCount - 1) return false;

      if (dispatch) {
        const tableEnd = $head.before(tableDepth) + tableNode.nodeSize;
        const paragraph = schema.nodes.paragraph.createAndFill();
        if (!paragraph) return false;
        const tr = state.tr.insert(tableEnd, paragraph);
        tr.setSelection(TextSelectionCtor.create(tr.doc, tableEnd + 1)).scrollIntoView();
        dispatch(tr);
      }
      return true;
    };
  }

  private toggleMark(markType: MarkType) {
    if (!this.view || !this.editorModules) return;

    const { state, dispatch } = this.view;
    const { toggleMark } = this.editorModules;

    toggleMark(markType)(state, dispatch);
  }

  private isMarkActive(markType: MarkType): boolean {
    if (!this.view) return false;

    const { state } = this.view;
    const { $from, $to } = state.selection;

    return state.doc.rangeHasMark($from.pos, $to.pos, markType);
  }

  private isNodeActive(nodeType: NodeType): boolean {
    if (!this.view) return false;

    const { $from } = this.view.state.selection;
    return $from.parent.type === nodeType;
  }

  private isListActive(listType: NodeType): boolean {
    if (!this.view) return false;

    return this.findParentNodeOfType(listType, this.view.state.selection) !== null;
  }

  private isBlockquoteActive(): boolean {
    if (!this.view || !this.editorModules) return false;

    const { schema } = this.editorModules;
    return this.findParentNodeOfType(schema.nodes.blockquote, this.view.state.selection) !== null;
  }

  private toggleList(listType: NodeType) {
    if (!this.view || !this.editorModules) return;

    const { state, dispatch } = this.view;
    const { schema, wrapInList, liftListItem } = this.editorModules;
    const { selection } = state;

    const currentList = this.findParentNodeOfType(listType, selection);

    if (currentList) {
      // Lift out of list
      liftListItem(schema.nodes.list_item)(state, dispatch);
    } else {
      // Wrap in list
      wrapInList(listType)(state, dispatch);
    }
  }

  private toggleCodeBlock() {
    if (!this.view || !this.editorModules) return;

    const { state, dispatch } = this.view;
    const { schema, setBlockType } = this.editorModules;
    const { $from } = state.selection;

    const currentNode = $from.parent;
    const isCodeBlock = currentNode.type === schema.nodes.code_block;

    if (isCodeBlock) {
      // Convert to paragraph
      setBlockType(schema.nodes.paragraph)(state, dispatch);
    } else {
      // Convert to code block
      setBlockType(schema.nodes.code_block)(state, dispatch);
    }
  }

  private toggleBlockquote() {
    if (!this.view || !this.editorModules) return;

    const { state, dispatch } = this.view;
    const { schema, wrapIn, lift } = this.editorModules;
    const { selection } = state;

    const currentBlockquote = this.findParentNodeOfType(schema.nodes.blockquote, selection);

    if (currentBlockquote) {
      // Lift out of blockquote
      lift(state, dispatch);
    } else {
      // Wrap in blockquote
      wrapIn(schema.nodes.blockquote)(state, dispatch);
    }
  }

  private insertTable(rows = 3, cols = 3) {
    if (!this.view || !this.editorModules) return;

    const { state, dispatch } = this.view;
    const { schema } = this.editorModules;

    const table = buildTableNode(schema, rows, cols);
    const tr = state.tr.replaceSelectionWith(table);
    dispatch(tr);
    this.view.focus();
  }

  private applyLink(url: string) {
    if (!this.view || !this.editorModules) return;

    const { state, dispatch } = this.view;
    const { schema } = this.editorModules;
    const { from, to } = state.selection;
    if (from === to) return; // nothing selected to link

    const tr = state.tr.addMark(from, to, schema.marks.link.create({ href: url }));
    dispatch(tr);
    this.view.focus();
  }

  private findParentNodeOfType(
    nodeType: NodeType,
    selection: Selection
  ): { node: ProseMirrorNode; depth: number; pos: number } | null {
    const { $from } = selection;
    for (let i = $from.depth; i > 0; i--) {
      const node = $from.node(i);
      if (node.type === nodeType) {
        return { node, depth: i, pos: $from.before(i) };
      }
    }
    return null;
  }

  private handleRawInput(text: string): void {
    this._content = text;
    this.rawEdited = true;
    this.richEdited = false;
    this.dispatchEvent(new CustomEvent('content-change', { detail: { content: text } }));
  }

  private renderRawModeToolbar() {
    const toolbarContainer = this._shadowRoot.querySelector(
      '.prosemirror-editor-toolbar-container'
    ) as HTMLElement;
    if (!toolbarContainer) return;
    // The rich toolbar is gone while raw shows; it is rebuilt on the way back.
    this.toolbar?.destroy();
    this.toolbar = null;

    toolbarContainer.innerHTML = `
      <div class="prosemirror-editor-toolbar raw-mode" role="toolbar" aria-label="Markdown source">
        <div class="toolbar-spacer"></div>
        <div class="toolbar-group">
          <label class="toggle-label">${RAW_VIEW_LABEL}</label>
        </div>
      </div>
    `;

    // On in raw. The switch follows the view, so it never flips itself.
    const toggle = createSwitch({
      label: RAW_VIEW_LABEL,
      checked: true,
      onToggle: () => {
        this.requestView('rich', 'user');
        return false;
      },
    });
    toggle.element.classList.add('markdown-toggle');
    toggle.element.tabIndex = 0;
    toolbarContainer.querySelector('.toolbar-group')?.append(toggle.element);
    toolbarContainer
      .querySelector('.prosemirror-editor-toolbar')
      ?.addEventListener('keydown', (event) =>
        moveToolbarFocus(event as KeyboardEvent, [toggle.element])
      );
  }

  private getStyles(): string {
    return editorStyles;
  }

  /** The placeholder shown while the engine loads (a failed load falls back to raw). */
  private status(): HTMLElement {
    return createStatus('loading', STATUS_MESSAGES.loading);
  }
}

defineElement('md-editor', ProseMirrorEditor);
