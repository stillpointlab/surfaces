import type { FolderNode } from '@stillpointlab/common-format/app';

/**
 * Tasks View shared types (ADR-0014). All YAML parsing happens server-side;
 * the client only ever receives these structured shapes.
 */

/**
 * Reserved id (ADR-0014) — no manifest may declare a column with it. Since
 * ADR-0020 "unassigned" names the global backlog pool (a location, rendered
 * as the shared first column); board cards with a null column are the
 * per-board needs-attention bucket, not "unassigned".
 */
export const UNASSIGNED_COLUMN_ID = 'unassigned';

/**
 * A card-kind id. Kinds are per-manifest data (`SharedTaskKindDescriptor`),
 * so ids are open strings — validity is a parse-time question, not a
 * compile-time union. Kind is derived from a card's folder, never from
 * frontmatter.
 */
export type SharedTaskCardKind = string;

/**
 * One card-kind registry entry: a kind a board or the pool can hold. The
 * resolved manifest carries the full list in display order — detection, card
 * assembly, and the client all iterate it rather than importing constants.
 * Declared in the manifest's `kinds:` block; the built-in list is the default
 * when the block is absent.
 */
export interface SharedTaskKindDescriptor {
  /** Slug; the kind identity on cards, API bodies, and data-kind attributes. */
  id: SharedTaskCardKind;
  /** Display name. */
  label: string;
  /**
   * Collapsed pool-card badge text — explicit per kind so no two kinds need
   * share a letter (spike vs spec).
   */
  badge: string;
  /** Folder name inside a phase (and the pool): `briefs`, `specs`, `spikes`. */
  dir: string;
  /** Whether boards offer a "+ New <kind>" creation flow. */
  creatable: boolean;
  /**
   * Repo-relative template path; must exist in the synced tree when declared.
   * A creatable kind without one creates cards from a frontmatter stub.
   */
  template?: string;
}

/**
 * The built-in kind registry, in display order — resolved into a parsed
 * manifest that declares no `kinds:` block of its own, and the fallback for
 * surfaces that must work without a parseable manifest (instance labeling).
 */
export const BUILTIN_TASK_KINDS: readonly SharedTaskKindDescriptor[] = [
  { id: 'spike', label: 'Spike', badge: 's', dir: 'spikes', creatable: true },
  { id: 'brief', label: 'Brief', badge: 'b', dir: 'briefs', creatable: true },
  { id: 'spec', label: 'Spec', badge: 'sp', dir: 'specs', creatable: false },
  /** Full-feature adversarial reviews — hardening + seams between features. */
  { id: 'review', label: 'Review', badge: 'r', dir: 'reviews', creatable: true },
  /** Release test plans: the 99% cases walked by hand, not exhaustive edges. */
  { id: 'test', label: 'Test', badge: 't', dir: 'tests', creatable: true },
];

/** The registry entry for a kind id; undefined when the id isn't declared. */
export function taskKindById(
  kinds: readonly SharedTaskKindDescriptor[],
  id: SharedTaskCardKind
): SharedTaskKindDescriptor | undefined {
  return kinds.find((kind) => kind.id === id);
}

/** Reserved backlog-pool folder under the tasks root; never a board (ADR-0020). */
export const UNASSIGNED_DIR = 'unassigned';

/** Pool priority-list filename inside the unassigned folder (ADR-0020). */
export const POOL_ORDER_FILE = 'order.yaml';

/** One workflow column declared in `tasks.yaml`. */
export interface SharedTasksManifestColumn {
  /** Slug, unique within the manifest; `unassigned` is reserved. */
  id: string;
  label: string;
  description?: string;
  /** Optional workflow-stage tag (unused until agent integration lands). */
  stage?: string;
}

/**
 * A parsed-and-normalized `tasks.yaml` manifest (defaults applied). Marks a
 * connected repo as Tasks-View-ready and drives board rendering.
 */
export interface SharedTasksManifest {
  version: 1;
  columns: SharedTasksManifestColumn[];
  /** Frontmatter key holding a task's column id. */
  frontmatterKey: 'column' | 'status';
  /**
   * The resolved kind registry in display order, templates attached — from
   * the `kinds:` manifest block, or the built-in list when it is absent.
   */
  kinds: SharedTaskKindDescriptor[];
  /** Column id newly created briefs land in; defaults to the first column. */
  defaultColumn: string;
  /** Column id meaning "completed" (close-phase sweeps); defaults to the last column. */
  doneColumn: string;
  /** Current stage/phase pointer — repo-held view state (ADR-0020). */
  current?: {
    stage: number;
    phase: number;
  };
  /** Declared tag registry the card tag UI offers and validates against. */
  tags: string[];
}

/**
 * One board-settings operation on the manifest (spec tasks_edit). Every op
 * is a byte-preserving textual rewrite through the user's draft. Ids are
 * immutable through app surfaces (ADR-0028 decision 5) — no op carries an id
 * change, a kind `dir`, or a `template`. For update ops, an empty-string
 * `description` clears the key.
 */
export type SharedTaskManifestEditOp =
  | { op: 'add-column'; id: string; label: string; description?: string }
  | { op: 'update-column'; id: string; label?: string; description?: string }
  | { op: 'remove-column'; id: string }
  | { op: 'set-default-column'; id: string }
  | { op: 'set-done-column'; id: string }
  | { op: 'add-kind'; id: string; label?: string; badge?: string }
  | { op: 'update-kind'; id: string; label?: string; badge?: string; creatable?: boolean }
  | { op: 'remove-kind'; id: string };

/** What a manifest edit returns: the re-parsed registry the board re-renders from. */
export interface SharedTaskManifestEditResult {
  manifest: SharedTasksManifest;
  manifestWarnings: string[];
}

/**
 * A phase board: detected in a connected repo's tree, or synthesized for a
 * stage/phase that has no folders yet — existence is not a signal; a missing
 * phase is simply an empty board (manifest_card_kinds stage 2).
 */
export interface SharedTaskBoardDescriptor {
  /** Repo-relative folder path, e.g. `docs/tasks/stage2/phase10`. */
  path: string;
  /** Human label, e.g. `Stage 2 — Phase 10`. */
  label: string;
  /** Markdown blob paths under each kind's folder, keyed by kind id ([] when absent). */
  paths: Record<string, string[]>;
  /** Parsed from a trailing `stageN/phaseM` folder shape, when it matches. */
  stage?: number;
  phase?: number;
}

/** One phase entry in the stage/phase navigation (ADR-0020). */
export interface SharedTasksNavPhase {
  phase: number;
  /** The phase's board path (resolves the canonical URL to a board). */
  path: string;
  label: string;
}

/** One stage tab in the navigation. */
export interface SharedTasksNavStage {
  stage: number;
  phases: SharedTasksNavPhase[];
}

/** Stage/phase navigation over a connection's boards (ADR-0020). */
export interface SharedTasksNav {
  /** Numerically sorted stages, each with numerically sorted phases. */
  stages: SharedTasksNavStage[];
  /** Boards whose folders don't match the stageN/phaseM shape. */
  other: { path: string; label: string }[];
}

/**
 * The global backlog pool (ADR-0020): cards under the reserved unassigned
 * folder, ordered by the order file. Connection-scoped — identical on every
 * board of the connection.
 */
export interface SharedTaskPoolState {
  /** Repo-relative pool folder path, e.g. `docs/tasks/unassigned`. */
  path: string;
  /** Repo-relative order-file path (the file may not exist yet). */
  orderPath: string;
  /**
   * Pool cards in priority order (order file, then path for unlisted).
   * Includes tracked cards — pool files with no digital good (ADR-0023).
   */
  cards: SharedTaskCard[];
  /** The order file's good, once imported/created — for the check-in list. */
  order?: {
    goodId: number;
    /** True when the user's order draft differs from the latest version. */
    changed: boolean;
  };
  /** Set when order.yaml exists but could not be parsed as a YAML list. */
  orderWarning?: string;
}

/** One swimlane row of the stage view: a phase board's cards (ADR-0020). */
export interface SharedTaskStagePhase {
  phase: number;
  path: string;
  label: string;
  cards: SharedTaskCard[];
}

/**
 * A non-card repo file with uncommitted changes that must join a check-in:
 * the tasks.yaml manifest (pointer advances, "Set current", tag registry
 * edits) or a repo-view-created folder's `.gitkeep` good (spec
 * repo_new_file_folder — stage/phase creation itself writes no scaffolding
 * since manifest_card_kinds stage 2). Without these the changes strand as
 * local drafts — the check-in selection is built from cards, which they are
 * not.
 */
export interface SharedTaskHousekeepingFile {
  goodId: number;
  path: string;
  kind: 'manifest' | 'scaffold';
}

/** Everything the stage view needs: phases as rows + the shared pool. */
export interface SharedTaskStageState {
  stage: number;
  columns: SharedTasksManifestColumn[];
  /** The manifest's resolved kind registry (badges, labels, display order). */
  kinds: SharedTaskKindDescriptor[];
  phases: SharedTaskStagePhase[];
  pool: SharedTaskPoolState;
  /** Changed non-card repo files that join a check-in (pointer/tags, new folders). */
  housekeeping: SharedTaskHousekeepingFile[];
  /** The manifest's declared tag registry (drives the filter bar). */
  tags: string[];
  /** Non-fatal tasks.yaml parse warnings (unknown keys). */
  manifestWarnings?: string[];
}

/** Everything the board page needs to render one phase board. */
export interface SharedTaskBoardState {
  board: SharedTaskBoardDescriptor;
  columns: SharedTasksManifestColumn[];
  /** Board cards, imported and tracked alike (ADR-0023). */
  cards: SharedTaskCard[];
  /** The global backlog pool, rendered as the shared first column. */
  pool: SharedTaskPoolState;
  /** Changed non-card repo files that join a check-in (pointer/tags, new folders). */
  housekeeping: SharedTaskHousekeepingFile[];
  /** The manifest's declared tag registry (drives the tag editor + filter). */
  tags: string[];
  /** Column id meaning "completed" — drives close-phase sweeps (ADR-0020). */
  doneColumn: string;
  /** Column id newly created cards land in (drives board settings). */
  defaultColumn: string;
  /**
   * The manifest's resolved kind registry (badges, labels, display order).
   * "+ New <kind>" gating derives from it: every creatable kind, folder or
   * no folder — a template-less kind creates from a frontmatter stub.
   */
  kinds: SharedTaskKindDescriptor[];
  /** Non-fatal tasks.yaml parse warnings (unknown keys). */
  manifestWarnings?: string[];
}

/**
 * A card on a task board. Either **linked** — backed by an imported digital
 * good — or **tracked**: rendered straight from the repo blob with no good at
 * all (ADR-0023 state 1), which is every in-scope file nobody has edited in
 * the app. Tracked cards are read-only: no drafts, no dirty/changed state, no
 * mutations (every card mutation is keyed by `goodId`).
 */
export interface SharedTaskCard {
  /** The imported good's id; null iff the card is tracked. */
  goodId: number | null;
  /** The imported good's public id; null iff the card is tracked. */
  goodPublicId: string | null;
  /** Set only on tracked cards — the repo blob is the whole story. */
  tracked?: true;
  title: string;
  /** Display title from the file's frontmatter `title:` key, when present. */
  frontmatterTitle?: string;
  /** Repo-relative file path (`metadata.gitOrigin.path`). */
  path: string;
  kind: SharedTaskCardKind;
  /**
   * Manifest column id. Null means needs-attention for a board card (corrupt
   * frontmatter or an undeclared column id); always null for pool cards.
   */
  column: string | null;
  /** Set when the file's frontmatter failed to parse. */
  parseError?: string;
  /** Non-fatal card problem, e.g. an undeclared or ignored `column:` value. */
  warning?: string;
  /** True when the draft's column differs from the latest version's. */
  dirty: boolean;
  /** True when the draft's content differs from the latest version's (the check-in set). */
  changed: boolean;
  /** The latest version's column when it differs (drives the check-in "old → new" list). */
  versionColumn?: string | null;
  /** Open-PR link from the last check-in that included this card. */
  checkinPrUrl?: string;
  /** Old repo path while a file move is pending (ADR-0020) — renders as a rename. */
  movedFrom?: string;
  /** Frontmatter `tags:` (present when non-empty; validated against the registry on write). */
  tags?: string[];
  /** Frontmatter `blocked:` reason (ADR-0020 metadata convention). */
  blocked?: string;
  /** Frontmatter `completed:` ISO date. */
  completed?: string;
  /** Frontmatter `pr:` number or URL. */
  pr?: string;
  /**
   * Live state for the `pr:` chip, from the tasks refresh job's cache (spec
   * task_board_refresh). Absent when unknown — a foreign-repo URL, an
   * unparseable value, or a PR no refresh has looked up yet. May be stale
   * until the next refresh; that staleness is the contract.
   */
  prState?: 'open' | 'merged' | 'closed';
  /**
   * The draft is a deliberate local change based on a version that is no
   * longer the latest — upstream moved beneath it (ADR-0020; consumed by the
   * conflict-resolution UI). Absent when a frontmatter-only, collision-free
   * divergence was auto-rebased onto the latest during resolution
   * (drift_resolution_doctrine). `'metadata'`: the divergence is confined to
   * frontmatter but could not be auto-applied (a tracked key changed on both
   * sides, or a non-tracked/unrewritable key changed) — the explicit
   * rebase-metadata resolution applies, mine-wins. `'content'`: my draft
   * edits the body (or its base is unavailable) — rebase-metadata is refused
   * by the service; resolve by hand.
   */
  diverged?: 'metadata' | 'content';
}

/**
 * One node of a synced repository tree, as detection reads it: `common`'s
 * `FolderNode`, kept under this name for the core's callers.
 */
export type TreeNode = FolderNode;
