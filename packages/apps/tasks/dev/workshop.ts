// A hand-built tasks folder for the harness: files that show every card state
// a board renders once the core projects them, with the few host facts no file
// shows (a card left tracked, a check-in PR, a divergence) set beside them.
// Stage 1 has a second, empty phase, stage 2 a phase, and there is a board
// outside the stages, so the strip shows each of its parts.
import { workspace } from './workspace.js';

import type { Workspace } from './workspace.js';

export const WORKSHOP_MANIFEST = 'docs/tasks/tasks.yaml';
export const WORKSHOP_BOARD = 'docs/tasks/stage1/phase1';
const POOL = 'docs/tasks/unassigned';

const manifest = (pointer: boolean): string =>
  [
    'version: 1',
    'columns:',
    '  - id: todo',
    '    label: Todo',
    '  - id: in-progress',
    '    label: In progress',
    '  - id: done',
    '    label: Done',
    'defaultColumn: todo',
    'doneColumn: done',
    'kinds:',
    '  - id: brief',
    '    template: docs/tasks/brief.template.md',
    '  - id: spec',
    '    badge: sp',
    '    creatable: false',
    '  - id: spike',
    '  - id: review',
    '  - id: test',
    '  - id: seed',
    '    badge: sd',
    'tags: [code, docs, auth]',
    ...(pointer ? ['current:', '  stage: 1', '  phase: 1'] : []),
    '',
  ].join('\n');

const card = (front: string[], body: string): string =>
  ['---', ...front, '---', '', body, ''].join('\n');

const files = (pointer: boolean): Record<string, string> => ({
  [WORKSHOP_MANIFEST]: manifest(pointer),
  'docs/tasks/brief.template.md': card(
    ['column: todo', 'created: <datetime>'],
    '# Brief\n\n## High-level goal'
  ),
  [`${WORKSHOP_BOARD}/briefs/onboarding.md`]: card(
    ['column: todo', 'title: Onboarding brief', 'tags: [docs]'],
    '# Onboarding'
  ),
  [`${WORKSHOP_BOARD}/specs/login_flow.md`]: card(
    ['column: todo', 'title: Implement login flow', 'tags: [code, auth]'],
    '# Login flow\n\nSee the [onboarding brief](../briefs/onboarding.md).'
  ),
  [`${WORKSHOP_BOARD}/specs/sync_drift.md`]: card(
    ['column: in-progress', 'title: Drifted under a draft'],
    '# Sync drift'
  ),
  [`${WORKSHOP_BOARD}/specs/checked_in.md`]: card(
    ['column: done', 'title: Checked in, PR open', 'pr: 42', 'completed: 2026-11-01'],
    '# Checked in'
  ),
  [`${WORKSHOP_BOARD}/specs/blocked.md`]: card(
    ['column: todo', 'blocked: waiting on review'],
    '# Blocked'
  ),
  [`${WORKSHOP_BOARD}/spikes/tracked.md`]: card(
    ['column: todo', 'title: Tracked from the repository'],
    '# Tracked'
  ),
  [`${WORKSHOP_BOARD}/specs/broken.md`]: card(['column: todo', '  bad: [indent'], '# Broken'),
  [`${WORKSHOP_BOARD}/specs/undeclared.md`]: card(['column: backlog'], '# Undeclared'),
  'docs/tasks/stage1/phase2/briefs/.gitkeep': '',
  'docs/tasks/stage2/phase1/briefs/.gitkeep': '',
  'docs/tasks/research/briefs/question.md': card(['column: todo'], '# An open question'),
  [`${POOL}/seeds/idea.md`]: card(['title: A loose idea'], '# Idea'),
  [`${POOL}/specs/next_up.md`]: card(['tags: [code]'], '# Next up'),
  [`${POOL}/briefs/later.md`]: card([], '# Later'),
  [`${POOL}/order.yaml`]: `- ${POOL}/specs/next_up.md\n- ${POOL}/seeds/idea.md\n`,
});

/** The workshop: every card state on stage 1 phase 1, the pointer on it. */
export function workshop(options: { pointer?: boolean } = {}): Workspace {
  return workspace(WORKSHOP_MANIFEST, files(options.pointer ?? true), {
    // Local work over the latest versions: a column moved, a body edited, a
    // pool card edited, the pool reordered.
    edited: {
      [`${WORKSHOP_BOARD}/specs/login_flow.md`]: card(
        ['column: in-progress', 'title: Implement login flow', 'tags: [code, auth]'],
        '# Login flow\n\nSee the [onboarding brief](../briefs/onboarding.md).'
      ),
      [`${WORKSHOP_BOARD}/specs/sync_drift.md`]: card(
        ['column: in-progress', 'title: Drifted under a draft'],
        '# Sync drift\n\nEdited locally, while the repository moved on.'
      ),
      [`${POOL}/specs/next_up.md`]: card(['tags: [code]'], '# Next up\n\nSketched.'),
      [`${POOL}/order.yaml`]: `- ${POOL}/seeds/idea.md\n- ${POOL}/specs/next_up.md\n`,
    },
    fixed: {
      [`${WORKSHOP_BOARD}/specs/sync_drift.md`]: { diverged: 'metadata' },
      [`${WORKSHOP_BOARD}/specs/checked_in.md`]: {
        checkinPrUrl: 'https://github.com/stillpointlab/surfaces/pull/1',
        prState: 'open',
      },
      [`${WORKSHOP_BOARD}/spikes/tracked.md`]: { tracked: true },
      [`${POOL}/briefs/later.md`]: { tracked: true },
    },
  });
}

/** A folder with nothing but its manifest: the empty stage 1 phase 1 board. */
export function emptyWorkshop(): Workspace {
  return workspace(WORKSHOP_MANIFEST, { [WORKSHOP_MANIFEST]: manifest(true) });
}
