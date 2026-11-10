import { POOL_ORDER_FILE, UNASSIGNED_DIR } from './types.js';

import type {
  SharedTaskBoardDescriptor,
  SharedTaskCardKind,
  SharedTaskKindDescriptor,
  SharedTasksManifest,
} from './types.js';
import type { TreeNode } from './types.js';

/**
 * Board detection over a synced repo tree (ADR-0014). Every function takes
 * the manifest's resolved kind registry — folder derivation follows each
 * descriptor's `dir`. Existence is not a signal (manifest_card_kinds
 * stage 2): a directory is a board by its `stage<N>/phase<M>` name shape or
 * by holding any declared kind folder, and boards for phases with no folders
 * at all are synthesized on top (`withSynthesizedBoards`).
 */

const MARKDOWN_PATTERN = /\.(md|markdown)$/i;

function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

function joinPath(parent: string, child: string): string {
  return parent === '' ? child : `${parent}/${child}`;
}

/** A descriptor's kind-keyed card paths (boards and the pool share the shape). */
export interface KindPathsHolder {
  paths: Record<string, string[]>;
}

/** Every (path, kind) card entry of a board/pool descriptor, in kind order. */
export function kindEntriesOf(
  holder: KindPathsHolder,
  kinds: readonly SharedTaskKindDescriptor[]
): { path: string; kind: SharedTaskCardKind }[] {
  return kinds.flatMap((kind) =>
    (holder.paths[kind.id] ?? []).map((path) => ({ path, kind: kind.id }))
  );
}

/** Every card path of a board/pool descriptor, in kind order. */
export function kindPathsOf(
  holder: KindPathsHolder,
  kinds: readonly SharedTaskKindDescriptor[]
): string[] {
  return kinds.flatMap((kind) => holder.paths[kind.id] ?? []);
}

/**
 * Board membership for repo paths that are NOT in the synced tree — files the
 * app created (new briefs) that don't exist upstream yet (ADR-0014 spec 7).
 * Returns the candidates under this board's kind folders, excluding paths the
 * tree already lists, with their card kind.
 *
 * `appOnlyPaths` are the host's app-only paths (`appOnlyEligiblePaths` in
 * `git/gitMetadata.ts`): goods with no upstream baseline — app-created files
 * INCLUDING those whose check-in PR is still open or was closed unmerged (the
 * card must not vanish while its PR is in flight), and pending moves
 * (ADR-0020), whose new path isn't in the tree until the PR merges. An
 * imported good whose gitOrigin path has since moved or vanished UPSTREAM is
 * an orphan, not an app-only card — the host leaves it out, because surfacing
 * it here would put cards on boards that no longer correspond to repo files.
 */
export function appOnlyBoardPaths(
  board: Pick<SharedTaskBoardDescriptor, 'path'> & KindPathsHolder,
  kinds: readonly SharedTaskKindDescriptor[],
  appOnlyPaths: Iterable<string>
): { path: string; kind: SharedTaskCardKind }[] {
  const known = new Set(kindPathsOf(board, kinds));
  const prefixes = kinds.map((kind) => ({
    kind: kind.id,
    prefix: `${joinPath(board.path, kind.dir)}/`,
  }));
  const extra: { path: string; kind: SharedTaskCardKind }[] = [];
  for (const path of appOnlyPaths) {
    if (known.has(path) || !MARKDOWN_PATTERN.test(path)) continue;
    const match = prefixes.find(({ prefix }) => path.startsWith(prefix));
    if (match) extra.push({ path, kind: match.kind });
  }
  extra.sort((a, b) => a.path.localeCompare(b.path));
  return extra;
}

/**
 * Every directory containing all path segments of blobs and tree entries —
 * derived from both so detection survives a tree cache that omits some
 * directory entries.
 */
function collectDirectories(nodes: TreeNode[]): Set<string> {
  const dirs = new Set<string>();
  for (const node of nodes) {
    let dir = node.type === 'tree' ? node.path : dirname(node.path);
    while (dir !== '' && !dirs.has(dir)) {
      dirs.add(dir);
      dir = dirname(dir);
    }
  }
  return dirs;
}

/** Trailing `stageN/phaseM` folder shape → numbers; null when it doesn't match. */
export function parseStagePhase(
  boardPath: string,
  docsRoot: string
): { stage: number; phase: number } | null {
  const relative =
    docsRoot !== '' && boardPath.startsWith(`${docsRoot}/`)
      ? boardPath.slice(docsRoot.length + 1)
      : boardPath;
  const segments = relative.split('/');
  const phase = /^phase(\d+)$/i.exec(segments[segments.length - 1] ?? '');
  const stage = /^stage(\d+)$/i.exec(segments[segments.length - 2] ?? '');
  if (!stage || !phase) return null;
  return { stage: Number(stage[1]), phase: Number(phase[1]) };
}

/** `Stage 2 — Phase 10` for `…/stage2/phase10`; otherwise the relative path. */
function boardLabel(boardPath: string, docsRoot: string): string {
  const parsed = parseStagePhase(boardPath, docsRoot);
  if (parsed) return `Stage ${parsed.stage} — Phase ${parsed.phase}`;
  return docsRoot !== '' && boardPath.startsWith(`${docsRoot}/`)
    ? boardPath.slice(docsRoot.length + 1)
    : boardPath;
}

/** The reserved backlog-pool folder for this manifest (ADR-0020). */
export function poolPath(manifestPath: string): string {
  return joinPath(dirname(manifestPath), UNASSIGNED_DIR);
}

/** The global backlog pool detected in a synced tree (ADR-0020). */
export interface TaskPoolDescriptor extends KindPathsHolder {
  /** Repo-relative pool folder path (a convention — may not exist yet). */
  path: string;
  /** Repo-relative order-file path (the file may not exist yet). */
  orderPath: string;
}

/**
 * Detect the backlog pool: markdown blobs under the reserved unassigned
 * folder's kind subfolders. Always returns a descriptor — the pool exists as
 * a convention even when the folder does not exist in the tree yet.
 */
export function detectPool(
  nodes: TreeNode[],
  manifestPath: string,
  kinds: readonly SharedTaskKindDescriptor[]
): TaskPoolDescriptor {
  const pool = poolPath(manifestPath);
  const markdownBlobs = nodes.filter(
    (node) => node.type === 'blob' && MARKDOWN_PATTERN.test(node.path)
  );
  const under = (dir: string): string[] =>
    markdownBlobs
      .filter((node) => node.path.startsWith(`${dir}/`))
      .map((node) => node.path)
      .sort();
  return {
    path: pool,
    paths: Object.fromEntries(kinds.map((kind) => [kind.id, under(joinPath(pool, kind.dir))])),
    orderPath: joinPath(pool, POOL_ORDER_FILE),
  };
}

/**
 * Detect board-eligible folders: every directory at or below the manifest's
 * directory whose trailing path matches the `stage<N>/phase<M>` shape, or
 * that directly holds at least one declared kind folder (the unconventional
 * boards the nav's flat bucket carries). Card paths are the markdown blobs
 * (any depth) under each kind subfolder; a kind folder that is absent means
 * the kind is empty — never ineligible. The reserved pool folder is never a
 * board (ADR-0020) — without the exclusion, `unassigned/<dirs>/` would match.
 */
export function detectBoards(
  nodes: TreeNode[],
  manifestPath: string,
  kinds: readonly SharedTaskKindDescriptor[],
  appOnlyPaths?: Iterable<string>
): SharedTaskBoardDescriptor[] {
  const docsRoot = dirname(manifestPath);
  const pool = poolPath(manifestPath);
  // App-created files (new cards in a phase that has no folders upstream yet,
  // ADR-0020) contribute directories too, so such a phase is a detected board
  // — and in the nav — before its first check-in merges.
  const appNodes: TreeNode[] = [...(appOnlyPaths ?? [])].map((path) => ({
    path,
    type: 'blob',
    sha: '',
  }));
  const dirs = collectDirectories([...nodes, ...appNodes]);
  const markdownBlobs = nodes.filter(
    (node) => node.type === 'blob' && MARKDOWN_PATTERN.test(node.path)
  );

  const boards: SharedTaskBoardDescriptor[] = [];
  const candidates = [...dirs, ...(docsRoot === '' ? [''] : [])].filter(
    (dir) =>
      (dir === docsRoot || dir.startsWith(docsRoot === '' ? '' : `${docsRoot}/`)) &&
      dir !== pool &&
      !dir.startsWith(`${pool}/`)
  );

  for (const dir of candidates) {
    const kindPathIn = (kind: SharedTaskKindDescriptor): string => joinPath(dir, kind.dir);
    const stagePhase = parseStagePhase(dir, docsRoot);
    if (stagePhase === null && !kinds.some((kind) => dirs.has(kindPathIn(kind)))) continue;

    const under = (prefix: string): string[] =>
      markdownBlobs
        .filter((node) => node.path.startsWith(`${prefix}/`))
        .map((node) => node.path)
        .sort();

    boards.push({
      path: dir,
      label: boardLabel(dir, docsRoot),
      paths: Object.fromEntries(kinds.map((kind) => [kind.id, under(kindPathIn(kind))])),
      ...(stagePhase ?? {}),
    });
  }

  boards.sort((a, b) => a.path.localeCompare(b.path));
  return boards;
}

/** The conventional path of a stage/phase under the manifest's directory. */
export function stagePhasePath(docsRoot: string, stage: number, phase: number): string {
  return joinPath(docsRoot, `stage${stage}/phase${phase}`);
}

/** An empty board descriptor for a phase that has no folders (yet). */
export function synthesizeStagePhaseBoard(
  docsRoot: string,
  stage: number,
  phase: number
): SharedTaskBoardDescriptor {
  return {
    path: stagePhasePath(docsRoot, stage, phase),
    label: `Stage ${stage} — Phase ${phase}`,
    // Consumers read `paths[kind.id] ?? []`, so no per-kind keys are needed.
    paths: {},
    stage,
    phase,
  };
}

/**
 * A synthesized empty board for a requested path, when (and only when) the
 * path is exactly `<docsRoot>/stage<N>/phase<M>` — a missing phase is an
 * empty board, but arbitrary paths stay NotFound.
 */
export function synthesizeBoardForPath(
  boardPath: string,
  docsRoot: string
): SharedTaskBoardDescriptor | null {
  const prefix = docsRoot === '' ? '' : `${docsRoot}/`;
  if (!boardPath.startsWith(prefix)) return null;
  const segments = boardPath.slice(prefix.length).split('/');
  if (segments.length !== 2) return null;
  const stage = /^stage(\d+)$/i.exec(segments[0]);
  const phase = /^phase(\d+)$/i.exec(segments[1]);
  if (!stage || !phase) return null;
  return synthesizeStagePhaseBoard(docsRoot, Number(stage[1]), Number(phase[1]));
}

/**
 * Detected boards plus the phases that exist only as intent (manifest_card_
 * kinds stage 2): the manifest's `current:` pointer names a phase whether or
 * not its folders do, and a repo with no conventional boards at all is an
 * empty `stage1/phase1` — which is what lets a bare tasks.yaml bootstrap a
 * working view. Gaps between existing phases are NOT padded; those stay
 * reachable by URL only.
 */
export function withSynthesizedBoards(
  boards: SharedTaskBoardDescriptor[],
  manifest: Pick<SharedTasksManifest, 'current'>,
  manifestPath: string
): SharedTaskBoardDescriptor[] {
  const docsRoot = dirname(manifestPath);
  const synthesized: SharedTaskBoardDescriptor[] = [];
  const has = (stage: number, phase: number): boolean =>
    [...boards, ...synthesized].some((b) => b.stage === stage && b.phase === phase);

  const current = manifest.current;
  if (current && !has(current.stage, current.phase)) {
    synthesized.push(synthesizeStagePhaseBoard(docsRoot, current.stage, current.phase));
  }
  if (![...boards, ...synthesized].some((b) => b.stage !== undefined)) {
    synthesized.push(synthesizeStagePhaseBoard(docsRoot, 1, 1));
  }
  if (synthesized.length === 0) return boards;
  return [...boards, ...synthesized].sort((a, b) => a.path.localeCompare(b.path));
}
