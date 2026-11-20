// This component in the surfaces harness (`npm run dev`). A fixture opens the
// review with its files and words; the harness is its host and answers the
// `checkin` op as the Host control says (done, started, a refusal in git's
// words, held so the review stays busy, or nothing at all). "Reopen" opens the
// current fixture again after the review closed, and "Files change" calls
// `setFiles` while it is open. `host.css` stands in for a host's buttons and
// form fields, which the review borrows.
import '../src/checkin-review';
import './host.css';

import { answerOps, fail, ok } from '@stillpointlab/common-format/app';

import type {
  HarnessElements,
  HarnessFixture,
  HarnessFormat,
} from '../../../../tooling/harness/types';
import type { CheckinReview, CheckinReviewInput } from '../src/checkin-review';
import type { CheckinFile } from '../src/request';
import type { AppShellOps, CheckinWords, Result } from '@stillpointlab/common-format/app';

const TAG = 'checkin-review';

/** A shell's own words. */
const CHECK_IN: CheckinWords = {
  heading: 'Check in changes',
  help: 'Choose the files to check in.',
  title: 'Title',
  body: 'Description (optional)',
  confirm: 'Check in',
  cancel: 'Cancel',
  busy: 'Checking in…',
  noFiles: 'Choose at least one file to check in.',
  nothing: 'Nothing has changed since the last check-in.',
};

/** A host over git's words. */
const COMMIT: CheckinWords = {
  heading: 'Commit',
  title: 'Summary',
  body: 'Details (optional)',
  confirm: 'Commit',
  cancel: 'Cancel',
  busy: 'Committing…',
  noFiles: 'Choose at least one file to commit.',
  noTitle: 'Write a summary for the commit.',
  detached: 'HEAD is detached (not on a branch), so the commit goes on a new branch.',
};

const INVENTORY: CheckinFile[] = [
  { path: 'workshop/inventory.yaml', label: 'manifest' },
  { path: 'workshop/rooms/garage.yaml', label: 'changed' },
  { path: 'workshop/rooms/attic.yaml', label: 'new' },
];

const STAGE: CheckinFile[] = [
  { path: 'docs/tasks/stage5/phase1/specs/runner.md', label: 'todo → done', group: 'Phase 1' },
  {
    path: 'docs/tasks/stage5/phase2/specs/shells.md',
    from: 'docs/tasks/unassigned/seeds/shells.md',
    label: 'moved',
    group: 'Phase 2',
  },
  { path: 'docs/tasks/stage5/phase2/briefs/apps.md', label: 'content edited', group: 'Phase 2' },
  { path: 'docs/tasks/unassigned/seeds/idea.md', label: 'content edited', group: 'Pool & config' },
  { path: 'docs/tasks/unassigned/order.yaml', label: 'backlog priority', group: 'Pool & config' },
  { path: 'docs/tasks/tasks.yaml', label: 'pointer / tags', group: 'Pool & config' },
];

const CHANGES: CheckinFile[] = [
  { path: 'README.md', label: 'changed' },
  { path: 'notes/2026-11-14.md', label: 'new' },
  { path: 'docs/guide/setup.md', from: 'setup.md', label: 'moved' },
  { path: 'old-plan.md', label: 'deleted' },
];

const GIT_REFUSAL = [
  'git commit failed (exit 1). Nothing was committed, and you are still on main. git said:',
  'lint-staged: running tasks for staged files…',
  '  ✖ prettier --check found problems in README.md',
  'husky - pre-commit script failed (code 1)',
].join('\n');

type Answer = 'done' | 'started' | 'refuses' | 'holds' | 'nothing';

let answer: Answer = 'done';
let held: (() => void) | null = null;
let last: CheckinReviewInput | null = null;
let stop: (() => void) | null = null;

function review(elements: HarnessElements): CheckinReview {
  return elements.extras[TAG] as CheckinReview;
}

/** The harness as the review's host. */
function attach(el: CheckinReview): void {
  el.parentElement?.classList.add('checkin-review-harness');
  stop ??= answerOps<Pick<AppShellOps, 'checkin'>>(el, async (op): Promise<Result<object>> => {
    if (answer === 'holds') {
      await new Promise<void>((resolve) => (held = resolve));
      held = null;
    }
    if (answer === 'refuses') return fail('HOST_GIT_FAILED', GIT_REFUSAL);
    if (answer === 'started') {
      return ok({ status: 'started', message: `Checking in ${op.paths.length} file(s)…` });
    }
    return ok({ status: 'done', message: `Checked in ${op.paths.join(', ')}.` });
  });
}

const opening = (input: CheckinReviewInput): HarnessFixture => ({
  content: JSON.stringify(input, null, 2),
  apply: (elements) => {
    const el = review(elements);
    attach(el);
    last = input;
    el.open(input);
  },
});

export default {
  elements: { extra: [TAG] },
  controls: [
    {
      kind: 'select',
      label: 'Host',
      options: ['done', 'started', 'refuses', 'holds', 'nothing'],
      apply: (elements, value) => {
        attach(review(elements));
        // Let a held answer go, under the new choice.
        answer = value as Answer;
        if (answer === 'nothing') {
          stop?.();
          stop = null;
        }
        held?.();
      },
    },
    {
      kind: 'toggle',
      label: 'Reopen',
      apply: (elements, on) => {
        if (on && last) review(elements).open(last);
      },
    },
    {
      kind: 'select',
      label: 'Files change',
      options: ['no', 'one more', 'the first one goes'],
      apply: (elements, value) => {
        if (!last || value === 'no') return;
        const files =
          value === 'one more'
            ? [
                ...last.files,
                { path: 'late/arrival.md', label: 'new', group: last.files[0]?.group },
              ]
            : last.files.slice(1);
        review(elements).setFiles(files);
      },
    },
  ],
  fixtures: {
    'Rows (inventory)': opening({
      files: INVENTORY,
      words: CHECK_IN,
      title: '',
      titlePlaceholder: 'Inventory check-in',
    }),
    'Groups (a stage)': opening({
      files: STAGE,
      words: CHECK_IN,
      title: 'Tasks check-in: Stage 5',
      context: { boardPath: '', stage: 5 },
    }),
    'A moved file and a branch choice (commit)': opening({
      files: CHANGES,
      words: COMMIT,
      title: '',
      titleRequired: true,
      branch: { current: 'main', offerNew: true },
      note: 'Your unsaved edits to README.md are not in this commit. Save them first to include them.',
    }),
    'Detached HEAD': opening({
      files: CHANGES,
      words: COMMIT,
      title: '',
      titleRequired: true,
      branch: { current: null, offerNew: true },
    }),
    'A refusal in git’s words (choose Host: refuses)': opening({
      files: CHANGES,
      words: COMMIT,
      title: 'Tidy the notes',
      titleRequired: true,
      branch: { current: 'main', offerNew: true },
    }),
    'Nothing changed': opening({ files: [], words: CHECK_IN, title: '' }),
    'Hostile strings': opening({
      files: [
        { path: 'a"<b>.md', label: '<em>changed</em>', group: '<script>x</script>' },
        { path: "b'.md", from: '<img src=x onerror=alert(1)>', label: 'moved' },
      ],
      words: { ...CHECK_IN, heading: '<em>Not emphasised</em>', help: '<b>Not bold</b>' },
      title: '"><img src=x onerror=alert(1)>',
      note: '<a href="javascript:alert(1)">not a link</a>',
      branch: { current: '<b>main</b>', offerNew: true },
    }),
  },
} satisfies HarnessFormat;
