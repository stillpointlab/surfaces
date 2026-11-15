# @stillpointlab/checkin-review-component

The `<checkin-review>` element: a check-in's review over a `<modal-dialog>`. The changed files,
which to include, a title and a body, and a branch when the host offers one. Confirm asks the host
one op, `checkin`, by path. Both apps' shells hold one, and so does any host that checks in files.

```ts
import '@stillpointlab/checkin-review-component';
import type { CheckinReview } from '@stillpointlab/checkin-review-component';

const review = document.createElement('checkin-review') as CheckinReview;
document.body.append(review);
review.open({
  files: [{ path: 'rooms/garage.yaml', label: 'changed' }],
  words: {
    heading: 'Check in',
    title: 'Title',
    body: 'Description (optional)',
    confirm: 'Check in',
    cancel: 'Cancel',
  },
  title: '',
});
```

## Light DOM, borrowed classes

What the review shows is light-DOM content of its `<modal-dialog>`, so a host's own styles reach
it. Its buttons and fields take the classes an app's elements borrow from their host: `.button`,
`.button-primary`, `.button-secondary`, `.form-field`, `.form-label`, `.form-input` (with
`aria-invalid="true"` on a field that is missing), `.form-help` and `.form-message` (the line under
the form). Its own stylesheet, a `<style>` in its light DOM scoped to `checkin-review`, is layout
alone. Each row's label carries its text as `data-label` too, so a host can colour labels it knows
(`.checkin-review-label[data-label='new']`).

## Properties and methods

- `open(input)` opens it on `CheckinReviewInput`, every row checked. Opening it again while it is
  open starts it over; while the host answers it does nothing.
- `setFiles(files)` gives it the files again while it is open: a row keeps its check, a row that
  went goes, and a row that appeared starts unchecked. Files set while the host answers are shown
  once it has.
- `close()` closes it, asking nothing. An answer already asked for still raises its events.
- `isOpen` and `isBusy` (the host is answering).

`CheckinReviewInput`:

| Field              | Meaning                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `files`            | `CheckinFile[]`: `{ path, from?, label, group? }`. A moved file shows as `from → path`.  |
| `words`            | `CheckinWords`, from `@stillpointlab/common-format/app` (re-exported here).              |
| `title`            | What the title field starts with.                                                        |
| `titlePlaceholder` | The title field's placeholder.                                                           |
| `titleRequired`    | Confirm asks for a title.                                                                |
| `branch`           | `{ current, offerNew }`. See below. Absent: no branch, and none is sent.                 |
| `note`             | A line above the buttons, such as an unsaved file the check-in does not take.            |
| `context`          | Passed back with the op untouched.                                                       |
| `refusalField`     | `(code) => 'files' \| 'title' \| 'branch' \| null`: where focus goes after that refusal. |

Rows sit under their `group`s, each group once, in the order the groups first appear. **The
branch:** with `offerNew` and a current branch, a choice of "On `<branch>`" (chosen) or a new one,
whose name field chooses it when typed in; with `offerNew` and `current` `null` (a detached
`HEAD`), only a new one, and `words.detached` says why; without `offerNew`, "On `<branch>`" as text.

## What confirm does

It is never disabled. With no file checked, a required title empty, or a new branch with no name,
it says what is missing under the form and puts focus there. Otherwise it asks, with `requestOp`:

```ts
checkin: {
  op: { paths: string[]; title?: string; body?: string; branch?: string; context?: Record<string, unknown> };
  reply: { status: 'done' | 'started'; message?: string };
};
```

`paths` holds each checked row's path and the `from` of each moved one. The title is trimmed and
the body loses blank lines before it and space after it; either is left out when empty. `branch`
is a new branch's name. Enter in a one-line field confirms; in the body, Ctrl+Enter or Cmd+Enter.

While the op is unanswered the review is busy: the fields are held, confirm says `words.busy`, and
a second confirm, Enter, Escape and the close button do nothing. A refusal shows its message under
the form as text, many lines kept, with everything kept and focus on it (or on `refusalField`'s
field); asking again clears it while the host answers. A reply closes it.

`messageOf(title, body)` is the message a host over git makes of the two: the title, then a blank
line and the body. The pure parts (`rowsFor`, `groupsOf`, `checkinProblem`, `checkinOpOf`) are
exported too.

## Words

`CheckinWords` holds every word that depends on what a check-in is to the host: `heading`,
`help?`, `title`, `body`, `confirm`, `cancel`, and, each with a neutral default, `busy?`,
`noFiles?`, `noTitle?`, `detached?` and `nothing?` (in place of the rows when there are none). The
rest are the review's own (`REVIEW_WORDS`): "Files", "All", "N of M files chosen", "Branch",
"On `<branch>`", "On a new branch", "New branch name", "Name the new branch.".

## Events

All bubble and are composed.

| Event              | When                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `app-op`           | Confirm asks `checkin` (`requestOp`). A host claims it and answers.                       |
| `checkin-accepted` | The host took it; `detail` is `{ op, reply }`.                                            |
| `notification`     | The reply had a message: `{ message, type }`, `success` for `done`, `info` for `started`. |

Its `<modal-dialog>` raises `modal-opened` and `modal-closed` as well.

## Tokens

`--spl-border-light`, `--spl-text-muted`, `--spl-background-hover`, and the tokens of
`<modal-dialog>`. See Theming in the [root README](../../../README.md#theming).

## In the harness

`npm run dev`, then `checkin-review`: rows, groups on a stage, a moved file with a branch choice
and a note, a detached `HEAD`, a refusal in git's words, no files, and hostile strings. The Host
control answers `done` or `started`, refuses, holds the answer (busy), or answers nothing.
