---
column: todo
created: 2026-11-13T18:52:00-07:00
tags: [apps, host-contract, code]
---

# Spec: one check-in review

_The [local host brief](../../../stage4/phase1/briefs/local_host.md), outcome 4. Stage 5, phase 4.
Two steps, each one PR here: the element with the shells, then the local host._

> Written with stage 4's specs, before any of stage 4 was built. Stage 5 opens by reading it
> again against what stage 4 made.

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
- The commit function in [git-in-the-host](../../../stage4/phase1/specs/git-in-the-host.md), and
  its commit dialog.
- The placement rule in `packages/components/README.md`: a component is one an app element
  renders inside itself.

## Work package

- **Owns:** a new component, `packages/components/checkin-review` (`<checkin-review>`), the
  `checkin` op in the shell contract, and each shell's use of it.
- **Changes in step 2:** the local host's app pane and its commit dialog.
- **Does not change:** the apps' `checkin-request` events, or Context Manager.

## Technical requirement

### The element

`<checkin-review>` wraps a `<modal-dialog>`.

```ts
export interface CheckinFile {
  path: string;
  /** For a moved file, where it was. */
  from?: string;
  /** What changed, in the app's words: "content edited", "todo → done", "new". */
  label: string;
  /** A heading the row sits under: "Phase 2", "Pool & config". */
  group?: string;
}

export interface CheckinReviewInput {
  files: readonly CheckinFile[];
  title: string;
  titlePlaceholder?: string;
  /** Offer a branch choice: the current branch, and whether a new one may be named. */
  branch?: { current: string | null; offerNew: boolean };
  /** Passed back with the op untouched, for a host that needs the app's own context. */
  context?: Record<string, unknown>;
}

export interface CheckinReviewElement extends HTMLElement {
  open(input: CheckinReviewInput): void;
  close(): void;
}
```

- Every row starts checked. Confirm is disabled with nothing checked.
- Confirm asks its host, with `requestOp`, for:

  ```ts
  checkin: {
    op: { paths: string[]; title?: string; body?: string; branch?: string; context?: object };
    reply: { status: 'done' | 'started'; message?: string };
  };
  ```

  `paths` holds each checked row's path, and the `from` of each moved one.

- While the op is unanswered the dialog is busy. A refusal shows its message in the dialog,
  which stays open. Success closes it and raises `notification` with the reply's message.

### In the shells

`checkin` joins `AppShellOps`. Each shell holds one `<checkin-review>`, listens for its app's
`checkin-request`, and opens the review:

- **Inventory:** rows from the state's `dirty` list, labelled "manifest", "new" or "changed"; no
  default title, with the placeholder "Inventory check-in".
- **Tasks:** rows from the request's cards, order file and housekeeping, with today's labels and
  groups; the title "Tasks check-in: `<board>`"; `context` is the board's path and the stage.
  After `started`, the shell marks the paths in flight on the board; it exposes
  `checkinSettled()` for a host whose check-in finishes later.

`AppShellInput` gains `checkin?: { branch?: … }`, which the shell passes to the review.

### In the local host

- The app pane sets `checkin.branch` from the repository: the current branch, and `offerNew:
true`. A folder that is not a repository has no changed files, so the apps never ask.
- It answers `checkin` with the commit function: the title is the commit's subject, the body its
  body, `branch` a new branch. The reply is `done`, with "Committed `<id>` on `<branch>`".
- **The explorer's commit dialog becomes this element,** so the host has one review. Its rows
  are the changed files with their status as the label.

## Clarifications

- **`status: 'started'`** is for a host whose check-in is a job, as Context Manager's is. That
  host shows its own progress and tells the shell when it settles.
- **By path, always.** A host with ids of its own maps the paths.
- **The words on the buttons** are "Check in" and "Cancel" in an app, and "Commit" in the
  explorer; the element takes the confirm label as an attribute.

## Non-goals

- The check-in shared core (the brief's out of scope), and anything about a pull request.
- Showing a diff inside the review.
- Context Manager using the element ([context-manager-adopts-apps](context-manager-adopts-apps.md)).

## Acceptance / completion checklist

- [ ] Component tests: rows, groups, a moved file, nothing checked, busy, a refusal, success, and
      hostile paths and labels.
- [ ] Shell tests: each app's rows from its own request, and tasks' in-flight marks.
- [ ] The harness shows the review in both shells, answered by the memory host.
- [ ] By hand in the local host: change an inventory and a board, check in each on a new
      branch, and read the commits.
- [ ] The explorer's commit and the apps' check-in use the same element.
- [ ] `npm run check` is green.

## Implementation plan

1. PR: the component, the op, and both shells.
2. PR: the local host answers `checkin`, and its commit dialog switches to the element.
