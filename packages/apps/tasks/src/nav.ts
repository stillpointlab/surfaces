import type { SharedTaskBoardDescriptor, SharedTasksManifest, SharedTasksNav } from './types.js';

/**
 * Stage/phase navigation over a connection's boards (ADR-0020): stages become
 * tabs (numerically sorted), each holding its phases; boards whose folders
 * don't match the stageN/phaseM shape group under a flat "Boards" bucket so
 * nothing disappears from the nav.
 */
export function buildTasksNav(boards: SharedTaskBoardDescriptor[]): SharedTasksNav {
  const byStage = new Map<number, { phase: number; path: string; label: string }[]>();
  const other: { path: string; label: string }[] = [];
  for (const board of boards) {
    if (board.stage === undefined || board.phase === undefined) {
      other.push({ path: board.path, label: board.label });
      continue;
    }
    const phases = byStage.get(board.stage) ?? [];
    // Duplicate stage/phase numbers (case variants, different parents): the
    // first board wins the tab slot deterministically (detectBoards sorts by
    // path); the rest stay reachable under the flat "Boards" bucket.
    if (phases.some((p) => p.phase === board.phase)) {
      other.push({ path: board.path, label: board.path });
      continue;
    }
    phases.push({ phase: board.phase, path: board.path, label: board.label });
    byStage.set(board.stage, phases);
  }
  return {
    stages: [...byStage.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([stage, phases]) => ({ stage, phases: phases.sort((a, b) => a.phase - b.phase) })),
    other: other.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

/**
 * The board path the manifest's `current:` pointer resolves to, or null when
 * there is no pointer or its phase is not in the nav (a pointer at a
 * nonexistent phase must not offer Close/★). Shared by the SSR tasks pages
 * and the nav endpoint (spec task_board_refresh §3).
 */
export function resolveCurrentPointerPath(
  nav: SharedTasksNav,
  manifest: SharedTasksManifest
): string | null {
  const current = manifest.current;
  if (!current) return null;
  return (
    nav.stages.find((s) => s.stage === current.stage)?.phases.find((p) => p.phase === current.phase)
      ?.path ?? null
  );
}

export type DefaultBoardSelection =
  | { kind: 'phase'; stage: number; phase: number; path: string }
  | { kind: 'other'; path: string }
  | null;

/**
 * Where the bare tasks URL lands: the manifest's `current:` pointer when that
 * phase exists (repo-held view state), else the highest-numbered stage/phase,
 * else the first non-conventional board, else null (no boards at all).
 */
export function resolveDefaultBoard(
  nav: SharedTasksNav,
  manifest: SharedTasksManifest
): DefaultBoardSelection {
  const current = manifest.current;
  if (current) {
    const stage = nav.stages.find((s) => s.stage === current.stage);
    const phase = stage?.phases.find((p) => p.phase === current.phase);
    if (stage && phase) {
      return { kind: 'phase', stage: stage.stage, phase: phase.phase, path: phase.path };
    }
  }
  const lastStage = nav.stages[nav.stages.length - 1];
  const lastPhase = lastStage?.phases[lastStage.phases.length - 1];
  if (lastStage && lastPhase) {
    return { kind: 'phase', stage: lastStage.stage, phase: lastPhase.phase, path: lastPhase.path };
  }
  return nav.other.length > 0 ? { kind: 'other', path: nav.other[0].path } : null;
}
