/// <reference lib="dom" />
import './md-icon';
import './md-toggle';

import { editorStyles } from './editor.styles';
import { report, reportError } from './log';
import { MdToggleEvent } from './md-toggle';
import { ProseMirrorToolbar } from './prosemirror-toolbar';
import { getEditorPlugins } from './registry';

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
}

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

export class ProseMirrorEditor extends HTMLElement {
  private view: EditorView | null = null;
  private _content = '';
  private _loading = true;
  private _shadowRoot!: ShadowRoot;
  private editorModules: EditorModules | null = null;
  private toolbar: ProseMirrorToolbar | null = null;
  private isRawMode = false;
  private rawTextarea: HTMLTextAreaElement | null = null;

  static get observedAttributes() {
    return ['readonly'];
  }

  constructor() {
    super();
    this._shadowRoot = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    // Wait for next tick to ensure shadow DOM is ready
    setTimeout(() => this.loadEditor(), 0);
  }

  disconnectedCallback() {
    this.view?.destroy();
    this.toolbar?.destroy();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
    if (name === 'readonly' && this.view) {
      // We'll handle readonly state in the view configuration
      this.updateReadOnlyState(newValue === 'true');
    }
  }

  private async loadEditor() {
    try {
      // Lazy load the ProseMirror modules
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
      ]);

      this.editorModules = {
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
      } as EditorModules;

      this._loading = false;
      this.render();

      // Initialize editor after rendering the UI
      setTimeout(() => this.initializeEditor(), 0);
    } catch (error) {
      reportError('Failed to load editor', error);
      this._loading = false;
      this.render();
    }
  }

  private initializeEditor() {
    // Prevent double initialization
    if (this.view || !this.editorModules) {
      report('Editor already initialized or modules not loaded', { level: 'warn' });
      return;
    }

    const editorElement = this._shadowRoot.querySelector(
      '.prosemirror-editor-content'
    ) as HTMLElement;
    if (!editorElement) {
      reportError('Editor element not found');
      return;
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

        // Update toolbar state on any transaction
        this.toolbar?.updateState();
      },
      handlePaste: (view: EditorView, event: ClipboardEvent) => {
        const text = event.clipboardData?.getData('text/plain');
        if (text && this.isMarkdown(text)) {
          event.preventDefault();
          const { markdownParser } = this.editorModules!;
          const doc = markdownParser.parse(text);
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

    // Listen for selection changes
    setInterval(() => this.toolbar?.updateState(), 100);
  }

  private handleContentChange() {
    if (!this.view || !this.editorModules) return;

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
    this.view.dispatch(tr);
  }

  private updateReadOnlyState(readonly: boolean) {
    if (!this.view) return;
    this.view.setProps({ editable: () => !readonly });
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
    // If in raw mode, return the textarea content
    if (this.isRawMode && this.rawTextarea) {
      return this.rawTextarea.value;
    }

    // Otherwise return the editor content
    if (!this.view || !this.editorModules) {
      return this._content;
    }
    const { markdownSerializer } = this.editorModules;
    return markdownSerializer.serialize(this.view.state.doc);
  }

  setContent(content: string) {
    this._content = content;
    if (this.view) {
      this.setEditorContent(content);
    }
  }

  override focus() {
    this.view?.focus();
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
    if (this._loading) {
      this._shadowRoot.innerHTML = `
        <style>${this.getStyles()}</style>
        <div class="prosemirror-editor-container">
          <div class="prosemirror-editor-loading">Loading editor...</div>
        </div>
      `;
      return;
    }

    this._shadowRoot.innerHTML = `
      <style>${this.getStyles()}</style>
      <div class="prosemirror-editor-container">
        <div class="prosemirror-editor-toolbar-container"></div>
        <div class="prosemirror-editor-content"></div>
        <textarea class="prosemirror-editor-raw" style="display: none;"></textarea>
      </div>
    `;
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
      execute: () => this.toggleRawMode(),
    });

    // Parameterized actions that don't fit the parameterless command registry.
    this.toolbar.tableInsertHandler = (rows, cols) => this.insertTable(rows, cols);
    this.toolbar.linkHandler = (url) => this.applyLink(url);

    // Render the toolbar
    this.toolbar.render();
    this.toolbar.updateState();
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

  private toggleRawMode() {
    this.isRawMode = !this.isRawMode;
    this.updateViewMode();
  }

  private updateViewMode() {
    const editorContent = this._shadowRoot.querySelector(
      '.prosemirror-editor-content'
    ) as HTMLElement;
    const rawTextarea = this._shadowRoot.querySelector(
      '.prosemirror-editor-raw'
    ) as HTMLTextAreaElement;
    const toolbarContainer = this._shadowRoot.querySelector(
      '.prosemirror-editor-toolbar-container'
    ) as HTMLElement;

    if (!editorContent || !rawTextarea || !toolbarContainer) return;

    this.rawTextarea = rawTextarea;

    if (this.isRawMode) {
      // Switch to raw mode
      editorContent.style.display = 'none';
      rawTextarea.style.display = 'block';
      // Get content from editor before switching
      if (this.view && this.editorModules) {
        const { markdownSerializer } = this.editorModules;
        rawTextarea.value = markdownSerializer.serialize(this.view.state.doc);
      } else {
        rawTextarea.value = this._content;
      }

      // Update toolbar to show only toggle
      this.renderRawModeToolbar();

      // Focus textarea
      rawTextarea.focus();

      // Add textarea event listener
      rawTextarea.addEventListener('input', this.handleRawInput);
    } else {
      // Switch back to editor mode
      if (this.rawTextarea) {
        // Get the current editor content before updating
        let currentEditorContent = this._content;
        if (this.view && this.editorModules) {
          const { markdownSerializer } = this.editorModules;
          currentEditorContent = markdownSerializer.serialize(this.view.state.doc);
        }

        // Update content from raw textarea
        const newContent = this.rawTextarea.value;
        if (newContent !== currentEditorContent) {
          this.setContent(newContent);
          // Trigger content change event when switching back if content changed
          this.dispatchEvent(
            new CustomEvent('content-change', {
              detail: { content: newContent },
            })
          );
        }
        this.rawTextarea.removeEventListener('input', this.handleRawInput);
      }

      editorContent.style.display = 'block';
      rawTextarea.style.display = 'none';

      // Restore full toolbar
      this.setupToolbar();

      // Focus editor
      this.view?.focus();
    }
  }

  private handleRawInput = () => {
    // Store the raw content but don't update the editor until switching back
    this._content = this.rawTextarea?.value || '';

    // Dispatch content-change event to trigger save indicators
    this.dispatchEvent(
      new CustomEvent('content-change', {
        detail: { content: this._content },
      })
    );
  };

  private renderRawModeToolbar() {
    const toolbarContainer = this._shadowRoot.querySelector(
      '.prosemirror-editor-toolbar-container'
    ) as HTMLElement;
    if (!toolbarContainer) return;

    toolbarContainer.innerHTML = `
      <div class="prosemirror-editor-toolbar raw-mode">
        <div class="toolbar-spacer"></div>
        <div class="toolbar-group">
          <label class="toggle-label">Markdown</label>
          <md-toggle class="markdown-toggle"></md-toggle>
        </div>
      </div>
    `;

    // Add toggle event listener
    const toggle = toolbarContainer.querySelector('.markdown-toggle');
    if (toggle) {
      toggle.addEventListener('md-toggle', (e: Event) => {
        const toggleEvent = e as MdToggleEvent;
        // When toggle is checked (ON), switch back to markdown editor
        if (toggleEvent.detail.checked) {
          this.toggleRawMode();
        }
      });
    }
  }

  private getStyles(): string {
    return editorStyles;
  }
}

customElements.define('md-editor', ProseMirrorEditor);
