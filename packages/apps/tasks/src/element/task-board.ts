/// <reference lib="dom" />
import { createReadyGate, reportError, requestOp } from '@stillpointlab/common-format/app';
import { defineElement } from '@stillpointlab/common-format/elements';
import { enablePointerDrag } from '@stillpointlab/common-format/pointer-drag';

import { taskKindById } from '../types.js';

import { boardStyles } from './board.styles';

import type {
  SharedTaskBoardState,
  SharedTaskCard,
  SharedTaskHousekeepingFile,
  SharedTaskKindDescriptor,
  SharedTaskPoolState,
  SharedTaskStageState,
} from '../types.js';
import type { AppElement } from '@stillpointlab/common-format/app';

// Max gap between two clicks on the same card to count as a double-click
// (open the good's editor). render() replaces the node, so native dblclick
// can't fire — same manual detection as folder-tree/repo-tree.
const DOUBLE_CLICK_MS = 400;

// Drop-target id for the pool column ('unassigned' is a reserved manifest id,
// but a distinct sentinel keeps column moves and file moves unmistakable).
const POOL_COLUMN_ID = '__pool__';

/**
 * The ops the board asks its host for (ADR-0037): each names the card by its
 * repo path, never by a host id, and each reply is what the host's endpoint
 * answers. A failure carries the endpoint's error code and message.
 */
export type TaskBoardOps = {
  move: { op: { path: string; column: string | null }; reply: { card: SharedTaskCard } };
  'move-file': {
    op: { path: string; target: { pool: true } | { boardPath: string; column: string } };
    reply: { card: SharedTaskCard };
  };
  'reorder-pool': { op: { paths: string[] }; reply: { pool: SharedTaskPoolState } };
  resolve: {
    op: { path: string; mode: 'take-latest' | 'rebase-metadata' };
    reply: { card: SharedTaskCard };
  };
  'scan-references': { op: { path: string }; reply: { references: string[] } };
  'fix-references': {
    op: { path: string; referencingPaths: string[] };
    reply: { fixed: number };
  };
  'read-file': { op: { path: string }; reply: { content: string } };
  'refresh-stage': { op: { stage: number }; reply: { stage: SharedTaskStageState } };
};

/** The `checkin-request` event's detail: everything with an uncommitted change. */
export interface TaskBoardCheckinRequest {
  boardPath: string;
  boardLabel: string;
  /** Set on the stage view: check-in scope is every phase of the stage. */
  stage: number | null;
  /** Changed cards as the state carries them (never tracked ones: they have no local work). */
  cards: SharedTaskCard[];
  /** The pool's order file when its draft changed (ADR-0020). */
  orderFile: { path: string } | null;
  /** Changed non-card repo files (manifest pointer/tags, repo-view new folders). */
  housekeeping: SharedTaskHousekeepingFile[];
}

/**
 * Kanban board over a phase folder's briefs/tasks (ADR-0014). Light-DOM (like
 * folder-tree) so drag-and-drop works across one composed tree. State arrives
 * through `setState` / `setStageState`; the board settles (`whenReady`) once it
 * has rendered some.
 *
 * Transport-blind (ADR-0037): moving a card (drag, or the per-card ⋯ "Move to"
 * menu — the keyboard/touch fallback) asks the host for a `move` op by path,
 * and the host's answer is the server's card. The UI moves optimistically and
 * settles on (or rolls back to) that answer. Errors surface via a bubbling
 * `notification` event for the host page.
 */
export class TaskBoard extends HTMLElement implements AppElement<SharedTaskBoardState> {
  private state: SharedTaskBoardState | null = null;

  private readonly ready = createReadyGate(this);

  /** Cards (by path) with a column move in flight — a second drag is dropped (M11). */
  private pendingColumnMoves = new Set<string>();

  /** File moves/reorders mutate whole lists; strictly one at a time (M11). */
  private listMutationInFlight = false;
  /** Stage view (ADR-0020): set instead of `state` when variant="stage". */
  private stageState: SharedTaskStageState | null = null;
  private variant: 'board' | 'stage' = 'board';
  private selectedPath: string | null = null;
  private lastSelectPath: string | null = null;
  private lastSelectAt = 0;
  private pendingMenuPath: string | null = null;
  private disposeDrag: (() => void) | null = null;
  /** Tags toggled OFF in the filter bar (plus NO_TAGS for untagged cards). */
  private hiddenTags = new Set<string>();

  /**
   * The Unassigned pool panel collapsed away (spec board_chrome_tidy).
   * Presentation only — persisted per instance so the choice survives
   * reloads; while collapsed, the ⋯ menu's pool moves remain the path.
   */
  private poolCollapsed = false;
  /** Open read-only preview of a tracked file, if any (ADR-0023). */
  private trackedPreview: { path: string; content: string | null } | null = null;

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  connectedCallback(): void {
    this.variant = this.getAttribute('variant') === 'stage' ? 'stage' : 'board';
    this.poolCollapsed = this.readPoolCollapsed();
    this.render();
    this.addEventListener('click', this.handleClick);
    this.addEventListener('options-menu-select', this.handleMenuSelect);
    // Delegated on the persistent host element, so re-renders keep working.
    this.disposeDrag = enablePointerDrag(this, {
      // Tracked cards drag too: the drop links the file first (ADR-0023
      // state 1 → 2 — the edit is what imports it), then the move proceeds.
      itemSelector: '.board-card',
      // Pool CARDS are targets too: dropping on one inserts before it
      // (within-pool reorder) or files a board card into the pool there.
      targetSelector: '.board-card--pool, .board-column',
      onDrop: (item, target) => {
        if (!this.hasState()) return;
        // Tracked and linked cards alike: the host links a tracked file as
        // part of answering the op (ADR-0023 state 1 → 2, ADR-0037).
        const path = item.getAttribute('data-path');
        if (path === null) return;
        const fromPool = item.getAttribute('data-pool-card') === '1';
        const act = (run: (cardPath: string) => Promise<void>): void => {
          void run(path);
        };

        if (target.classList.contains('board-card--pool')) {
          // Ordering is by PATH (order.yaml is a path list), so tracked cards
          // reorder without linking, and a tracked neighbour is a valid
          // "insert before me" anchor.
          const beforePath = target.getAttribute('data-path');
          if (fromPool) void this.reorderPool(path, beforePath);
          else act((cardPath) => this.moveCardFile(cardPath, { pool: true }));
          return;
        }

        const columnId = target.getAttribute('data-column-id');
        if (columnId === null) return;
        if (columnId === POOL_COLUMN_ID) {
          if (fromPool)
            void this.reorderPool(path, null); // drop on empty space → end
          else act((cardPath) => this.moveCardFile(cardPath, { pool: true }));
          return;
        }
        // Stage mode: columns carry their row's board path — a drop on
        // another row is a FILE move; same row is a column move (ADR-0020).
        const targetRow = target.getAttribute('data-board-path');
        const sourceRow = fromPool ? null : this.rowPathOf(path);
        if (fromPool) {
          const boardPath = targetRow ?? this.state?.board.path;
          if (boardPath === undefined || boardPath === null) return;
          act((cardPath) => this.moveCardFile(cardPath, { boardPath, column: columnId }));
        } else if (targetRow !== null && sourceRow !== null && targetRow !== sourceRow) {
          act((cardPath) =>
            this.moveCardFile(cardPath, { boardPath: targetRow, column: columnId })
          );
        } else {
          act((cardPath) => this.moveCard(cardPath, columnId));
        }
      },
    });
  }

  disconnectedCallback(): void {
    this.disposeDrag?.();
    this.disposeDrag = null;
    this.ready.begin();
  }

  /** The current board state (board variant; null on the stage variant). */
  get boardState(): SharedTaskBoardState | null {
    return this.state;
  }

  /** Replace the board state and re-render (used by refresh / later specs). */
  setState(state: SharedTaskBoardState): void {
    this.notifyReplacedCheckinPr(
      this.state ? [...this.state.cards, ...this.state.pool.cards] : null,
      [...state.cards, ...state.pool.cards]
    );
    this.state = state;
    this.render();
  }

  /** Replace the stage state and re-render (stage variant). */
  setStageState(state: SharedTaskStageState): void {
    this.notifyReplacedCheckinPr(
      this.stageState
        ? [...this.stageState.phases.flatMap((p) => p.cards), ...this.stageState.pool.cards]
        : null,
      [...state.phases.flatMap((p) => p.cards), ...state.pool.cards]
    );
    this.stageState = state;
    this.render();
  }

  /**
   * A card whose check-in PR chip silently changed means a second check-in
   * replaced the shared gitCheckin — the earlier, still-open PR just lost its
   * tracking. Losers deserve a signal, not a vanished badge (review L14).
   */
  private notifyReplacedCheckinPr(prev: SharedTaskCard[] | null, next: SharedTaskCard[]): void {
    if (!prev) return;
    const prevPrByPath = new Map(
      prev.filter((c) => c.checkinPrUrl).map((c) => [c.path, c.checkinPrUrl])
    );
    const replaced = next.find((c) => {
      const old = prevPrByPath.get(c.path);
      return old !== undefined && c.checkinPrUrl !== undefined && c.checkinPrUrl !== old;
    });
    if (replaced) {
      this.notify(
        `A new check-in PR now tracks “${replaced.frontmatterTitle ?? replaced.title}” — the earlier PR is superseded.`,
        'warning'
      );
    }
  }

  private escape(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    // textContent→innerHTML covers & < > only; the quotes matter because
    // escape() is interpolated into double-quoted attribute positions
    // (title=, data-*, href) with repo-file-derived values.
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Frontmatter `pr:` — a link when it's a URL, a plain chip otherwise. With a
   * cached `prState` (spec task_board_refresh) the chip wears the state as a
   * class + title; without one it renders exactly as before.
   */
  private metaPrBadge(card: SharedTaskCard): string {
    if (!card.pr) return '';
    const label = /^\d+$/.test(card.pr) ? `#${card.pr}` : 'PR';
    const stateClass = card.prState ? ` card-badge--meta-pr-${card.prState}` : '';
    const stateSuffix = card.prState ? ` — ${card.prState}` : '';
    return /^https?:\/\//.test(card.pr)
      ? `<a class="card-badge card-badge--meta-pr${stateClass}" href="${this.escape(card.pr)}" target="_blank" rel="noopener" title="Pull request${stateSuffix}">${label}</a>`
      : `<span class="card-badge card-badge--meta-pr${stateClass}" title="Pull request ${this.escape(card.pr)}${stateSuffix}">${this.escape(label)}</span>`;
  }

  private baseName(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1);
  }

  /** All board cards across the current view (one board, or every row). */
  private allCards(): SharedTaskCard[] {
    if (this.variant === 'stage') {
      return (this.stageState?.phases ?? []).flatMap((p) => p.cards);
    }
    return this.state?.cards ?? [];
  }

  private poolState(): SharedTaskPoolState | null {
    return this.state?.pool ?? this.stageState?.pool ?? null;
  }

  private columnDefs(): { id: string; label: string }[] {
    return this.state?.columns ?? this.stageState?.columns ?? [];
  }

  private tagRegistry(): string[] {
    return this.state?.tags ?? this.stageState?.tags ?? [];
  }

  /** The manifest's resolved kind registry (display order). */
  private kindDefs(): SharedTaskKindDescriptor[] {
    return this.state?.kinds ?? this.stageState?.kinds ?? [];
  }

  /** Registry position of a kind — drives the index-keyed card accent. */
  private kindIndexOf(kind: string): number {
    return this.kindDefs().findIndex((k) => k.id === kind);
  }

  /** Collapsed pool-badge text for a kind (first letter when undeclared). */
  private kindBadgeOf(kind: string): string {
    return taskKindById(this.kindDefs(), kind)?.badge ?? kind.slice(0, 1);
  }

  /** The swimlane row (board path) a card currently lives on, in stage mode. */
  private rowPathOf(path: string | null): string | null {
    if (path === null) return null;
    for (const phase of this.stageState?.phases ?? []) {
      if (phase.cards.some((c) => c.path === path)) return phase.path;
    }
    return null;
  }

  private hasState(): boolean {
    return this.state !== null || this.stageState !== null;
  }

  /**
   * Cards whose check-in job is currently running. Their (stale) PR chip
   * would otherwise keep pointing at the PREVIOUS check-in for the seconds-
   * to-tens-of-seconds the job takes — the walk's chip-lag finding
   * (2026-08-27) — so it renders as a pending chip instead until the page's
   * terminal handler clears the set and refreshes.
   */
  private checkinInFlightPaths = new Set<string>();

  /** Mark the submitted cards' chips (by path) pending while their check-in job runs. */
  markCheckinInFlight(paths: string[]): void {
    this.checkinInFlightPaths = new Set(paths);
    this.render();
  }

  /** Drop the pending state (call on the job's terminal event, any outcome). */
  clearCheckinInFlight(): void {
    if (this.checkinInFlightPaths.size === 0) return;
    this.checkinInFlightPaths.clear();
    this.render();
  }

  /** The card's check-in chip: pending while its job runs, else the PR link. */
  private checkinChip(card: SharedTaskCard): string {
    if (!card.tracked && this.checkinInFlightPaths.has(card.path)) {
      return '<span class="card-badge card-badge--checkin-pending" title="Check-in in progress — the pull request is being opened">PR…</span>';
    }
    return card.checkinPrUrl
      ? `<a class="card-badge card-badge--pr" href="${this.escape(card.checkinPrUrl)}" target="_blank" rel="noopener" title="Checked in — view pull request">PR</a>`
      : '';
  }

  /** Monotonic issue-order for refreshStage: only the newest may settle. */
  private stageRefreshSeq = 0;

  /**
   * Re-fetch the whole stage state after a mutation (stage mode settles
   * hard). Sequenced like the page's refreshBoard: concurrent refreshes
   * resolve in arbitrary order (stage reads can hit GitHub on cache misses),
   * and a stale slow response must not clobber a newer settle.
   */
  private async refreshStage(): Promise<void> {
    if (!this.stageState) return;
    const seq = ++this.stageRefreshSeq;
    const res = await requestOp<TaskBoardOps, 'refresh-stage'>(this, {
      type: 'refresh-stage',
      stage: this.stageState.stage,
    });
    if (seq !== this.stageRefreshSeq) return; // superseded by a newer refresh
    if (res.ok) {
      this.stageState = res.stage;
      this.render();
    }
  }

  /** Sentinel for the filter bar's "no tags" entry. */
  private static readonly NO_TAGS = '(no tags)';

  /** Show/hide tag filter: a card hides when any of its tags is hidden. */
  private isVisible(card: SharedTaskCard): boolean {
    if (this.hiddenTags.size === 0) return true;
    const tags = card.tags ?? [];
    if (tags.length === 0) return !this.hiddenTags.has(TaskBoard.NO_TAGS);
    return !tags.some((tag) => this.hiddenTags.has(tag.toLowerCase()));
  }

  private cardsIn(columnId: string | null): SharedTaskCard[] {
    return (this.state?.cards ?? []).filter((c) => c.column === columnId && this.isVisible(c));
  }

  /** Tags offered by the filter bar: registry order, then unknown tags in use. */
  private tagsInUse(): string[] {
    const all = [...this.allCards(), ...(this.poolState()?.cards ?? [])];
    const used = new Set(all.flatMap((c) => (c.tags ?? []).map((tag) => tag.toLowerCase())));
    const registry = this.tagRegistry().filter((tag) => used.has(tag.toLowerCase()));
    const known = new Set(registry.map((tag) => tag.toLowerCase()));
    const unknown = [...used].filter((tag) => !known.has(tag)).sort();
    return [...registry, ...unknown];
  }

  /**
   * The check-in set: board + pool cards whose draft differs from their
   * version. Tracked cards can never be in it — they have no local work to
   * check in (ADR-0023).
   */
  private changedCards(): SharedTaskCard[] {
    return [...this.allCards(), ...(this.poolState()?.cards ?? [])].filter(
      (c) => c.changed && !c.tracked
    );
  }

  /** Changed non-card repo files (manifest pointer/tags, repo-view new folders). */
  private housekeeping(): SharedTaskHousekeepingFile[] {
    return this.state?.housekeeping ?? this.stageState?.housekeeping ?? [];
  }

  /**
   * Everything with an uncommitted change — cards, housekeeping files, the
   * pool order — drives the toolbar's change count and Check-in button. A
   * close-phase pointer advance or a pool reorder must surface the button
   * even when no card changed.
   */
  private changedCount(): number {
    return (
      this.changedCards().length +
      this.housekeeping().length +
      (this.poolState()?.order?.changed === true ? 1 : 0)
    );
  }

  private findCard(path: string): { card: SharedTaskCard; fromPool: boolean } | null {
    const onBoard = this.allCards().find((c) => c.path === path);
    if (onBoard) return { card: onBoard, fromPool: false };
    const inPool = this.poolState()?.cards.find((c) => c.path === path);
    return inPool ? { card: inPool, fromPool: true } : null;
  }

  /**
   * Reorder within the pool: place the card at `movingPath` before the card
   * at `beforePath` (or at the end with null). Everything is keyed by path —
   * order.yaml is a path list, so tracked cards (no good) reorder exactly
   * like linked ones, on both sides of the drop (ADR-0023). Optimistic;
   * settles on the server's fresh pool state.
   */
  private async reorderPool(movingPath: string, beforePath: string | null): Promise<void> {
    if (this.listMutationInFlight) {
      this.notify('Another move is still in flight — one at a time.', 'info');
      return;
    }
    this.listMutationInFlight = true;
    try {
      await this.reorderPoolLatched(movingPath, beforePath);
    } finally {
      this.listMutationInFlight = false;
    }
  }

  private async reorderPoolLatched(movingPath: string, beforePath: string | null): Promise<void> {
    const pool = this.poolState();
    if (!pool) return;
    const cards = pool.cards;
    const moving = cards.find((c) => c.path === movingPath);
    if (!moving || moving.path === beforePath) return;
    const rest = cards.filter((c) => c.path !== movingPath);
    let index = beforePath === null ? rest.length : rest.findIndex((c) => c.path === beforePath);
    if (index < 0) index = rest.length;
    const next = [...rest.slice(0, index), moving, ...rest.slice(index)];
    if (next.map((c) => c.path).join(',') === cards.map((c) => c.path).join(',')) return;

    const previous = cards;
    pool.cards = next;
    this.render();

    const res = await requestOp<TaskBoardOps, 'reorder-pool'>(this, {
      type: 'reorder-pool',
      paths: next.map((c) => c.path),
    });
    if (!this.hasState()) return;
    // The state object may have been replaced mid-flight (a board refresh);
    // rolling back into the dead object would be a silent no-op — and
    // touching the LIVE object would clobber fresher data (M11).
    if (this.poolState() !== pool) return;
    if (!res.ok) {
      pool.cards = previous;
      this.render();
      reportError('Failed to reorder the backlog', res);
      this.notify(res.message || 'Could not reorder the backlog.', 'error');
      return;
    }
    if (this.state) this.state.pool = res.pool;
    else if (this.stageState) this.stageState.pool = res.pool;
    this.render();
  }

  /**
   * FILE move (ADR-0020): pool ↔ phase relocation. Optimistic across the two
   * lists, settling on the server card (which carries the new path).
   */
  private async moveCardFile(
    path: string,
    target: { pool: true } | { boardPath: string; column: string }
  ): Promise<void> {
    // File moves snapshot and mutate whole lists — strictly serialized, or a
    // failure rollback would revert another move's optimistic render (M11).
    if (this.listMutationInFlight) {
      this.notify('Another move is still in flight — one at a time.', 'info');
      return;
    }
    this.listMutationInFlight = true;
    try {
      await this.moveCardFileLatched(path, target);
    } finally {
      this.listMutationInFlight = false;
    }
  }

  private async moveCardFileLatched(
    path: string,
    target: { pool: true } | { boardPath: string; column: string }
  ): Promise<void> {
    // Stage mode: no optimistic surgery across rows — request, then settle on
    // a full stage refresh (the simple-and-correct v1; flagged in the spec).
    if (this.variant === 'stage') {
      const res = await requestOp<TaskBoardOps, 'move-file'>(this, {
        type: 'move-file',
        path,
        target,
      });
      if (!res.ok) {
        reportError('Failed to move the card', res);
        this.notify(res.message || 'Could not move the card.', 'error');
        return;
      }
      await this.refreshStage();
      void this.offerReferenceFix(res.card.path);
      return;
    }

    if (!this.state) return;
    const found = this.findCard(path);
    if (!found) return;
    const prevCards = [...this.state.cards];
    const prevPool = [...this.state.pool.cards];

    if (found.fromPool) {
      if ('pool' in target) return;
      this.state.pool.cards = this.state.pool.cards.filter((c) => c.path !== path);
      this.state.cards.push({ ...found.card, column: target.column, changed: true });
    } else {
      if (!('pool' in target)) return; // cross-board moves are the stage view's
      this.state.cards = this.state.cards.filter((c) => c.path !== path);
      this.state.pool.cards.push({ ...found.card, column: null, changed: true });
    }
    this.render();

    const res = await requestOp<TaskBoardOps, 'move-file'>(this, {
      type: 'move-file',
      path,
      target,
    });
    if (!this.state) return;
    if (!res.ok) {
      this.state.cards = prevCards;
      this.state.pool.cards = prevPool;
      this.render();
      reportError('Failed to move the card', res);
      const message =
        res.code === 'DRAFT_SAVE_IN_PROGRESS'
          ? 'That file is being edited right now — try again in a moment.'
          : res.message || 'Could not move the card.';
      this.notify(message, 'error');
      return;
    }
    // The answer carries the card's new path; it replaces the optimistic
    // card, which still sits under the old one.
    const list = 'pool' in target ? this.state.pool.cards : this.state.cards;
    const index = list.findIndex((c) => c.path === path);
    if (index >= 0) list[index] = res.card;
    this.render();
    void this.offerReferenceFix(res.card.path);
  }

  /**
   * Inbound links (spec 15): after a move, offer to update files that link
   * to the old location. Opt-in — declining leaves them; they resurface on
   * the next move touching the same card.
   */
  private async offerReferenceFix(path: string): Promise<void> {
    const scan = await requestOp<TaskBoardOps, 'scan-references'>(this, {
      type: 'scan-references',
      path,
    });
    if (!scan.ok || scan.references.length === 0) return;
    const paths = scan.references;
    const shown = paths.slice(0, 5).join('\n');
    const suffix = paths.length > 5 ? `\n…and ${paths.length - 5} more` : '';
    if (
      !window.confirm(
        `${paths.length} file(s) link to the card's old location:\n${shown}${suffix}\n\nUpdate those links (local drafts until check-in)?`
      )
    ) {
      return;
    }
    const fix = await requestOp<TaskBoardOps, 'fix-references'>(this, {
      type: 'fix-references',
      path,
      referencingPaths: paths,
    });
    if (!fix.ok) {
      reportError('Failed to fix references', fix);
      this.notify(fix.message || 'Could not update the links.', 'error');
      return;
    }
    this.notify(`Updated links in ${fix.fixed} file(s).`, 'success');
    if (this.variant === 'stage') await this.refreshStage();
  }

  /**
   * Move a card to `column` (null → Unassigned): optimistic re-render, then
   * settle on the server-computed card, or roll back and toast on failure.
   */
  private async moveCard(path: string, column: string | null): Promise<void> {
    if (!this.hasState()) return;
    // One in-flight move per card: a second drag mid-request would snapshot
    // the optimistic state and the responses could settle out of order (M11).
    if (this.pendingColumnMoves.has(path)) {
      this.notify('That card has a move in flight — try again in a second.', 'info');
      return;
    }
    const card = this.allCards().find((c) => c.path === path);
    if (!card || card.column === column) return;
    this.pendingColumnMoves.add(path);
    try {
      await this.moveCardLatched(path, card, column);
    } finally {
      this.pendingColumnMoves.delete(path);
    }
  }

  private async moveCardLatched(
    path: string,
    card: SharedTaskCard,
    column: string | null
  ): Promise<void> {
    const previous = { ...card };
    card.column = column;
    card.dirty = true; // tentative; the server's card corrects it
    card.changed = true;
    card.versionColumn = previous.versionColumn ?? previous.column;
    this.render();

    const res = await requestOp<TaskBoardOps, 'move'>(this, { type: 'move', path, column });
    if (!this.hasState()) return;

    if (!res.ok) {
      Object.assign(card, previous);
      this.render();
      reportError('Failed to move task card', res);
      const message =
        res.code === 'DRAFT_SAVE_IN_PROGRESS'
          ? 'That file is being edited right now — try again in a moment.'
          : res.message || 'Could not move the card.';
      this.notify(message, 'error');
      return;
    }

    const lists = this.state
      ? [this.state.cards]
      : (this.stageState?.phases ?? []).map((p) => p.cards);
    for (const list of lists) {
      const index = list.findIndex((c) => c.path === path);
      if (index >= 0) list[index] = res.card;
    }
    this.render();
  }

  /**
   * Read-only preview of a tracked file: its bytes come from the repo file
   * endpoint (the same sha-keyed cache the board projections use), never from
   * a good — there is none. Editing it is the link-on-edit slice's job.
   */
  private async openTrackedPreview(path: string): Promise<void> {
    this.trackedPreview = { path, content: null };
    this.render();
    const res = await requestOp<TaskBoardOps, 'read-file'>(this, { type: 'read-file', path });
    // A second card opened while this one was in flight owns the modal now.
    if (this.trackedPreview?.path !== path) return;
    if (!res.ok) {
      this.trackedPreview = null;
      this.render();
      reportError('Failed to load the tracked file', res);
      this.notify(res.message || 'Could not load that file.', 'error');
      return;
    }
    this.trackedPreview = { path, content: res.content };
    this.render();
  }

  private renderTrackedPreview(): string {
    if (!this.trackedPreview) return '';
    const { path, content } = this.trackedPreview;
    const body =
      content === null
        ? '<p class="tracked-preview-loading">Loading…</p>'
        : `<pre class="tracked-preview-content">${this.escape(content)}</pre>`;
    // Edit is the link moment (ADR-0023 state 1 → 2): import this one file,
    // then land in the good editor with a draft to work on.
    const editButton =
      content === null
        ? ''
        : `<button type="button" class="tracked-preview-edit" data-action="tracked-edit" data-path="${this.escape(path)}">Edit in app</button>`;
    return `
      <div class="tracked-preview-backdrop" data-action="close-preview">
        <section class="tracked-preview" role="dialog" aria-modal="true" aria-label="${this.escape(path)}">
          <header class="tracked-preview-header">
            <span class="tracked-preview-path" title="${this.escape(path)}">${this.escape(path)}</span>
            <span class="tracked-preview-note">Tracked from the repository — read only</span>
            ${editButton}
            <button type="button" class="tracked-preview-close" data-action="close-preview" aria-label="Close preview">×</button>
          </header>
          ${body}
        </section>
      </div>`;
  }

  private notify(message: string, type: 'info' | 'success' | 'warning' | 'error'): void {
    this.dispatchEvent(
      new CustomEvent('notification', {
        detail: { message, type },
        bubbles: true,
        composed: true,
      })
    );
  }

  /**
   * A tracked card (ADR-0023 state 1): rendered straight from the repo blob,
   * with no good behind it. Deliberately inert — no drag handle (the drag util
   * skips `.board-card--tracked`), no ⋯ menu, and a click opens the read-only
   * preview instead of selecting. Editing arrives with link-on-edit.
   */
  private renderTrackedCard(card: SharedTaskCard, pool: boolean): string {
    const displayTitle = card.frontmatterTitle ?? this.baseName(card.path);
    const badges = [
      pool
        ? `<span class="card-badge card-badge--kind" title="${this.escape(card.kind)}">${this.escape(this.kindBadgeOf(card.kind))}</span>`
        : card.kind !== 'spec'
          ? `<span class="card-badge card-badge--kind-name">${this.escape(card.kind)}</span>`
          : '',
      '<span class="card-badge card-badge--tracked" title="Tracked from the repository — not imported">repo</span>',
      card.parseError
        ? `<span class="card-badge card-badge--error" title="${this.escape(card.parseError)}">!</span>`
        : '',
      card.warning
        ? `<span class="card-badge card-badge--warn" title="${this.escape(card.warning)}">⚠</span>`
        : '',
      card.blocked
        ? `<span class="card-badge card-badge--blocked" title="${this.escape(card.blocked)}">${pool ? '⛔' : 'blocked'}</span>`
        : '',
      this.metaPrBadge(card),
      card.completed
        ? `<span class="card-badge card-badge--completed" title="Completed ${this.escape(card.completed)}">✓</span>`
        : '',
    ].join('');
    const classes = `board-card board-card--tracked${pool ? ' board-card--pool' : ''}`;
    const common = `class="${classes}" data-kind="${this.escape(card.kind)}" data-kind-index="${this.kindIndexOf(card.kind)}" data-action="tracked-preview" data-path="${this.escape(card.path)}" data-tracked="1" role="button" tabindex="0"`;
    if (pool) {
      return `
      <li ${common} data-pool-card="1" title="${this.escape(card.path)}">
        <span class="card-title">${this.escape(displayTitle)}</span>
        <span class="card-pool-badges">${badges}</span>
      </li>`;
    }
    const tagChips = (card.tags ?? [])
      .map((tag) => `<span class="card-tag">${this.escape(tag)}</span>`)
      .join('');
    const pathSpan = card.frontmatterTitle
      ? `<span class="card-path" title="${this.escape(card.path)}">${this.escape(this.baseName(card.path))}</span>`
      : '';
    return `
      <li ${common}>
        <span class="card-top">
          <span class="card-title">${this.escape(displayTitle)}</span>
        </span>
        <span class="card-meta">
          ${pathSpan}${badges}
        </span>
        ${tagChips ? `<span class="card-tags">${tagChips}</span>` : ''}
      </li>`;
  }

  private renderCard(card: SharedTaskCard): string {
    if (card.tracked) return this.renderTrackedCard(card, false);
    const selected = this.selectedPath === card.path ? ' selected' : '';
    const badges = [
      // Specs are the default card kind — every other kind wears its name.
      card.kind !== 'spec'
        ? `<span class="card-badge card-badge--kind-name">${this.escape(card.kind)}</span>`
        : '',
      card.dirty
        ? '<span class="card-badge card-badge--dirty" title="Uncommitted change">●</span>'
        : '',
      card.parseError
        ? `<span class="card-badge card-badge--error" title="${this.escape(card.parseError)}">!</span>`
        : '',
      card.blocked
        ? `<span class="card-badge card-badge--blocked" title="${this.escape(card.blocked)}">blocked</span>`
        : '',
      this.divergedBadge(card),
      this.metaPrBadge(card),
      card.completed
        ? `<span class="card-badge card-badge--completed" title="Completed ${this.escape(card.completed)}">✓</span>`
        : '',
      this.checkinChip(card),
    ].join('');
    // Frontmatter title on the top line when set, filename in the meta row;
    // without one, the filename IS the top line (shown exactly once either way).
    const displayTitle = card.frontmatterTitle ?? this.baseName(card.path);
    const pathSpan = card.frontmatterTitle
      ? `<span class="card-path" title="${this.escape(card.path)}">${this.escape(this.baseName(card.path))}</span>`
      : '';
    const tagChips = (card.tags ?? [])
      .map((tag) => `<span class="card-tag">${this.escape(tag)}</span>`)
      .join('');
    return `
      <li class="board-card${selected}" data-kind="${this.escape(card.kind)}" data-kind-index="${this.kindIndexOf(card.kind)}" data-action="select" data-path="${this.escape(card.path)}" role="button" tabindex="0">
        <span class="card-top">
          <span class="card-title">${this.escape(displayTitle)}</span>
          <button type="button" class="card-menu-btn" data-action="card-menu" data-path="${this.escape(card.path)}" aria-label="Card actions" aria-haspopup="true">⋯</button>
        </span>
        <span class="card-meta">
          ${pathSpan}${badges}
        </span>
        ${tagChips ? `<span class="card-tags">${tagChips}</span>` : ''}
      </li>`;
  }

  /**
   * The ⇅ badge, worn only by divergence that survived the server's
   * auto-rebase pass (drift_resolution_doctrine): a same-key metadata
   * collision or a body-editing draft — the tooltip says which.
   */
  private divergedBadge(card: SharedTaskCard): string {
    if (!card.diverged) return '';
    const title =
      card.diverged === 'metadata'
        ? 'Upstream and your draft changed the same card fields — resolve from the card menu'
        : 'Upstream changed beneath your body-edited draft — resolve from the card menu';
    return `<span class="card-badge card-badge--diverged" title="${title}">⇅</span>`;
  }

  /** One-line collapsed pool card: title only, condensed badges (ADR-0020). */
  private renderPoolCard(card: SharedTaskCard): string {
    if (card.tracked) return this.renderTrackedCard(card, true);
    const selected = this.selectedPath === card.path ? ' selected' : '';
    const badges = [
      `<span class="card-badge card-badge--kind" title="${this.escape(card.kind)}">${this.escape(this.kindBadgeOf(card.kind))}</span>`,
      card.changed
        ? '<span class="card-badge card-badge--dirty" title="Uncommitted change">●</span>'
        : '',
      card.parseError
        ? `<span class="card-badge card-badge--error" title="${this.escape(card.parseError)}">!</span>`
        : '',
      card.warning
        ? `<span class="card-badge card-badge--warn" title="${this.escape(card.warning)}">⚠</span>`
        : '',
      card.blocked
        ? `<span class="card-badge card-badge--blocked" title="${this.escape(card.blocked)}">⛔</span>`
        : '',
      this.divergedBadge(card),
      this.checkinChip(card),
      (card.tags?.length ?? 0) > 0
        ? `<span class="card-badge card-badge--tags" title="${this.escape((card.tags ?? []).join(', '))}">#${card.tags!.length}</span>`
        : '',
    ].join('');
    const displayTitle = card.frontmatterTitle ?? this.baseName(card.path);
    return `
      <li class="board-card board-card--pool${selected}" data-pool-card="1" data-kind="${this.escape(card.kind)}" data-kind-index="${this.kindIndexOf(card.kind)}" data-action="select" data-path="${this.escape(card.path)}" role="button" tabindex="0" title="${this.escape(card.path)}">
        <span class="card-title">${this.escape(displayTitle)}</span>
        <span class="card-pool-badges">${badges}</span>
        <button type="button" class="card-menu-btn" data-action="card-menu" data-path="${this.escape(card.path)}" aria-label="Card actions" aria-haspopup="true">⋯</button>
      </li>`;
  }

  /** Collapse-state persistence: per instance, presentation only. */
  private poolCollapsedKey(): string {
    return `taskBoard.poolCollapsed.${this.getAttribute('storage-key') ?? ''}`;
  }

  private readPoolCollapsed(): boolean {
    // localStorage can throw (privacy modes); an unpersisted preference is
    // not worth surfacing anything for.
    try {
      return window.localStorage.getItem(this.poolCollapsedKey()) === '1';
    } catch {
      return false;
    }
  }

  private setPoolCollapsed(collapsed: boolean): void {
    this.poolCollapsed = collapsed;
    try {
      if (collapsed) window.localStorage.setItem(this.poolCollapsedKey(), '1');
      else window.localStorage.removeItem(this.poolCollapsedKey());
    } catch {
      // Session-only preference when storage is unavailable.
    }
    this.render();
  }

  /**
   * The toolbar's reopen affordance while the pool panel is collapsed —
   * carries the live count so the backlog stays visible at a glance.
   */
  private renderPoolToggle(): string {
    if (!this.poolCollapsed) return '';
    const count = this.poolState()?.cards.length ?? 0;
    return `<button type="button" class="board-pool-toggle" data-action="pool-expand" title="Show the Unassigned pool" aria-expanded="false">Unassigned (${count})</button>`;
  }

  /**
   * The backlog pool as a SIDEBAR flanking the whole stage section — tabs row
   * included (spec board_pool_sidebar). Rendered as a sibling ahead of
   * `.task-board`; the page grid places it (the host is display: contents).
   * Keeps the board-column classes: the drag-target contract keys off them.
   */
  private renderPoolSidebar(): string {
    if (this.poolCollapsed) return '';
    const pool = this.poolState();
    const cards = (pool?.cards ?? []).filter((c) => this.isVisible(c));
    const orderWarning = pool?.orderWarning
      ? `<p class="pool-order-warning" role="status">⚠ ${this.escape(pool.orderWarning)}</p>`
      : '';
    return `
      <aside class="board-pool-sidebar board-column board-column--pool" data-column-id="${POOL_COLUMN_ID}" aria-label="Unassigned pool">
        <header class="column-header">
          <span class="column-label">Unassigned</span>
          <span class="column-count">${cards.length}</span>
          <button type="button" class="pool-collapse" data-action="pool-collapse" title="Hide the Unassigned pool" aria-label="Hide the Unassigned pool">×</button>
        </header>
        ${orderWarning}
        <ul class="column-cards">${cards.map((c) => this.renderPoolCard(c)).join('')}</ul>
      </aside>`;
  }

  private renderColumn(
    id: string,
    label: string,
    cards: SharedTaskCard[],
    boardPath?: string
  ): string {
    const rowAttr = boardPath !== undefined ? ` data-board-path="${this.escape(boardPath)}"` : '';
    return `
      <section class="board-column" data-column-id="${this.escape(id)}"${rowAttr}>
        <header class="column-header">
          <span class="column-label">${this.escape(label)}</span>
          <span class="column-count">${cards.length}</span>
        </header>
        <ul class="column-cards">${cards.map((c) => this.renderCard(c)).join('')}</ul>
      </section>`;
  }

  private renderFilterBar(): string {
    const filterTags = this.tagsInUse();
    if (filterTags.length === 0) return '';
    return `<div class="board-filter" role="group" aria-label="Filter by tag">
        <span class="board-filter-label">Tags</span>
        ${[...filterTags, TaskBoard.NO_TAGS]
          .map((tag) => {
            const key = tag === TaskBoard.NO_TAGS ? tag : tag.toLowerCase();
            const hidden = this.hiddenTags.has(key) ? ' is-hidden' : '';
            return `<button type="button" class="board-filter-tag${hidden}" data-action="toggle-tag" data-tag="${this.escape(key)}" aria-pressed="${hidden === ''}">${this.escape(tag)}</button>`;
          })
          .join('')}
      </div>`;
  }

  /** The stage view (ADR-0020): pool rail + one swimlane row per phase. */
  private renderStage(state: SharedTaskStageState): void {
    const changed = this.changedCount();
    const summary =
      changed > 0
        ? `<span class="board-dirty-summary">${changed} uncommitted change${changed === 1 ? '' : 's'}</span>
           <button type="button" class="board-checkin" data-action="checkin">Check in</button>`
        : '';

    const rows = state.phases
      .map((phaseRow) => {
        const visible = phaseRow.cards.filter((c) => this.isVisible(c));
        if (phaseRow.cards.length === 0) {
          // Empty phases render collapsed (header only) — visible but quiet.
          return `<section class="stage-row stage-row--empty" data-phase="${phaseRow.phase}">
              <header class="stage-row-header">${this.escape(phaseRow.label)} <span class="column-count">0</span></header>
            </section>`;
        }
        const attention = visible.filter((c) => c.column === null);
        const columns = state.columns
          .map((column) =>
            this.renderColumn(
              column.id,
              column.label,
              visible.filter((c) => c.column === column.id),
              phaseRow.path
            )
          )
          .join('');
        const attentionHtml = attention.length
          ? `<div class="board-attention">
              <span class="board-attention-label">Needs attention</span>
              <ul class="column-cards board-attention-cards">${attention.map((c) => this.renderCard(c)).join('')}</ul>
            </div>`
          : '';
        return `<section class="stage-row" data-phase="${phaseRow.phase}">
            <header class="stage-row-header">${this.escape(phaseRow.label)} <span class="column-count">${visible.length}</span></header>
            <div class="board-columns board-columns--compact">${columns}</div>
            ${attentionHtml}
          </section>`;
      })
      .join('');

    this.innerHTML = `
      <style>${boardStyles}</style>
      ${this.renderPoolSidebar()}
      <div class="task-board task-board--stage">
        <div class="board-toolbar">
          ${this.renderPoolToggle()}
          <span class="board-toolbar-spacer"></span>
          ${summary}
        </div>
        ${this.renderFilterBar()}
        <div class="stage-rows">${rows}</div>
      </div>
      ${this.renderTrackedPreview()}`;
  }

  private render(): void {
    this.renderState();
    // Ready once a state is in the DOM (rendering is synchronous).
    if (this.hasState()) this.ready.settle();
  }

  private renderState(): void {
    if (this.variant === 'stage') {
      if (!this.stageState) {
        this.innerHTML = `<style>${boardStyles}</style><div class="board-empty">Could not load this stage.</div>`;
        return;
      }
      this.renderStage(this.stageState);
      return;
    }
    if (!this.state) {
      this.innerHTML = `<style>${boardStyles}</style><div class="board-empty">Could not load this board.</div>`;
      return;
    }
    // The global pool as its own panel first (ADR-0020, spec
    // board_chrome_tidy), then the manifest's columns in declared order.
    // Null-column board cards are needs-attention, not a column.
    const columns = this.state.columns
      .map((column) => this.renderColumn(column.id, column.label, this.cardsIn(column.id)))
      .join('');

    const attentionCards = this.cardsIn(null);
    const attention = attentionCards.length
      ? `<div class="board-attention">
          <span class="board-attention-label">Needs attention (corrupt or unknown column — drag to a column to fix)</span>
          <ul class="column-cards board-attention-cards">${attentionCards.map((c) => this.renderCard(c)).join('')}</ul>
        </div>`
      : '';

    const changed = this.changedCount();
    const latestPr = this.state.cards
      .filter((c) => c.checkinPrUrl)
      .map((c) => c.checkinPrUrl as string)
      .pop();
    const prChip = latestPr
      ? `<a class="board-pr" href="${this.escape(latestPr)}" target="_blank" rel="noopener" title="View the check-in pull request">PR</a>`
      : '';
    const summary =
      changed > 0
        ? `<span class="board-dirty-summary">${changed} uncommitted change${changed === 1 ? '' : 's'}</span>
           <button type="button" class="board-checkin" data-action="checkin">Check in</button>`
        : '';

    const filterBar = this.renderFilterBar();

    this.innerHTML = `
      <style>${boardStyles}</style>
      ${this.renderPoolSidebar()}
      <div class="task-board">
        <div class="board-toolbar">
          ${this.state.kinds
            // Every creatable kind, folder or no folder — a template-less
            // kind creates from a frontmatter stub (manifest_card_kinds).
            .filter((kind) => kind.creatable)
            .map(
              (kind) =>
                `<button type="button" class="board-new-card" data-action="new-card" data-kind="${this.escape(kind.id)}" data-kind-dir="${this.escape(kind.dir)}" data-kind-templated="${kind.template !== undefined ? '1' : ''}">+ New ${this.escape(kind.id)}</button>`
            )
            .join('')}
          ${this.renderPoolToggle()}
          <span class="board-toolbar-spacer"></span>
          ${prChip}${summary}
        </div>
        ${filterBar}
        <div class="board-columns">${columns}</div>
        ${attention}
      </div>
      ${this.renderTrackedPreview()}`;
  }

  /**
   * The ⋯ menu's move targets. Board cards: the other columns (frontmatter
   * move) plus the pool (FILE move). Pool cards: reorder up/down (the
   * keyboard/touch fallback for drag-reorder) plus each column (FILE move).
   */
  private moveMenuItems(card: SharedTaskCard, fromPool: boolean): { id: string; label: string }[] {
    if (!this.hasState()) return [];
    const columns = this.columnDefs();
    // Stage mode: other phases are FILE-move targets (the drag fallback).
    const rowTargets = (this.stageState?.phases ?? [])
      .filter((phaseRow) => phaseRow.path !== (fromPool ? '' : this.rowPathOf(card.path)))
      .map((phaseRow) => ({
        id: `move-row:${phaseRow.path}`,
        label: `Move to Phase ${phaseRow.phase}`,
      }));
    if (fromPool) {
      return [
        { id: 'pool-up', label: 'Move up' },
        { id: 'pool-down', label: 'Move down' },
        ...(this.variant === 'stage'
          ? rowTargets
          : columns.map((c) => ({ id: `move-file:${c.id}`, label: `Move to ${c.label}` }))),
      ];
    }
    return [
      ...columns
        .filter((c) => c.id !== card.column)
        .map((c) => ({ id: `move:${c.id}`, label: `Move to ${c.label}` })),
      ...rowTargets,
      { id: 'move-file:pool', label: 'Move to Unassigned pool' },
    ];
  }

  private handleMenuSelect = (e: Event): void => {
    const path = this.pendingMenuPath;
    this.pendingMenuPath = null;
    if (!path) return;
    const { itemId } = (e as CustomEvent).detail as { itemId: string };
    if (itemId === 'set-title') {
      const card = this.findCard(path)?.card;
      if (!card || !this.state) return;
      this.dispatchEvent(
        new CustomEvent('set-title-request', {
          detail: {
            path,
            // The title the card is SHOWING, not just the frontmatter one — a
            // card without a `title:` key displays its filename, and opening
            // the dialog empty made renaming a retype rather than an edit.
            currentTitle: card.frontmatterTitle ?? this.baseName(card.path),
            boardPath: this.state?.board.path ?? '',
          },
          bubbles: true,
          composed: true,
        })
      );
      return;
    }
    if (itemId === 'set-tags') {
      const card = this.findCard(path)?.card;
      if (!card || !this.state) return;
      this.dispatchEvent(
        new CustomEvent('set-tags-request', {
          detail: {
            path,
            currentTags: card.tags ?? [],
            registry: this.tagRegistry(),
            boardPath: this.state?.board.path ?? '',
          },
          bubbles: true,
          composed: true,
        })
      );
      return;
    }
    if (itemId === 'resolve-rebase' || itemId === 'resolve-take-latest') {
      const mode = itemId === 'resolve-rebase' ? 'rebase-metadata' : 'take-latest';
      if (mode === 'take-latest' && !window.confirm('Discard your local changes to this card?')) {
        return;
      }
      void (async () => {
        const res = await requestOp<TaskBoardOps, 'resolve'>(this, { type: 'resolve', path, mode });
        if (!res.ok) {
          reportError('Failed to resolve the card', res);
          this.notify(res.message || 'Could not resolve the card.', 'error');
          return;
        }
        if (this.variant === 'stage') {
          await this.refreshStage();
        } else if (this.state) {
          const lists = [this.state.cards, this.state.pool.cards];
          for (const list of lists) {
            const index = list.findIndex((c) => c.path === path);
            if (index >= 0) list[index] = res.card;
          }
          this.render();
        }
        this.notify(
          mode === 'take-latest' ? 'Draft discarded — showing latest.' : 'Rebased onto latest.',
          'success'
        );
      })();
      return;
    }
    if (itemId === 'pool-up' || itemId === 'pool-down') {
      const cards = this.state?.pool.cards ?? [];
      const index = cards.findIndex((c) => c.path === path);
      if (index < 0) return;
      if (itemId === 'pool-up' && index > 0) {
        void this.reorderPool(cards[index].path, cards[index - 1].path);
      } else if (itemId === 'pool-down' && index < cards.length - 1) {
        void this.reorderPool(cards[index].path, cards[index + 2]?.path ?? null);
      }
      return;
    }
    if (itemId.startsWith('move-row:')) {
      const boardPath = itemId.slice('move-row:'.length);
      const card = this.findCard(path)?.card;
      const column = card?.column ?? this.columnDefs()[0]?.id;
      if (column === undefined) return;
      void this.moveCardFile(path, { boardPath, column });
      return;
    }
    if (itemId.startsWith('move-file:')) {
      const target = itemId.slice('move-file:'.length);
      if (target === 'pool') {
        void this.moveCardFile(path, { pool: true });
        return;
      }
      if (!this.state) return;
      void this.moveCardFile(path, { boardPath: this.state.board.path, column: target });
      return;
    }
    if (!itemId.startsWith('move:')) return;
    const columnId = itemId.slice('move:'.length);
    void this.moveCard(path, columnId);
  };

  private handleClick = (e: Event): void => {
    const el = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!el || !this.hasState()) return;
    const path = el.dataset.path ?? null;

    if (el.dataset.action === 'tracked-preview') {
      void this.openTrackedPreview(el.dataset.path ?? '');
      return;
    }

    if (el.dataset.action === 'tracked-edit') {
      // Edit is the link moment (ADR-0023 state 1 → 2): the host links the
      // file and opens its editor.
      if (path) this.openCard(path);
      return;
    }

    if (el.dataset.action === 'close-preview') {
      // Only the backdrop itself closes — a click inside the panel bubbles to
      // it but must not dismiss the dialog.
      if (el.classList.contains('tracked-preview-backdrop') && e.target !== el) return;
      this.trackedPreview = null;
      this.render();
      return;
    }

    if (el.dataset.action === 'new-card') {
      if (!this.state) return; // creation lives on phase boards, not the stage view
      // The kind and its folder ride the button's data attrs — the dialog's
      // copy needs the dir, and the page holds no registry of its own.
      const kind = el.dataset.kind;
      if (!kind) return;
      this.dispatchEvent(
        new CustomEvent('brief-request', {
          detail: {
            boardPath: this.state.board.path,
            boardLabel: this.state.board.label,
            kind,
            kindDir: el.dataset.kindDir ?? `${kind}s`,
            // Template-less kinds create from a stub — the dialog copy says so.
            templated: el.dataset.kindTemplated === '1',
          },
          bubbles: true,
          composed: true,
        })
      );
      return;
    }

    if (el.dataset.action === 'pool-collapse' || el.dataset.action === 'pool-expand') {
      this.setPoolCollapsed(el.dataset.action === 'pool-collapse');
      return;
    }

    if (el.dataset.action === 'toggle-tag') {
      const tag = el.dataset.tag ?? '';
      if (this.hiddenTags.has(tag)) this.hiddenTags.delete(tag);
      else this.hiddenTags.add(tag);
      this.render();
      return;
    }

    if (el.dataset.action === 'checkin') {
      const pool = this.poolState();
      this.dispatchEvent(
        new CustomEvent('checkin-request', {
          detail: {
            boardPath: this.state?.board.path ?? '',
            boardLabel: this.state?.board.label ?? `Stage ${this.stageState?.stage}`,
            stage: this.stageState?.stage ?? null,
            cards: this.changedCards(),
            orderFile: pool?.order?.changed === true ? { path: pool.orderPath } : null,
            housekeeping: this.housekeeping(),
          } satisfies TaskBoardCheckinRequest,
          bubbles: true,
          composed: true,
        })
      );
      return;
    }

    if (el.dataset.action === 'card-menu') {
      if (!path) return;
      const found = this.findCard(path);
      if (!found) return;
      const items = [
        ...this.moveMenuItems(found.card, found.fromPool),
        { id: 'set-title', label: 'Set title…' },
        { id: 'set-tags', label: 'Tags…' },
        // Rebase applies only to metadata-only divergence (the service
        // refuses a body-editing draft, ADR-0020 spec 13): on 'content' the
        // item stays visible but disabled, with the reason on its tooltip.
        ...(found.card.diverged
          ? [
              found.card.diverged === 'content'
                ? {
                    id: 'resolve-rebase',
                    label: 'Update onto latest (keep my metadata)',
                    disabled: true,
                    title:
                      'Your draft edits the body — take latest, or keep your draft and check it in',
                  }
                : { id: 'resolve-rebase', label: 'Update onto latest (keep my metadata)' },
              { id: 'resolve-take-latest', label: 'Take latest (discard my changes)' },
            ]
          : []),
      ];
      this.pendingMenuPath = path;
      this.dispatchEvent(
        new CustomEvent('open-options-menu', {
          detail: { items, anchor: el },
          bubbles: true,
          composed: true,
        })
      );
      return;
    }

    if (el.dataset.action !== 'select' || !path) return;
    const now = Date.now();
    if (path === this.lastSelectPath && now - this.lastSelectAt < DOUBLE_CLICK_MS) {
      this.openCard(path);
      return;
    }
    this.lastSelectPath = path;
    this.lastSelectAt = now;
    this.selectedPath = path;
    this.render();
  };

  /** Ask the host to open a card's editor (it links a tracked file first). */
  private openCard(path: string): void {
    this.dispatchEvent(
      new CustomEvent('open-card', { detail: { path }, bubbles: true, composed: true })
    );
  }
}

defineElement('spl-task-board', TaskBoard);
