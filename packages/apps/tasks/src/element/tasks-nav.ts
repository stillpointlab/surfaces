/// <reference lib="dom" />
/**
 * `<spl-tasks-nav>`: the stage/phase tab strip (ADR-0020, phase 7 spec
 * tasks-nav-element), moved from Context Manager's server-rendered strip with
 * its markup, classes and rules. It renders from the nav state the tasks core
 * builds (`buildTasksNav`) plus the page's selection, and asks its host to
 * create a phase or stage, set the current phase, and close a phase or stage.
 * The close dialog comes with it. Where a phase lives is the host's: the strip
 * renders the host's links and asks it to `navigate`.
 */
import '@stillpointlab/modal-dialog-component';

import { createReadyGate, reportError, requestOp } from '@stillpointlab/common-format/app';
import { defineElement } from '@stillpointlab/common-format/elements';
import { html, render } from '@stillpointlab/common-format/html';

import { navStyles } from './nav.styles';

import type { SharedTasksNav } from '../types.js';
import type { AppElement } from '@stillpointlab/common-format/app';
import type { SafeHtml } from '@stillpointlab/common-format/html';
import type { ModalDialog } from '@stillpointlab/modal-dialog-component';

/** The page's selection: a stage (and phase), or a board outside the stages. */
export interface TasksNavCurrent {
  stage: number | null;
  phase: number | null;
  /** The page shows a board from the "Boards…" bucket. */
  other: boolean;
  boardPath: string;
}

/** Everything the strip renders: the nav, the page's selection, and the pointer. */
export interface TasksNavState {
  nav: SharedTasksNav;
  current: TasksNavCurrent;
  /** `tasks.yaml`'s `current:` pointer, when it names a phase in the nav. */
  currentPointer: { stage: number; phase: number } | null;
  /** The pointer phase's board path: the close dialog's candidates come from it. */
  currentPointerPath: string | null;
  /** The column that means finished: its cards are not offered for a close. */
  doneColumn: string;
}

/** The URLs the strip renders and navigates to. They belong to the host. */
export interface TasksNavLinks {
  stage(stage: number): string;
  phase(stage: number, phase: number): string;
  /** A board from the "Boards…" bucket, by its folder path. */
  board(path: string): string;
}

/** A card the close dialog offers: an unfinished card of the pointer phase. */
export interface TasksNavCloseCandidate {
  path: string;
  title: string;
  column: string | null;
}

/** The ops the strip asks its host for. */
export type TasksNavOps = {
  /** The next phase of a stage, or the next stage at phase 1. */
  'create-stage-phase': {
    op: { kind: 'phase' | 'stage'; stage?: number };
    reply: { stage: number; phase: number };
  };
  /** Point `tasks.yaml`'s `current:` at a phase. */
  'set-current': { op: { stage: number; phase: number }; reply: object };
  /** Every card on a phase's board, for the close dialog to offer. */
  'close-candidates': { op: { path: string }; reply: { cards: TasksNavCloseCandidate[] } };
  /** Close the pointer phase or stage, bringing the named cards along. */
  close: {
    op: { kind: 'phase' | 'stage'; paths: string[] };
    reply: { target: { stage: number; phase: number }; moved: number; created?: boolean };
  };
};

/** Raised (bubbling) with `{ href }`: the strip asks the host to go to one of its links. */
export const NAVIGATE_EVENT = 'navigate';

/** Raised (bubbling, no detail) after Set current, which shows on a reload. */
export const RELOAD_REQUEST_EVENT = 'reload-request';

type NotificationType = 'info' | 'success' | 'warning' | 'error';

const closeDialogHtml = (): SafeHtml => html`
  <div slot="body">
    <p id="close-summary"></p>
    <p class="checkin-help">Unfinished cards to bring along (uncheck to leave them behind):</p>
    <ul id="close-cards" class="checkin-files"></ul>
    <p class="form-help">
      Everything stays local (pointer edit, folder creation, card moves) until you check it in.
    </p>
  </div>
  <div slot="footer">
    <button class="button button-secondary" id="cancel-close">Cancel</button>
    <button class="button button-primary" id="confirm-close">Close</button>
  </div>`;

/**
 * The tab strip. Light DOM, so a host lays it out and the options menu finds
 * its anchor; the element itself is the strip's flex row. State arrives through
 * `setState`, links through `links`; it settles once it has rendered a state.
 */
export class TasksNav extends HTMLElement implements AppElement<TasksNavState> {
  /** The URLs the strip renders; without them, stage names render as text. */
  links: TasksNavLinks | null = null;

  private state: TasksNavState | null = null;
  private readonly ready = createReadyGate(this);
  private dialogs: HTMLElement | null = null;
  private closeDialog: ModalDialog | null = null;
  private pendingCloseKind: 'phase' | 'stage' = 'phase';

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  connectedCallback(): void {
    this.addEventListener('click', this.handleClick);
    this.addEventListener('change', this.handleChange);
    this.addEventListener('options-menu-select', this.handleMenuSelect);
    this.refresh();
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.handleClick);
    this.removeEventListener('change', this.handleChange);
    this.removeEventListener('options-menu-select', this.handleMenuSelect);
    this.ready.begin();
  }

  /** The state the strip shows. */
  get navState(): TasksNavState | null {
    return this.state;
  }

  setState(state: TasksNavState): void {
    this.state = state;
    this.refresh();
  }

  private refresh(): void {
    if (!this.isConnected || !this.state) return;
    this.paint(this.stripHtml(this.state));
    this.ready.settle();
  }

  /** Replace the strip, keeping the dialogs' container last and attached. */
  private paint(content: SafeHtml): void {
    const keep = this.dialogContainer();
    for (const node of [...this.childNodes]) if (node !== keep) node.remove();
    const template = document.createElement('template');
    render(template, content);
    const style = document.createElement('style');
    style.textContent = navStyles;
    this.insertBefore(style, keep.parentNode === this ? keep : null);
    this.insertBefore(template.content, keep.parentNode === this ? keep : null);
    if (keep.parentNode !== this) this.append(keep);
  }

  private dialogContainer(): HTMLElement {
    if (!this.dialogs) {
      const container = document.createElement('div');
      container.className = 'tasks-nav-dialogs';
      const dialog = document.createElement('modal-dialog') as ModalDialog;
      dialog.id = 'close-dialog';
      dialog.setAttribute('title', 'Close phase');
      render(dialog, closeDialogHtml());
      container.append(dialog);
      dialog.querySelector('#cancel-close')!.addEventListener('click', () => dialog.close());
      dialog.querySelector('#confirm-close')!.addEventListener('click', () => this.confirmClose());
      this.dialogs = container;
      this.closeDialog = dialog;
    }
    return this.dialogs;
  }

  // ---- The strip -------------------------------------------------------------

  private stripHtml(state: TasksNavState): SafeHtml {
    const { nav, current, currentPointer } = state;
    const links = this.links;
    const isPointer = (stage: number, phase: number): boolean =>
      currentPointer !== null && currentPointer.stage === stage && currentPointer.phase === phase;

    const stageTabs = nav.stages.map((s) => {
      const active = current.stage === s.stage;
      const phaseSelect = active
        ? html`<select class="tasks-tab-filter" aria-label="Phase filter for stage ${s.stage}" data-stage="${s.stage}"><option value=""${current.phase === null ? html` selected` : html``}>All</option>${s.phases.map(
            (p) =>
              html`<option value="${p.phase}"${current.phase === p.phase ? html` selected` : html``}>Phase ${p.phase}${isPointer(s.stage, p.phase) ? ' ★' : ''}</option>`
          )}<option value="__new__">+ New phase</option></select>`
        : html``;
      const name = links
        ? html`<a class="tasks-tab-link" href="${links.stage(s.stage)}">Stage ${s.stage}</a>`
        : html`<span class="tasks-tab-link">Stage ${s.stage}</span>`;
      return html`<span class="tasks-tab ${active ? 'is-active' : ''}">${name}${phaseSelect}</span>`;
    });

    const otherSelect =
      nav.other.length > 0
        ? html`<span class="tasks-tab tasks-tab--other ${current.other ? 'is-active' : ''}"><select class="tasks-other-select" aria-label="Other boards"><option value=""${current.other ? html`` : html` selected`}>Boards…</option>${nav.other.map(
            (b) =>
              html`<option value="${b.path}"${current.other && current.boardPath === b.path ? html` selected` : html``}>${b.label}</option>`
          )}</select></span>`
        : html``;

    const closeButton = currentPointer
      ? html`<button type="button" class="tasks-nav-button tasks-close" aria-haspopup="true" title="Close the current phase or stage — the pointer advances, optionally sweeping unfinished cards along (local until check-in)">Close…</button>`
      : html``;

    // Only nav-listed phases get Set current: a gap phase still renders by URL
    // (ADR-0027) but the pointer refuses it.
    const phaseListed = nav.stages.some(
      (s) => s.stage === current.stage && s.phases.some((p) => p.phase === current.phase)
    );
    const pointerControl =
      current.stage !== null && current.phase !== null && isPointer(current.stage, current.phase)
        ? html`<span class="tasks-current-marker" title="This is the current phase (tasks.yaml current:)">★ current</span>`
        : current.phase !== null && phaseListed
          ? html`<button type="button" class="tasks-nav-button tasks-set-current" data-stage="${current.stage}" data-phase="${current.phase}" title="Make this the current phase (writes current: into tasks.yaml — local until check-in)">Set current</button>`
          : html``;

    return html`${stageTabs}<button type="button" class="tasks-nav-button tasks-new-stage" title="Create the next stage">+ stage</button>${otherSelect}${closeButton}${pointerControl}`;
  }

  // ---- Controls ----------------------------------------------------------------

  private handleClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || !this.state || button.closest('.tasks-nav-dialogs')) return;
    if (button.classList.contains('tasks-new-stage')) {
      void this.createStagePhase('stage');
    } else if (button.classList.contains('tasks-set-current')) {
      const stage = Number(button.dataset.stage ?? '0');
      const phase = Number(button.dataset.phase ?? '0');
      if (stage && phase) void this.setCurrent(stage, phase);
    } else if (button.classList.contains('tasks-close')) {
      // One Close… button: the host's options menu picks phase or stage and
      // answers on this element.
      this.dispatchEvent(
        new CustomEvent('open-options-menu', {
          detail: {
            items: [
              { id: 'close-phase', label: 'Close phase' },
              { id: 'close-stage', label: 'Close stage' },
            ],
            anchor: button,
          },
          bubbles: true,
          composed: true,
        })
      );
    }
  };

  private handleChange = (event: Event): void => {
    const select = event.target as HTMLSelectElement;
    const state = this.state;
    if (!state || !(select instanceof HTMLSelectElement)) return;
    if (select.classList.contains('tasks-tab-filter')) {
      const stage = Number(select.dataset.stage ?? '0');
      if (select.value === '__new__') {
        // "+ New phase" is an action, not a selection: the select snaps back
        // to the phase the page shows while the create runs.
        select.value = state.current.phase === null ? '' : String(state.current.phase);
        if (stage > 0) void this.createStagePhase('phase', stage);
        return;
      }
      if (!this.links || stage <= 0) return;
      this.navigate(
        select.value === ''
          ? this.links.stage(stage)
          : this.links.phase(stage, Number(select.value))
      );
    } else if (select.classList.contains('tasks-other-select')) {
      if (select.value === '' || !this.links) return;
      this.navigate(this.links.board(select.value));
    }
  };

  private handleMenuSelect = (event: Event): void => {
    const { itemId } = (event as CustomEvent<{ itemId: string }>).detail;
    if (itemId === 'close-phase') void this.openClose('phase');
    else if (itemId === 'close-stage') void this.openClose('stage');
  };

  private notify(message: string, type: NotificationType): void {
    this.dispatchEvent(
      new CustomEvent('notification', {
        detail: { message, type },
        bubbles: true,
        composed: true,
      })
    );
  }

  private navigate(href: string): void {
    this.dispatchEvent(
      new CustomEvent(NAVIGATE_EVENT, { detail: { href }, bubbles: true, composed: true })
    );
  }

  private async createStagePhase(kind: 'phase' | 'stage', stage?: number): Promise<void> {
    const res = await requestOp<TasksNavOps, 'create-stage-phase'>(this, {
      type: 'create-stage-phase',
      kind,
      ...(stage !== undefined ? { stage } : {}),
    });
    if (!res.ok) {
      reportError('Failed to create the stage/phase', res);
      this.notify(res.message || 'Could not create it.', 'error');
      return;
    }
    this.notify(
      `Created stage ${res.stage} / phase ${res.phase} — local until check-in.`,
      'success'
    );
    if (this.links) this.navigate(this.links.phase(res.stage, res.phase));
  }

  private async setCurrent(stage: number, phase: number): Promise<void> {
    const res = await requestOp<TasksNavOps, 'set-current'>(this, {
      type: 'set-current',
      stage,
      phase,
    });
    if (!res.ok) {
      reportError('Failed to set the current phase', res);
      this.notify(res.message || 'Could not set the current phase.', 'error');
      return;
    }
    this.notify('Current phase updated — local until check-in.', 'success');
    this.dispatchEvent(new CustomEvent(RELOAD_REQUEST_EVENT, { bubbles: true, composed: true }));
  }

  // ---- The close dialog ----------------------------------------------------------

  /**
   * Offer the pointer phase's unfinished cards, every one checked: a card in
   * any column but the done one, needs-attention included, so nothing is left
   * behind silently.
   */
  private async openClose(kind: 'phase' | 'stage'): Promise<void> {
    const state = this.state;
    const dialog = this.closeDialog;
    const pointer = state?.currentPointer;
    if (!state || !dialog || !pointer) return;
    this.pendingCloseKind = kind;
    dialog.setAttribute('title', kind === 'phase' ? 'Close phase' : 'Close stage');
    const target =
      kind === 'phase'
        ? `stage ${pointer.stage} / next phase`
        : `stage ${pointer.stage + 1} / phase 1`;
    dialog.querySelector('#close-summary')!.textContent =
      `Closes stage ${pointer.stage} / phase ${pointer.phase}: the current pointer advances to ${target} (created if it doesn't exist yet).`;

    const list = dialog.querySelector<HTMLElement>('#close-cards')!;
    render(list, html`<li>Loading…</li>`);
    const res = await requestOp<TasksNavOps, 'close-candidates'>(this, {
      type: 'close-candidates',
      path: state.currentPointerPath ?? '',
    });
    if (!res.ok) {
      render(list, html`<li>Could not load the phase board.</li>`);
    } else {
      const unfinished = res.cards.filter((card) => card.column !== state.doneColumn);
      render(
        list,
        unfinished.length === 0
          ? html`<li>No unfinished cards — clean close.</li>`
          : html`${unfinished.map(
              (card) => html`
                <li>
                  <label class="checkin-file-option">
                    <input type="checkbox" data-path="${card.path}" checked />
                    <span><code>${card.path}</code> <span class="checkin-change">${card.column ?? 'needs attention'}</span></span>
                  </label>
                </li>`
            )}`
      );
    }
    dialog.open();
  }

  private confirmClose(): void {
    const dialog = this.closeDialog;
    if (!dialog) return;
    const paths = [...dialog.querySelectorAll<HTMLInputElement>('#close-cards input:checked')].map(
      (input) => input.dataset.path ?? ''
    );
    const kind = this.pendingCloseKind;
    dialog.close();
    void (async () => {
      const res = await requestOp<TasksNavOps, 'close'>(this, { type: 'close', kind, paths });
      if (!res.ok) {
        reportError('Failed to close the phase/stage', res);
        this.notify(res.message || 'Could not close it.', 'error');
        return;
      }
      this.notify(
        `Closed — pointer now at stage ${res.target.stage} / phase ${res.target.phase}` +
          `${res.created ? ' (created)' : ''}, ${res.moved} card(s) moved. Local until check-in.`,
        'success'
      );
      if (this.links) this.navigate(this.links.phase(res.target.stage, res.target.phase));
    })();
  }
}

defineElement('spl-tasks-nav', TasksNav);

declare global {
  interface HTMLElementTagNameMap {
    'spl-tasks-nav': TasksNav;
  }
}
