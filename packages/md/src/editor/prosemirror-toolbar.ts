import './md-icon';
import './md-toggle';

import { MdToggleEvent } from './md-toggle';

import type { Schema } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

export interface ToolbarCommand {
  execute: () => void;
  isActive?: () => boolean;
  isEnabled?: () => boolean;
}

const MAX_TABLE_ROWS = 8;
const MAX_TABLE_COLS = 8;

// Small helper for an inline icon glyph (md-icon renders inline SVG colored via
// currentColor, so it works inside the editor's shadow root).
function icon(name: string): string {
  return `<md-icon icon-name="${name}" data-size="small" aria-hidden="true"></md-icon>`;
}

export class ProseMirrorToolbar {
  private container: HTMLElement;
  private view: EditorView;
  private schema: Schema;
  private commands: Map<string, ToolbarCommand> = new Map();

  // Set by the editor; parameterized actions that don't fit the parameterless
  // command registry.
  tableInsertHandler?: (rows: number, cols: number) => void;
  linkHandler?: (url: string) => void;

  private inTable = false;
  private documentClickHandler?: (e: Event) => void;
  private keydownHandler?: (e: KeyboardEvent) => void;
  private resizeObserver?: ResizeObserver;
  private toolbarEl: HTMLElement | null = null;

  constructor(container: HTMLElement, view: EditorView, schema: Schema) {
    this.container = container;
    this.view = view;
    this.schema = schema;
  }

  registerCommand(name: string, command: ToolbarCommand): void {
    this.commands.set(name, command);
  }

  render(): void {
    this.container.innerHTML = this.generateHTML();
    this.setupEventListeners();
    this.setupDismissListeners();
    this.setupOverflow();
  }

  updateState(): void {
    this.inTable = this.isCursorInTable();

    const buttons = this.container.querySelectorAll<HTMLButtonElement>('.toolbar-button');
    buttons.forEach((btn) => {
      const commandName = btn.dataset.command;
      if (!commandName) return;

      const command = this.commands.get(commandName);
      if (!command) return;

      btn.classList.remove('is-active');
      if (command.isActive && command.isActive()) {
        btn.classList.add('is-active');
      }

      if (command.isEnabled) {
        btn.disabled = !command.isEnabled();
      }
    });

    this.updateHeadingLabel();
    this.updateTableTrigger();
  }

  private updateHeadingLabel(): void {
    const label = this.container.querySelector('.dropdown-label');
    if (!label) return;

    const { $from } = this.view.state.selection;
    const parent = $from.parent;

    if (parent.type === this.schema.nodes.heading) {
      label.textContent = `H${parent.attrs.level}`;
    } else {
      label.textContent = 'Paragraph';
    }
  }

  private updateTableTrigger(): void {
    const trigger = this.container.querySelector('[data-popover="table"]');
    if (!trigger) return;
    trigger.classList.toggle('is-active', this.inTable);
  }

  private isCursorInTable(): boolean {
    const { $from } = this.view.state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type.name === 'table') return true;
    }
    return false;
  }

  private generateHTML(): string {
    return `
      <div class="prosemirror-editor-toolbar">
        ${this.generateFormattingGroup()}
        ${this.generateHeadingGroup()}
        ${this.generateListGroup()}
        ${this.generateBlockGroup()}
        ${this.generateInsertGroup()}
        ${this.generateOverflowGroup()}
        <div class="toolbar-spacer"></div>
        ${this.generateViewGroup()}
      </div>
    `;
  }

  private generateFormattingGroup(): string {
    return `
      <div class="toolbar-group">
        <button class="toolbar-button" data-command="toggleBold" title="Bold (Ctrl+B)">
          ${icon('bold')}
        </button>
        <button class="toolbar-button" data-command="toggleItalic" title="Italic (Ctrl+I)">
          ${icon('italic')}
        </button>
        <div class="toolbar-menu">
          <button class="toolbar-button" data-popover="format-overflow" title="More formatting">
            ${icon('more-horizontal')}
          </button>
          <div class="toolbar-popover" data-popover-panel="format-overflow">
            <button class="toolbar-button menu-item" data-command="toggleStrike" title="Strikethrough">
              ${icon('strikethrough')}<span class="menu-item-label">Strikethrough</span>
            </button>
            <button class="toolbar-button menu-item" data-command="toggleCode" title="Inline Code (Ctrl+\`)">
              ${icon('code')}<span class="menu-item-label">Inline code</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private generateHeadingGroup(): string {
    const headingItems = [1, 2, 3, 4, 5, 6]
      .map(
        (level) => `
        <button class="toolbar-button menu-item" data-command="setHeading${level}">
          <span class="menu-item-label heading-opt h${level}">Heading ${level}</span>
        </button>`
      )
      .join('');

    return `
      <div class="toolbar-group">
        <div class="toolbar-menu">
          <button class="toolbar-button toolbar-dropdown" data-popover="heading" title="Paragraph style">
            <span class="dropdown-label">Paragraph</span>
            ${icon('chevron-down')}
          </button>
          <div class="toolbar-popover" data-popover-panel="heading">
            <button class="toolbar-button menu-item" data-command="setParagraph">
              <span class="menu-item-label">Paragraph</span>
            </button>
            ${headingItems}
          </div>
        </div>
      </div>
    `;
  }

  private generateListGroup(): string {
    return `
      <div class="toolbar-group">
        <button class="toolbar-button" data-command="toggleBulletList" title="Bullet List (Tab/Shift-Tab to indent)">
          ${icon('list-bulleted')}
        </button>
        <button class="toolbar-button" data-command="toggleOrderedList" title="Numbered List (Tab/Shift-Tab to indent)">
          ${icon('list-numbered')}
        </button>
      </div>
    `;
  }

  private generateBlockGroup(): string {
    return `
      <div class="toolbar-group" data-collapsible>
        <button class="toolbar-button" data-command="toggleCodeBlock" title="Code Block">
          ${icon('code-block')}
        </button>
        <button class="toolbar-button" data-command="toggleBlockquote" title="Blockquote">
          ${icon('quote')}
        </button>
      </div>
    `;
  }

  private generateInsertGroup(): string {
    return `
      <div class="toolbar-group">
        <div class="toolbar-menu" data-collapsible>
          <button class="toolbar-button" data-popover="table" title="Table">
            ${icon('table')}
          </button>
          <div class="toolbar-popover toolbar-popover-grid" data-popover-panel="table-insert">
            <div class="table-grid">${this.generateGridCells()}</div>
            <div class="table-grid-label">Insert table</div>
          </div>
          <div class="toolbar-popover" data-popover-panel="table-edit">
            <button class="toolbar-button menu-item" data-command="addRowAbove">
              ${icon('arrow-up')}<span class="menu-item-label">Insert row above</span>
            </button>
            <button class="toolbar-button menu-item" data-command="addRowBelow">
              ${icon('arrow-down')}<span class="menu-item-label">Insert row below</span>
            </button>
            <button class="toolbar-button menu-item" data-command="addColumnBefore">
              ${icon('arrow-left')}<span class="menu-item-label">Insert column before</span>
            </button>
            <button class="toolbar-button menu-item" data-command="addColumnAfter">
              ${icon('arrow-right')}<span class="menu-item-label">Insert column after</span>
            </button>
            <div class="menu-divider"></div>
            <button class="toolbar-button menu-item" data-command="deleteRow">
              ${icon('trash')}<span class="menu-item-label">Delete row</span>
            </button>
            <button class="toolbar-button menu-item" data-command="deleteColumn">
              ${icon('trash')}<span class="menu-item-label">Delete column</span>
            </button>
            <button class="toolbar-button menu-item" data-command="deleteTable">
              ${icon('trash')}<span class="menu-item-label">Delete table</span>
            </button>
          </div>
        </div>
        <div class="toolbar-menu">
          <button class="toolbar-button" data-popover="link" title="Add Link (Ctrl+K)">
            ${icon('link')}
          </button>
          <div class="toolbar-popover toolbar-popover-link" data-popover-panel="link">
            <input type="text" class="link-input" placeholder="https://example.com" />
            <button class="link-submit" type="button">Add</button>
          </div>
        </div>
      </div>
    `;
  }

  private generateGridCells(): string {
    let cells = '';
    for (let r = 1; r <= MAX_TABLE_ROWS; r++) {
      for (let c = 1; c <= MAX_TABLE_COLS; c++) {
        cells += `<span class="grid-cell" data-row="${r}" data-col="${c}"></span>`;
      }
    }
    return cells;
  }

  // Shown only when the toolbar is too narrow to fit everything; holds the
  // lower-priority tools (blocks + table) that get hidden in compact mode.
  private generateOverflowGroup(): string {
    return `
      <div class="toolbar-menu toolbar-overflow">
        <button class="toolbar-button" data-popover="overflow" title="More tools">
          ${icon('dots-vertical')}
        </button>
        <div class="toolbar-popover" data-popover-panel="overflow">
          <button class="toolbar-button menu-item" data-command="toggleCodeBlock" title="Code Block">
            ${icon('code-block')}<span class="menu-item-label">Code block</span>
          </button>
          <button class="toolbar-button menu-item" data-command="toggleBlockquote" title="Blockquote">
            ${icon('quote')}<span class="menu-item-label">Blockquote</span>
          </button>
          <button class="toolbar-button menu-item" data-command="insertTableDefault" title="Insert Table">
            ${icon('table')}<span class="menu-item-label">Insert table</span>
          </button>
        </div>
      </div>
    `;
  }

  private generateViewGroup(): string {
    return `
      <div class="toolbar-group">
        <label class="toggle-label">Raw</label>
        <md-toggle class="markdown-toggle" checked></md-toggle>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Delegated click handling for all toolbar buttons (commands + popover triggers).
    this.container.querySelectorAll<HTMLButtonElement>('.toolbar-button').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const btn = e.currentTarget as HTMLButtonElement;

        const popover = btn.dataset.popover;
        if (popover) {
          this.handlePopoverTrigger(popover);
          return;
        }

        const commandName = btn.dataset.command;
        if (!commandName) return;

        const command = this.commands.get(commandName);
        if (command && command.execute) {
          command.execute();
          this.updateState();
        }

        // Commands invoked from inside a popover (heading, format, table edit) close it.
        if (btn.classList.contains('menu-item')) {
          this.closeAllPopovers();
        }
      });
    });

    this.setupGridListeners();
    this.setupLinkListeners();

    // View toggle
    const toggle = this.container.querySelector('.markdown-toggle');
    if (toggle) {
      toggle.addEventListener('md-toggle', (e: Event) => {
        const toggleEvent = e as MdToggleEvent;
        if (!toggleEvent.detail.checked) {
          const viewMarkdownCommand = this.commands.get('viewMarkdown');
          if (viewMarkdownCommand && viewMarkdownCommand.execute) {
            viewMarkdownCommand.execute();
          }
        }
      });
    }
  }

  private setupGridListeners(): void {
    const grid = this.container.querySelector('.table-grid');
    const label = this.container.querySelector('.table-grid-label');
    if (!grid || !label) return;

    const cells = grid.querySelectorAll<HTMLElement>('.grid-cell');

    const highlight = (rows: number, cols: number) => {
      cells.forEach((cell) => {
        const r = Number(cell.dataset.row);
        const c = Number(cell.dataset.col);
        cell.classList.toggle('highlighted', r <= rows && c <= cols);
      });
      label.textContent = `${rows} × ${cols}`;
    };

    const reset = () => {
      cells.forEach((cell) => cell.classList.remove('highlighted'));
      label.textContent = 'Insert table';
    };

    cells.forEach((cell) => {
      cell.addEventListener('mouseover', () => {
        highlight(Number(cell.dataset.row), Number(cell.dataset.col));
      });
      cell.addEventListener('click', () => {
        const rows = Number(cell.dataset.row);
        const cols = Number(cell.dataset.col);
        this.tableInsertHandler?.(rows, cols);
        this.closeAllPopovers();
        reset();
      });
    });

    grid.addEventListener('mouseleave', reset);
  }

  private setupLinkListeners(): void {
    const input = this.container.querySelector<HTMLInputElement>('.link-input');
    const submit = this.container.querySelector<HTMLButtonElement>('.link-submit');
    if (!input || !submit) return;

    const apply = () => {
      const url = input.value.trim();
      if (url) this.linkHandler?.(url);
      input.value = '';
      this.closeAllPopovers();
    };

    submit.addEventListener('click', (e) => {
      e.preventDefault();
      apply();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        apply();
      }
    });
  }

  private setupDismissListeners(): void {
    this.documentClickHandler = (e: Event) => {
      if (!this.hasOpenPopover()) return;
      const insideMenu = e
        .composedPath()
        .some((el) => el instanceof HTMLElement && el.classList.contains('toolbar-menu'));
      if (!insideMenu) this.closeAllPopovers();
    };
    document.addEventListener('click', this.documentClickHandler, true);

    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.hasOpenPopover()) {
        this.closeAllPopovers();
        this.view.focus();
      }
    };
    document.addEventListener('keydown', this.keydownHandler, true);
  }

  /** Open the link popover (e.g. from the Mod-k keyboard shortcut). */
  openLinkPopover(): void {
    this.openPopover('link');
  }

  // Collapse lower-priority tools into the overflow menu when the toolbar is too
  // narrow to show everything on one row.
  private setupOverflow(): void {
    this.toolbarEl = this.container.querySelector('.prosemirror-editor-toolbar');
    if (!this.toolbarEl) return;
    this.resizeObserver = new ResizeObserver(() => this.updateOverflow());
    this.resizeObserver.observe(this.container);
    this.updateOverflow();
  }

  private updateOverflow(): void {
    const toolbar = this.toolbarEl;
    if (!toolbar) return;

    // Always measure in the expanded state, then collapse if the content
    // overflows. Both happen in one synchronous frame, so the intermediate
    // expanded state never paints (no flicker) and the decision can't get stuck.
    toolbar.classList.remove('is-compact');
    if (toolbar.scrollWidth > toolbar.clientWidth + 1) {
      toolbar.classList.add('is-compact');
    }
  }

  private handlePopoverTrigger(name: string): void {
    // The table trigger swaps between insert (grid) and in-table editing menus.
    const target = name === 'table' ? (this.inTable ? 'table-edit' : 'table-insert') : name;
    const panel = this.getPanel(target);
    if (!panel) return;

    if (panel.classList.contains('is-open')) {
      this.closeAllPopovers();
    } else {
      this.openPopover(target);
    }
  }

  private openPopover(name: string): void {
    this.closeAllPopovers();
    const panel = this.getPanel(name);
    if (!panel) return;
    panel.classList.add('is-open');

    if (name === 'link') {
      const input = panel.querySelector<HTMLInputElement>('.link-input');
      input?.focus();
    }
  }

  private getPanel(name: string): HTMLElement | null {
    return this.container.querySelector<HTMLElement>(`[data-popover-panel="${name}"]`);
  }

  private hasOpenPopover(): boolean {
    return this.container.querySelector('.toolbar-popover.is-open') !== null;
  }

  private closeAllPopovers(): void {
    this.container
      .querySelectorAll('.toolbar-popover.is-open')
      .forEach((panel) => panel.classList.remove('is-open'));
  }

  destroy(): void {
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler, true);
    }
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler, true);
    }
    this.resizeObserver?.disconnect();
    this.commands.clear();
  }
}
