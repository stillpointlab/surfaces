/**
 * The tasks app's pages (the app contract's `AppPage`), under the app's base:
 *
 *   ''                     the landing: the `current:` pointer's phase, else the
 *                          highest; `?path=` is an old link to a board
 *   /stage/:stage          one stage's phases as rows
 *   /stage/:stage/phase/:phase   one phase's board
 *
 * Each page projects the nav first: the tab strip renders from it beside the
 * board (as `extras.nav`, with the page's selection), and the landing chooses
 * from it. The URLs, titles and rules are Context Manager's at 8fa439ba. Where
 * it threw a not-found error (no nav to project) or answered 400 (a parameter
 * its schema refused), a page here answers `{ notFound: true }`. A redirect is
 * joined as text, `base` then a sub-path then a query, so a base that is a
 * fragment keeps it.
 */
import { resolveDefaultBoard } from './nav.js';

import type { TasksNavProjection } from './projection.js';
import type { SharedTaskBoardState, SharedTasksManifest, SharedTaskStageState } from './types.js';
import type { AppPage, AppPageInput, AppPageResolution } from '@stillpointlab/common-format/app';

/** The longest board path a landing's `?path=` takes. */
export const TASKS_PAGE_PATH_MAX_LENGTH = 1024;

/** The strip's selection: the tab and phase a page shows, or the board outside the convention. */
export interface TasksNavCurrent {
  stage: number | null;
  phase: number | null;
  other: boolean;
  boardPath: string;
}

/** What a page embeds beside the state: the strip's state, and the folder boards go in. */
export type TasksPageExtras = {
  nav: TasksNavProjection & { current: TasksNavCurrent };
  /** The manifest's folder (`''` at the root), which the empty state names. */
  docsRoot: string;
};

/**
 * A stage or phase number in a page's URL, read as `parseInt` reads it (so
 * `3x` is 3, as Context Manager's page took it), or `null` when that is not a
 * positive integer.
 */
export function tasksPageNumber(param: string | undefined): number | null {
  const value = parseInt(param ?? '', 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

const NOT_FOUND = { notFound: true } as const;

/** The instance's nav, or `null` when it has none (its manifest is gone or broken). */
async function navOf(input: AppPageInput): Promise<TasksNavProjection | null> {
  return (await input.project({ type: 'nav' })) as TasksNavProjection | null;
}

function docsRootOf(manifestPath: string): string {
  return manifestPath.includes('/') ? manifestPath.slice(0, manifestPath.lastIndexOf('/')) : '';
}

function extrasOf(
  input: AppPageInput,
  nav: TasksNavProjection,
  current: TasksNavCurrent
): TasksPageExtras {
  return { nav: { ...nav, current }, docsRoot: docsRootOf(input.manifestPath) };
}

/** The document title: a board's label, a stage's number, or the app's name for the empty state. */
function title(state: object | null): string {
  if (!state) return 'Tasks';
  if ('phases' in state) return `Stage ${(state as SharedTaskStageState).stage} — Tasks`;
  return `${(state as SharedTaskBoardState).board.label} — Tasks`;
}

async function resolveLanding(input: AppPageInput): Promise<AppPageResolution> {
  const legacyPath = input.query.path;
  if (legacyPath !== undefined && legacyPath.length > TASKS_PAGE_PATH_MAX_LENGTH) return NOT_FOUND;
  const nav = await navOf(input);
  if (!nav) return NOT_FOUND;
  if (legacyPath !== undefined) {
    // An old link to a phase's board goes to the phase's page, for good; a
    // board outside the stage/phase convention has no page of its own, and
    // shows here under the strip's "Boards".
    for (const stage of nav.nav.stages) {
      const phase = stage.phases.find((candidate) => candidate.path === legacyPath);
      if (phase) {
        return {
          redirect: `${input.base}/stage/${stage.stage}/phase/${phase.phase}`,
          permanent: true,
        };
      }
    }
    return {
      view: { type: 'board', path: legacyPath },
      extras: extrasOf(input, nav, {
        stage: null,
        phase: null,
        other: true,
        boardPath: legacyPath,
      }),
    };
  }
  // The pointer is all of the manifest the landing reads, and the nav carries it.
  const landing = resolveDefaultBoard(nav.nav, {
    current: nav.currentPointer ?? undefined,
  } as SharedTasksManifest);
  if (landing === null) {
    // Not reached while a bare manifest still gets an empty stage1/phase1:
    // kept so that a change there shows the empty state instead of not
    // found. With no phase there, the strip must not offer to close one.
    const bare = { ...nav, currentPointer: null, currentPointerPath: null };
    return {
      view: null,
      extras: extrasOf(input, bare, { stage: null, phase: null, other: false, boardPath: '' }),
    };
  }
  return landing.kind === 'phase'
    ? { redirect: `${input.base}/stage/${landing.stage}/phase/${landing.phase}` }
    : { redirect: `${input.base}?path=${encodeURIComponent(landing.path)}` };
}

export const tasksPages: readonly AppPage[] = [
  {
    path: '',
    resolve: resolveLanding,
    title,
    emptyWhenMissing: false,
  },
  {
    // A stage the nav does not have, or with no phases, projects nothing: the
    // host answers not found.
    path: '/stage/:stage',
    resolve: async (input) => {
      const stage = tasksPageNumber(input.params.stage);
      if (stage === null) return NOT_FOUND;
      const nav = await navOf(input);
      if (!nav) return NOT_FOUND;
      return {
        view: { type: 'stage', stage },
        extras: extrasOf(input, nav, { stage, phase: null, other: false, boardPath: '' }),
      };
    },
    title,
    emptyWhenMissing: false,
  },
  {
    path: '/stage/:stage/phase/:phase',
    resolve: async (input) => {
      const stage = tasksPageNumber(input.params.stage);
      const phase = tasksPageNumber(input.params.phase);
      if (stage === null || phase === null) return NOT_FOUND;
      const nav = await navOf(input);
      if (!nav) return NOT_FOUND;
      // A phase the nav does not have still shows, as an empty board at the
      // path the convention gives it: a gap between phases stays reachable.
      const docsRoot = docsRootOf(input.manifestPath);
      const conventional = `${docsRoot === '' ? '' : `${docsRoot}/`}stage${stage}/phase${phase}`;
      const path =
        nav.nav.stages
          .find((candidate) => candidate.stage === stage)
          ?.phases.find((candidate) => candidate.phase === phase)?.path ?? conventional;
      return {
        view: { type: 'board', path },
        extras: extrasOf(input, nav, { stage, phase, other: false, boardPath: path }),
      };
    },
    title,
    emptyWhenMissing: false,
  },
];
