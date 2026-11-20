import { matchAppPage } from '@stillpointlab/common-format/app';
import { beforeEach, describe, expect, it } from 'vitest';

import { tasksPageNumber, tasksPages } from './pages.js';

import type { TasksNavProjection } from './projection.js';
import type { AppPageResolution } from '@stillpointlab/common-format/app';

// What each page resolves, over a nav the test hands it as a host's
// projection would. The cases are Context Manager's at 8fa439ba (its tasks
// web route tests and its pages test), with not found where it answered 404
// or 400, and every redirect over a path base and a fragment base.

const MANIFEST = 'docs/tasks/tasks.yaml';
const BASES = ['/apps/x', `#/app/${MANIFEST}`];

let nav: TasksNavProjection | null;
let asked: object[];

beforeEach(() => {
  nav = {
    nav: {
      stages: [
        { stage: 3, phases: [{ phase: 6, path: 'docs/tasks/stage3/phase6', label: 'Phase 6' }] },
      ],
      other: [],
    },
    currentPointer: null,
    currentPointerPath: null,
    doneColumn: 'done',
  };
  asked = [];
});

/** What the page at `subPath` answers over `base`. */
async function resolve(
  subPath: string,
  options: { query?: Record<string, string>; base?: string; manifestPath?: string } = {}
): Promise<AppPageResolution | null> {
  const match = matchAppPage(tasksPages, subPath);
  if (!match) return null;
  return match.page.resolve({
    params: match.params,
    query: options.query ?? {},
    base: options.base ?? BASES[0],
    manifestPath: options.manifestPath ?? MANIFEST,
    project: async (view) => {
      asked.push(view);
      return view.type === 'nav' ? nav : null;
    },
  });
}

describe('tasksPages: the landing', () => {
  it.each(BASES)('redirects to the highest phase over %s', async (base) => {
    expect(await resolve('', { base })).toEqual({ redirect: `${base}/stage/3/phase/6` });
    expect(asked).toEqual([{ type: 'nav' }]);
  });

  it('lands on the pointer’s phase when the nav has it', async () => {
    nav!.nav.stages[0].phases.unshift({
      phase: 5,
      path: 'docs/tasks/stage3/phase5',
      label: 'Phase 5',
    });
    nav = { ...nav!, currentPointer: { stage: 3, phase: 5 } };
    expect(await resolve('')).toEqual({ redirect: '/apps/x/stage/3/phase/5' });
    nav = { ...nav, currentPointer: { stage: 9, phase: 9 } };
    expect(await resolve('')).toEqual({ redirect: '/apps/x/stage/3/phase/6' });
  });

  it.each(BASES)('redirects an old ?path= link to a phase for good, over %s', async (base) => {
    expect(await resolve('', { base, query: { path: 'docs/tasks/stage3/phase6' } })).toEqual({
      redirect: `${base}/stage/3/phase/6`,
      permanent: true,
    });
  });

  it('shows a board outside the convention at ?path=, under the strip’s “Boards”', async () => {
    expect(await resolve('', { query: { path: 'docs/tasks/roadmap' } })).toEqual({
      view: { type: 'board', path: 'docs/tasks/roadmap' },
      extras: {
        nav: {
          ...nav,
          current: { stage: null, phase: null, other: true, boardPath: 'docs/tasks/roadmap' },
        },
        docsRoot: 'docs/tasks',
      },
    });
  });

  it.each(BASES)(
    'redirects to the first board outside the convention when there is no phase, over %s',
    async (base) => {
      nav = { ...nav!, nav: { stages: [], other: [{ path: 'docs/tasks/a b', label: 'a b' }] } };
      expect(await resolve('', { base })).toEqual({
        redirect: `${base}?path=${encodeURIComponent('docs/tasks/a b')}`,
      });
    }
  );

  it('shows the empty state, offering no close, when there is no board at all', async () => {
    nav = {
      nav: { stages: [], other: [] },
      currentPointer: { stage: 1, phase: 1 },
      currentPointerPath: null,
      doneColumn: 'done',
    };
    expect(await resolve('')).toEqual({
      view: null,
      extras: {
        nav: {
          nav: { stages: [], other: [] },
          currentPointer: null,
          currentPointerPath: null,
          doneColumn: 'done',
          current: { stage: null, phase: null, other: false, boardPath: '' },
        },
        docsRoot: 'docs/tasks',
      },
    });
  });

  it('takes a ?path= of up to 1024 characters, and answers not found past it', async () => {
    const at = 'd'.repeat(1024);
    expect(await resolve('', { query: { path: at } })).toMatchObject({
      view: { type: 'board', path: at },
    });
    asked = [];
    expect(await resolve('', { query: { path: `${at}d` } })).toEqual({ notFound: true });
    expect(asked).toEqual([]);
  });
});

describe('tasksPages: a stage and a phase', () => {
  it('shows a phase’s board with the strip’s state beside it', async () => {
    expect(await resolve('/stage/3/phase/6')).toEqual({
      view: { type: 'board', path: 'docs/tasks/stage3/phase6' },
      extras: {
        nav: {
          ...nav,
          current: { stage: 3, phase: 6, other: false, boardPath: 'docs/tasks/stage3/phase6' },
        },
        docsRoot: 'docs/tasks',
      },
    });
  });

  it('shows a phase the nav does not have as a board at its conventional path', async () => {
    expect(await resolve('/stage/3/phase/9')).toMatchObject({
      view: { type: 'board', path: 'docs/tasks/stage3/phase9' },
    });
    expect(await resolve('/stage/3/phase/9', { manifestPath: 'tasks.yaml' })).toMatchObject({
      view: { type: 'board', path: 'stage3/phase9' },
      extras: { docsRoot: '' },
    });
  });

  it('shows a stage’s phases, with the strip on the stage', async () => {
    expect(await resolve('/stage/3')).toEqual({
      view: { type: 'stage', stage: 3 },
      extras: {
        nav: { ...nav, current: { stage: 3, phase: null, other: false, boardPath: '' } },
        docsRoot: 'docs/tasks',
      },
    });
  });

  it('answers not found for a stage or phase that is not a positive number, projecting nothing', async () => {
    for (const path of [
      '/stage/x',
      '/stage/0',
      '/stage/-1',
      '/stage/3/phase/0',
      '/stage/x/phase/1',
    ]) {
      expect(await resolve(path), path).toEqual({ notFound: true });
    }
    expect(asked).toEqual([]);
  });

  it('reads a number as parseInt does, as Context Manager’s page did', () => {
    expect(tasksPageNumber('3')).toBe(3);
    expect(tasksPageNumber('3x')).toBe(3);
    expect(tasksPageNumber('1.5')).toBe(1);
    expect(tasksPageNumber('')).toBeNull();
    expect(tasksPageNumber(undefined)).toBeNull();
    expect(tasksPageNumber('0')).toBeNull();
    expect(tasksPageNumber('x3')).toBeNull();
  });
});

describe('tasksPages', () => {
  it('answers not found on every page when there is no nav to project', async () => {
    nav = null;
    for (const path of ['', '/stage/3', '/stage/3/phase/6']) {
      expect(await resolve(path), path).toEqual({ notFound: true });
    }
    expect(await resolve('', { query: { path: 'docs/tasks/stage3/phase6' } })).toEqual({
      notFound: true,
    });
  });

  it('serve the same sub-paths as Context Manager’s', () => {
    expect(tasksPages.map((page) => page.path)).toEqual([
      '',
      '/stage/:stage',
      '/stage/:stage/phase/:phase',
    ]);
  });

  it('title a board by its label, a stage by its number, and the empty state as Tasks', () => {
    const [landing, stagePage, phasePage] = tasksPages;
    const board = { board: { label: 'Stage 3 — Phase 6' }, cards: [], pool: { cards: [] } };
    const stage = { stage: 3, phases: [], pool: { cards: [] } };
    expect(phasePage.title(board)).toBe('Stage 3 — Phase 6 — Tasks');
    expect(stagePage.title(stage)).toBe('Stage 3 — Tasks');
    expect(landing.title(board)).toBe('Stage 3 — Phase 6 — Tasks');
    expect(landing.title(null)).toBe('Tasks');
  });

  it('are not found when a view has nothing to project', () => {
    expect(tasksPages.every((page) => !page.emptyWhenMissing)).toBe(true);
  });
});
