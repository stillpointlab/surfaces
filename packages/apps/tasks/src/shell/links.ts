/**
 * The shell's links and the strip's state: tasks' pages under a host's base,
 * and what a page embeds beside its state, read defensively. DOM-free. A base
 * is joined as text, never parsed as a `URL`: Context Manager's is a path, the
 * local host's a fragment (`#/app/docs/tasks/tasks.yaml`).
 */
import { pageHref } from '@stillpointlab/common-format/app';

import { tasksPages } from '../pages.js';

import type { TasksNavCurrent, TasksNavLinks, TasksNavState } from '../element/tasks-nav.js';
import type { TasksNavProjection } from '../projection.js';

/** A page's path, from the module's pages, so the links follow them. */
const pagePath = (matches: (path: string) => boolean): string =>
  tasksPages.find((page) => matches(page.path))!.path;

/** `''`: the landing, which takes `?path=` for a board outside the convention. */
const LANDING = pagePath((path) => path === '');
/** `/stage/:stage`: one stage's phases. */
const STAGE_PAGE = pagePath((path) => path.endsWith('/:stage'));
/** `/stage/:stage/phase/:phase`: one phase's board. */
const PHASE_PAGE = pagePath((path) => path.endsWith('/:phase'));

/** The strip's links under `base`. */
export function tasksLinks(base: string): TasksNavLinks {
  return {
    stage: (stage) => pageHref(base, STAGE_PAGE, { stage: String(stage) }),
    phase: (stage, phase) =>
      pageHref(base, PHASE_PAGE, { stage: String(stage), phase: String(phase) }),
    board: (path) => pageHref(base, LANDING, {}, { path }),
  };
}

/** The landing page under `base`: where the app goes when it has nowhere better. */
export function landingHref(base: string): string {
  return pageHref(base, LANDING);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Whether a value has the nav projection's shape, as far as the strip reads it. */
function isNavProjection(value: unknown): value is TasksNavProjection {
  return (
    isObject(value) &&
    isObject(value.nav) &&
    Array.isArray(value.nav.stages) &&
    Array.isArray(value.nav.other)
  );
}

/** The strip's state in a page's `extras.nav`, or `null` when it has none of the right shape. */
export function navStateOf(extras: Record<string, unknown> | undefined): TasksNavState | null {
  const nav = extras?.nav;
  if (!isNavProjection(nav) || !isObject((nav as { current?: unknown }).current)) return null;
  return nav as TasksNavState;
}

/** The folder boards go in, as a page names it (`''`: the repository root). */
export function docsRootOf(extras: Record<string, unknown> | undefined): string {
  return typeof extras?.docsRoot === 'string' ? extras.docsRoot : '';
}

/** A nav read through `project`, or `null` when it is not one. */
export function asNavProjection(state: unknown): TasksNavProjection | null {
  return isNavProjection(state) ? state : null;
}

/** The view a page shows, as far as the shell tells them apart. */
export type TasksShellView =
  { type: 'board'; path: string } | { type: 'stage'; stage: number } | null;

/**
 * The selection a view stands for, for a strip the page gave no selection: a
 * stage, a listed phase, or a board outside the stages.
 */
export function currentOf(view: TasksShellView, nav: TasksNavProjection): TasksNavCurrent {
  if (view === null) return { stage: null, phase: null, other: false, boardPath: '' };
  if (view.type === 'stage') {
    return { stage: view.stage, phase: null, other: false, boardPath: '' };
  }
  for (const stage of nav.nav.stages) {
    const phase = stage.phases.find((candidate) => candidate.path === view.path);
    if (phase) {
      return { stage: stage.stage, phase: phase.phase, other: false, boardPath: view.path };
    }
  }
  return { stage: null, phase: null, other: true, boardPath: view.path };
}

/**
 * Whether a fresh nav leaves the page with nothing to show, so the app goes
 * back to its landing (Context Manager's rule after a refresh): the empty state,
 * which a refresh may have filled, or a stage the nav no longer has phases for.
 * A phase's board always stays: a phase the nav lost shows as an empty board.
 */
export function leavesPage(view: TasksShellView, nav: TasksNavProjection): boolean {
  if (view === null) return true;
  if (view.type !== 'stage') return false;
  const stage = nav.nav.stages.find((candidate) => candidate.stage === view.stage);
  return !stage || stage.phases.length === 0;
}
