// The ops the task board and the tab strip ask their host for, by type: what an
// element sends and what it expects back. DOM-free, so the app module and a
// host's server can name them; the elements re-export them.
import type {
  SharedTaskCard,
  SharedTaskManifestEditOp,
  SharedTaskPoolState,
  SharedTasksManifest,
  SharedTaskStageState,
} from './types.js';

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
  /** One settings change: a column or kind added, changed or removed, or a picker set. */
  'edit-manifest': {
    op: { edit: SharedTaskManifestEditOp };
    reply: { manifest: SharedTasksManifest; warnings: string[] };
  };
  /** A new card of a creatable kind, named from its title, on a board (or the pool). */
  'create-card': {
    op: { boardPath: string; title: string; kind: string };
    reply: { card: SharedTaskCard };
  };
  /** A card's frontmatter title, or `null` to remove it. */
  'set-title': { op: { path: string; title: string | null }; reply: object };
  /** A card's tags, from the registry. */
  'set-tags': { op: { path: string; tags: string[] }; reply: object };
  /** A tag added to the registry in `tasks.yaml`; the reply is the registry after it. */
  'add-tag': { op: { tag: string }; reply: { tags: string[] } };
};

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
