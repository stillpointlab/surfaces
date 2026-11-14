/// <reference lib="dom" />

// <host-file-tree>: the local host's explorer. It shows the paths it is given,
// marks some of them, and raises an event for what the person did. It loads
// nothing, changes nothing and owns no menu: `tree-menu` asks the host for one.
//
// The rows live in a shadow root, so the page's styles cannot reach them and the
// events are composed. The element is its own scroll container: the page sizes it
// (a height, or a flex or grid cell with `min-height: 0`) and it scrolls inside.
// The list fills it, so the space under the rows is the tree's own to right-click.
//
// Rows render with `html` and `render`, and only where they can be seen: a closed
// folder's children are not in the DOM. Opening a folder renders its group;
// selecting a row only changes attributes, so the clicked row is never replaced
// and the native double click fires.

import '@stillpointlab/spl-icon-component';
import { defineElement } from '@stillpointlab/common-format/elements';
import { html, render, type SafeHtml } from '@stillpointlab/common-format/html';

import { buildModel, expandable, kindOf, type RowKind, type TreeMark } from './tree-model';
import { treeStyles } from './tree.styles';

import type { FolderNode } from '@stillpointlab/common-format/app';

export type { RowKind, TreeMark } from './tree-model';

export interface FileTreeElement extends HTMLElement {
  setNodes(nodes: readonly FolderNode[], marks?: Readonly<Record<string, TreeMark>>): void;
  /** The selected path. Setting it selects without raising an event. */
  selected: string | null;
  /** The open folders' paths. The host may store and restore them. */
  openPaths: readonly string[];
  /** Open every folder above the path, select it and scroll it into view. */
  reveal(path: string): void;
}

/** `tree-select` and `tree-activate`. */
export interface TreeEventDetail {
  path: string;
  kind: RowKind;
}
export interface TreeToggleDetail extends TreeEventDetail {
  open: boolean;
}
export interface TreeMenuDetail extends TreeEventDetail {
  x: number;
  y: number;
}

const STATUS = new Map<string, readonly [letter: string, word: string]>([
  ['changed', ['M', 'Changed']],
  ['new', ['N', 'New']],
  ['moved', ['R', 'Moved']],
  ['deleted', ['D', 'Deleted']],
]);

const KEYS = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter']);

const ITEM = '[role="treeitem"]';

export class HostFileTree extends HTMLElement implements FileTreeElement {
  private model = buildModel([]);
  private open = new Set<string>();
  private cursor: string | null = null;
  /** The rendered rows by path: only the ones in the DOM. */
  private readonly rows = new Map<string, HTMLElement>();
  private readonly list: HTMLUListElement;
  private selectedRow: HTMLElement | null = null;
  private tabbableRow: HTMLElement | null = null;
  /** A menu key raised the menu; the browser's own `contextmenu` for it is dropped. */
  private keyMenu = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = treeStyles;
    this.list = document.createElement('ul');
    this.list.className = 'tree';
    this.list.setAttribute('role', 'tree');
    this.list.setAttribute('aria-label', 'Files');
    shadow.append(style, this.list);
    shadow.addEventListener('click', this.onClick);
    shadow.addEventListener('dblclick', this.onDoubleClick);
    shadow.addEventListener('contextmenu', this.onContextMenu);
    shadow.addEventListener('keydown', (event) => this.onKeydown(event as KeyboardEvent));
    shadow.addEventListener('pointerdown', () => (this.keyMenu = false));
  }

  // ---- the host's API ----

  setNodes(nodes: readonly FolderNode[], marks: Readonly<Record<string, TreeMark>> = {}): void {
    const next = buildModel(nodes, marks);
    if (next.signature === this.model.signature) return;
    this.model = next;
    for (const path of this.open) {
      const entry = next.entries.get(path);
      if (!entry || !expandable(entry, next.marks.get(path))) this.open.delete(path);
    }
    this.renderAll();
  }

  get selected(): string | null {
    return this.cursor;
  }

  set selected(path: string | null) {
    this.cursor = path;
    this.syncCursor();
  }

  get openPaths(): readonly string[] {
    return [...this.open];
  }

  set openPaths(paths: readonly string[]) {
    this.open = new Set(paths);
    this.renderAll();
  }

  reveal(path: string): void {
    for (let cut = path.indexOf('/'); cut > 0; cut = path.indexOf('/', cut + 1)) {
      this.setOpen(path.slice(0, cut), true);
    }
    this.selected = path;
    const row = this.rows.get(path);
    if (row) scrollToRow(row);
  }

  // ---- rendering ----

  private renderAll(): void {
    const active = this.shadowRoot?.activeElement?.closest<HTMLElement>(ITEM);
    const scroll = this.scrollTop;
    this.rows.clear();
    render(this.list, html`${this.rowsUnder('')}`);
    this.index(this.list);
    this.syncCursor();
    this.scrollTop = scroll;
    // A row that had focus is a new element now: give focus back to the same path,
    // or to the tree's tab stop when that row is gone.
    if (active)
      (this.rows.get(active.dataset.path!) ?? this.tabbableRow)?.focus({ preventScroll: true });
  }

  private rowsUnder(parent: string): SafeHtml[] {
    return this.model.entries.get(parent)!.children.map((path) => this.row(path));
  }

  private row(path: string): SafeHtml {
    const entry = this.model.entries.get(path)!;
    const mark = this.model.marks.get(path);
    const kind = kindOf(entry, mark);
    const opens = expandable(entry, mark);
    const isOpen = opens && this.open.has(path);
    const app = mark?.app;
    const status = mark?.status === undefined ? undefined : STATUS.get(mark.status);
    return html`<li role="treeitem" data-path="${path}" data-kind="${kind}" aria-level="${entry.depth}" aria-selected="false" tabindex="-1"${opens ? html` aria-expanded="${String(isOpen)}"` : ''}><div class="row" title="${path}"><span class="twisty" aria-hidden="true"></span>${
      app
        ? html`<spl-icon class="app-icon" icon-name="${app.icon}" data-size="small" data-padding="none" aria-hidden="true" inert></spl-icon>`
        : ''
    }<span class="name" dir="auto">${app ? app.label : entry.name}</span>${
      app?.unlocked
        ? html`<span class="unlocked" title="Unlocked: this app's files are listed, and changes to them skip its rules">unlocked</span>`
        : ''
    }${
      status
        ? html`<span class="status" data-status="${mark!.status}" title="${status[1]}">${status[0]}</span>`
        : this.model.rolledUp.has(path)
          ? html`<span class="dot" title="Holds changes"></span>`
          : ''
    }<button type="button" class="menu" tabindex="-1" aria-label="Options" aria-haspopup="menu">⋯</button></div>${
      opens ? html`<ul role="group">${isOpen ? this.rowsUnder(path) : ''}</ul>` : ''
    }</li>`;
  }

  /** Record the rows rendered under `root` and give each its indent. */
  private index(root: Element): void {
    for (const row of root.querySelectorAll<HTMLElement>(ITEM)) {
      this.rows.set(row.dataset.path!, row);
      row.style.setProperty('--depth', String(Number(row.getAttribute('aria-level')) - 1));
    }
  }

  /** Put `aria-selected` and the one `tabindex="0"` where the cursor is. */
  private syncCursor(): void {
    const row = this.cursor === null ? undefined : this.rows.get(this.cursor);
    if (this.selectedRow !== row) {
      this.selectedRow?.setAttribute('aria-selected', 'false');
      row?.setAttribute('aria-selected', 'true');
      this.selectedRow = row ?? null;
    }
    // The selected row when it is shown, else the first: Tab always enters in one stop.
    const tabbable = row ?? this.list.querySelector<HTMLElement>(ITEM);
    if (this.tabbableRow !== tabbable) {
      this.tabbableRow?.setAttribute('tabindex', '-1');
      tabbable?.setAttribute('tabindex', '0');
      this.tabbableRow = tabbable;
    }
  }

  /** Open or close a folder; true when it changed. Raises `tree-toggle`. */
  private setOpen(path: string, open: boolean): boolean {
    const entry = this.model.entries.get(path);
    if (!entry || !expandable(entry, this.model.marks.get(path))) return false;
    if (this.open.has(path) === open) return false;
    if (open) this.open.add(path);
    else this.open.delete(path);
    const row = this.rows.get(path);
    const group = row?.lastElementChild;
    if (row && group?.localName === 'ul') {
      row.setAttribute('aria-expanded', String(open));
      for (const child of group.querySelectorAll<HTMLElement>(ITEM)) {
        this.rows.delete(child.dataset.path!);
      }
      render(group, open ? html`${this.rowsUnder(path)}` : html``);
      if (open) this.index(group);
      this.syncCursor();
    }
    this.emit('tree-toggle', path, { open });
    return true;
  }

  // ---- what the person does ----

  private moveTo(row: Element | null | undefined, focus = true): void {
    if (!(row instanceof HTMLElement)) return;
    const path = row.dataset.path!;
    const changed = path !== this.cursor;
    this.selected = path;
    if (focus) {
      row.focus({ preventScroll: true });
      scrollToRow(row);
    }
    if (changed) this.emit('tree-select', path);
  }

  private onClick = (event: Event): void => {
    const target = event.target as Element;
    const row = target.closest('.row')?.parentElement;
    if (!row) return;
    const path = row.dataset.path!;
    row.focus({ preventScroll: true });
    const button = target.closest('.menu');
    if (button) {
      const box = button.getBoundingClientRect();
      this.emit('tree-menu', path, { x: box.left, y: box.bottom });
      return;
    }
    this.moveTo(row, false);
    if (this.kind(path) === 'folder' || target.closest('.twisty')) {
      this.setOpen(path, !this.open.has(path));
    }
  };

  private onDoubleClick = (event: Event): void => {
    const target = event.target as Element;
    const path = target.closest('.row')?.parentElement?.dataset.path;
    if (path === undefined || target.closest('.menu')) return;
    if (this.kind(path) !== 'folder') this.emit('tree-activate', path);
  };

  private onContextMenu = (event: Event): void => {
    event.preventDefault();
    if (this.keyMenu) {
      this.keyMenu = false;
      return;
    }
    const path = (event.target as Element).closest('.row')?.parentElement?.dataset.path ?? '';
    const { clientX: x, clientY: y } = event as MouseEvent;
    this.emit('tree-menu', path, { x, y });
  };

  private onKeydown = (event: KeyboardEvent): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      const row = (event.target as Element).closest<HTMLElement>(ITEM);
      if (!row) return;
      event.preventDefault();
      this.keyMenu = true;
      const box = row.firstElementChild!.getBoundingClientRect();
      this.emit('tree-menu', row.dataset.path!, { x: box.left, y: box.bottom });
      return;
    }
    if (!KEYS.has(event.key) || event.shiftKey) return;
    const rows = [...this.list.querySelectorAll<HTMLElement>(ITEM)];
    if (rows.length === 0) return;
    event.preventDefault();
    const index = this.selectedRow ? rows.indexOf(this.selectedRow) : -1;
    const current = rows[index];
    const path = current?.dataset.path;
    if (!current || path === undefined) {
      this.moveTo(rows[0]);
      return;
    }
    const isOpen = current.getAttribute('aria-expanded');
    switch (event.key) {
      case 'ArrowDown':
        return this.moveTo(rows[Math.min(index + 1, rows.length - 1)]);
      case 'ArrowUp':
        return this.moveTo(rows[Math.max(index - 1, 0)]);
      case 'Home':
        return this.moveTo(rows[0]);
      case 'End':
        return this.moveTo(rows[rows.length - 1]);
      case 'ArrowRight':
        // Open a closed folder; on an open one, step to its first child.
        if (isOpen === 'false') this.setOpen(path, true);
        else if (isOpen === 'true') this.moveTo(current.lastElementChild?.firstElementChild);
        return;
      case 'ArrowLeft':
        // Close an open folder; otherwise step to the parent.
        if (isOpen === 'true') this.setOpen(path, false);
        else this.moveTo(current.parentElement?.closest(ITEM));
        return;
      case 'Enter':
        if (this.kind(path) === 'folder') this.setOpen(path, isOpen === 'false');
        else this.emit('tree-activate', path);
    }
  };

  private kind(path: string): RowKind {
    return kindOf(this.model.entries.get(path), this.model.marks.get(path));
  }

  private emit(type: string, path: string, extra: object = {}): void {
    const detail = { path, kind: this.kind(path), ...extra };
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
  }
}

/** Scroll the row's own line into view, not the open folder below it. */
function scrollToRow(row: HTMLElement): void {
  // jsdom has no scrollIntoView; a browser always does.
  row.firstElementChild?.scrollIntoView?.({ block: 'nearest' });
}

defineElement('host-file-tree', HostFileTree);

declare global {
  interface HTMLElementTagNameMap {
    'host-file-tree': HostFileTree;
  }
}
