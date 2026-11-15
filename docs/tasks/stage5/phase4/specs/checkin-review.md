---
column: in-progress
created: 2026-11-13T18:52:00-07:00
tags: [apps, host-contract, code]
---

# Spec: one check-in review

_The [local host brief](../../../stage4/phase1/briefs/local_host.md), outcome 4. Stage 5, phase 4.
Two steps, each one PR here: the element with the shells, then the local host._

> Written with stage 4's specs, before any of stage 4 was built, and read again on 2026-11-14
> against what stage 4 made. The [review](../../phase1/reviews/specs-against-stage-4.md) lists what changed
> and why (H6, M6). It was read once more on 2026-11-14 against phases 2 and 3 as built. "What
> stage 4 built" and "What phases 2 and 3 built" are what an implementer reads first.

## High-level goal

Both apps review a check-in in the same element: the changed files, which to include, a title
and a body. It asks its host one op, by path. In the local host that op is a commit.

## Related context

- The [local host spike](../../../stage4/phase1/spikes/local-host.md), finding 4 ("Check-in review
  as one element").
- The two dialogs in Context Manager today:
  - inventory (`client/apps/inventory/inventoryApp.ts`): rows from `state.dirty`, each a path
    with "(manifest)" or "(new)"; an empty title; it reloads the page when the job is done;
  - tasks (`client/apps/tasks/tasksApp.ts`): rows from the board's `checkin-request` detail
    (`TaskBoardCheckinRequest`), each with a change label, grouped by phase on a stage view; a
    default title; in-flight marks on the board (`markCheckinInFlight`).
  - Both send Context Manager's public ids, and tasks also sends the board's path and stage.
    Both speak of a pull request in their words.
- The commit function in [git-in-the-host](../../../stage4/phase3/specs/git-in-the-host.md), and
  its commit dialog, as built.
- The placement rule in `packages/components/README.md`: a component is one an app element
  renders inside itself.

## What stage 4 built

_Added 2026-11-14. The commit dialog is `packages/hosts/local/src/client/commit/`: `dialog.ts`
(397 lines) and the pure `request.ts`, with 409 lines of tests._

The dialog this element replaces in step 2 does the following, and the explorer keeps all of it:

- **Rows that follow the folder.** While it is open, a host event has it read the changes again.
  A row keeps its check, a row that went goes, and a row that appeared starts unchecked, so
  nothing is committed that was not on screen when it was checked (`rowsFor`).
- **One box for all the rows.**
- **A confirm button that is never disabled.** It checks what is missing (no file, no summary,
  no branch name), says so under the form, and puts focus on what to fix (`commitProblem`).
- **The branch:** the current one or a new one with its name, and only a new one when `HEAD` is
  detached. The dialog reads the branch when it opens; the page asks for git's state once and
  hears of a new branch only from its own commit.
- **A line for the open file's unsaved edits,** which a commit does not take.
- **A refusal under the form as text,** git's own words included, with everything kept.
- **Busy means busy:** while a commit runs (up to 60 seconds, with hooks), a second confirm,
  Enter, Escape and the close button do nothing.
- **The request** is `{ paths, message, branch? }`: each checked row's path and a moved one's old
  path, and the summary joined to the details by a blank line (`requestOf`, `messageOf`).

## What phases 2 and 3 built

_Added 2026-11-14, from the "As built" sections of
[app-shells](../../phase2/specs/app-shells.md), [host-runner](../../phase2/specs/host-runner.md)
and [apps-in-the-local-host](../../phase3/specs/apps-in-the-local-host.md)._

- **The shells exist:** `<spl-inventory-app>` and `<spl-tasks-app>`, light-DOM elements, each
  from its package's `./shell` entry. The contract (`AppShellInput`, `AppShellElement`,
  `AppShellOps`) is one block at the end of `packages/common/src/app.ts`.
- **Both shells let `checkin-request` bubble through** today, unchanged.
- **The local host's app pane hears it and opens the explorer's commit dialog,** a stopgap so
  that inventory's "Check in…" did something. Step 2 here takes it out.
- **The board has `markCheckinInFlight(paths)`.** Tasks' shell has no way yet for a host to
  say a check-in settled, or to mark one in flight from outside.
- **The app elements borrow their host's classes** for buttons and fields (`.button`,
  `.button-primary`, `.button-secondary`, `.form-field`, `.form-label`, `.form-input`,
  `.form-help`, `.form-message`). The local host styles all of them now, and Context Manager
  has them.
- **`<modal-dialog>` has a shadow root with slots;** what a dialog holds is its light-DOM
  children, which the host's styles reach.
- **The memory port has `commit(paths?)`,** which is a check-in in the harness. Each app has a
  "Shell over the memory host" fixture (`packages/apps/inventory/dev/host.ts`,
  `packages/apps/tasks/dev/shell.ts`).
- **The local host's page has one notice,** which a shell's `notification` reaches, and its
  app pane resolves the page again on the host's `status` event, which a commit raises.
- **The app pane sets the shell's input whenever the host's revision moves,** and the revision
  covers what git reports.
- **A new component is a package under `packages/components/`,** as `modal-dialog` and
  `spl-icon` are: its own `package.json`, build, styles and tests, and the root's lists.

## Work package

- **Owns:** a new component, `packages/components/checkin-review` (`<checkin-review>`), the
  `checkin` op in the shell contract, and each shell's use of it.
- **Changes in step 2:** the local host's app pane and its commit dialog, whose pure parts and
  tests move to the component.
- **Does not change:** the apps' `checkin-request` events, or Context Manager.

## Technical requirement

### The element

`<checkin-review>` wraps a `<modal-dialog>`. What it shows is light-DOM content of that dialog,
with the classes the app elements borrow from their host for its buttons and fields, so each
host's own styles reach it. Its own styles are layout alone, from the shared tokens.

```ts
export interface CheckinFile {
  path: string;
  /** For a moved file, where it was. */
  from?: string;
  /** What changed, in the host's or the app's words: "content edited", "todo → done", "new". */
  label: string;
  /** A heading the row sits under: "Phase 2", "Pool & config". */
  group?: string;
}

/** Every word the review shows that depends on what a check-in is to its host. */
export interface CheckinWords {
  heading: string; // "Check in", "Commit"
  help?: string;
  title: string; // "Title", "Summary"
  body: string; // "Description (optional)", "Details (optional)"
  confirm: string; // "Check in", "Commit"
  cancel: string;
}

export interface CheckinReviewInput {
  files: readonly CheckinFile[];
  words: CheckinWords;
  title: string;
  titlePlaceholder?: string;
  /** Whether confirm asks for a title before it sends. */
  titleRequired?: boolean;
  /** Offer a branch choice: the current branch (`null` when detached), and whether a new one may be named. */
  branch?: { current: string | null; offerNew: boolean };
  /** A line above the buttons: "notes.md has unsaved edits, which this does not include." */
  note?: string;
  /** Passed back with the op untouched, for a host that needs the app's own context. */
  context?: Record<string, unknown>;
}

export interface CheckinReviewElement extends HTMLElement {
  open(input: CheckinReviewInput): void;
  /** The files changed while the review is open. Checks are kept as the commit dialog keeps them. */
  setFiles(files: readonly CheckinFile[]): void;
  close(): void;
}
```

It behaves as the commit dialog does, by the list under "What stage 4 built":

- every row starts checked, with one box for all of them; a row `setFiles` adds starts
  unchecked;
- confirm is never disabled: with nothing checked, a required title missing, or a new branch
  with no name, it says what is missing and puts focus there;
- with `branch.current` `null`, only a new branch is offered;
- confirm asks its host, with `requestOp`, for:

  ```ts
  checkin: {
    op: { paths: string[]; title?: string; body?: string; branch?: string; context?: object };
    reply: { status: 'done' | 'started'; message?: string };
  };
  ```

  `paths` holds each checked row's path, and the `from` of each moved one;

- while the op is unanswered the dialog is busy, and nothing closes it. A refusal shows its
  message under the form, with everything kept. Success closes it and raises `notification`
  with the reply's message.

### In the shells

`checkin` joins `AppShellOps`. Each shell holds one `<checkin-review>`, listens for its app's
`checkin-request`, and opens the review. The request stops at the shell: a host that mounts one
no longer hears `checkin-request`, and answers `checkin` instead.

- **Inventory:** rows from the state's `dirty` list, labelled "manifest", "new" or "changed"; no
  default title, with the placeholder "Inventory check-in".
- **Tasks:** rows from the request's cards, order file and housekeeping, with today's labels and
  groups; the title "Tasks check-in: `<board>`"; `context` is the board's path and the stage.
  After `started`, the shell marks the paths in flight on the board; it exposes
  `checkinSettled()` for a host whose check-in finishes later.

`AppShellInput` gains `checkin?: { words?: CheckinWords; branch?: … }`, which the shell passes to
the review. Without `words` the shell uses its own, which say "check in" and never "commit" or
"pull request". When the shell's state is set again while the review is open, it calls
`setFiles` with the new rows.

Each app's "Shell over the memory host" fixture answers `checkin` with the memory port's
`commit` of the op's paths and replies `done`, so the review can be tried end to end in the
harness: the rows, a check-in, and the marks clearing.

### In the local host

- **The app pane sets `checkin`** each time it sets the shell's input: the words for a commit,
  and the branch from `client.git()`, read again then, with `offerNew: true`. A commit or a
  switch made elsewhere raises `status`, which already resolves the page again
  ([apps-in-the-local-host](../../phase3/specs/apps-in-the-local-host.md)), so the branch is never the one the page
  first asked for. A folder that is not a repository has no changed files, so the apps never
  ask.
- **The pane no longer opens the explorer's commit dialog on `checkin-request`:** the shell
  takes the request now.
- **It answers `checkin` with the commit function:** the title is the commit's summary and the
  body its details, joined as the dialog joins them; `branch` is a new branch. An absent title
  becomes "`<the app's label>` check-in". The reply is `done`, with the words the commit's notice
  uses today: "Committed `<id>` on `<branch>`".
- **The explorer's commit dialog becomes this element,** so the host has one review:
  - its rows are the changed files, each with its status as the label, in the tree's order
    (names with numbers in order), not git's;
  - `titleRequired`, the unsaved file's `note`, and the words it has today;
  - a host event calls `setFiles` with the changes read again;
  - `request.ts`'s pure functions and their tests move into the component, and `dialog.ts` goes.
- **The Commit button** is disabled when nothing has changed, in place of "Commit 0".

## Clarifications

- **`status: 'started'`** is for a host whose check-in is a job, as Context Manager's is. That
  host shows its own progress and tells the shell when it settles.
- **By path, always.** A host with ids of its own maps the paths.
- **The words are the host's.** The local host says "Commit"; Context Manager speaks of a pull
  request; a shell with no words given says "Check in".
- **A commit that a hook refuses** shows git's words in the review, as it does in the commit
  dialog today.

## Non-goals

- The check-in shared core (the brief's out of scope), and anything about a pull request.
- Showing a diff inside the review.
- Context Manager using the element ([context-manager-adopts-apps](../../phase1/specs/context-manager-adopts-apps.md)).

## Acceptance / completion checklist

- [ ] Component tests: rows, groups, a moved file, the box for all rows, `setFiles` keeping and
      dropping checks, each missing thing named with focus on it, a detached `HEAD`, busy, a
      refusal, success, and hostile paths, labels and words.
- [ ] The commit dialog's tests pass against the element, moved with what they test.
- [ ] Shell tests: each app's rows from its own request, its rows after the state is set again,
      and tasks' in-flight marks.
- [ ] The harness shows the review in both shells, answered by the memory host.
- [ ] By hand in the local host, light and dark: change an inventory and a board, check in
      each on a new branch, and read the commits; the app's marks clear with no reload.
- [ ] The explorer's commit and the apps' check-in use the same element, and the explorer does
      everything the list under "What stage 4 built" names.
- [ ] `npm run check` is green.

## Implementation plan

1. PR: the component, the op, and both shells.
2. PR: the local host answers `checkin`, and its commit dialog switches to the element.
