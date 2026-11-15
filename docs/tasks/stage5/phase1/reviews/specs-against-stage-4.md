---
column: done
pr: 110
completed: 2026-11-14
created: 2026-11-14T19:10:00-07:00
tags: [apps, host-contract, dev-tooling, docs]
---

# Stage 5 Specs Against Stage 4 Review — 2026-11-14

> The stage 5 specs were written on 2026-11-13 with stage 4's, before any of stage 4 was built.
> The [local host brief](../../../stage4/phase1/briefs/local_host.md) says stage 5 opens by
> reading them again against what stage 4 made. This is that reading, by the claude agent that
> orchestrated stage 4.

Scope: the seven specs in [`../specs/`](../specs/), read against the code on `main` at
`stage4-complete` (`2c3a3ee`), each stage 4 spec's "As built" section, the
[stage 4 follow-up log](../../../../devlogs/stage4/followups.md) and Jamie's
[stage 4 reflections](../../../../devlogs/stage4/reflections.md). Context Manager was read at its
`main` (`74ecae8c`). Read in full: `packages/common/src/{app.ts,host/}`, the local host's server
(`host.ts`, the port's interface, `git/stage.ts`) and client (`page.ts`, `host-client.ts`,
`address.ts`, the tree's model, the commit dialog), both apps' lifecycles, modules and facts, and
the harness's memory host. Not reviewed: the specs' designs where stage 4 does not bear on them
(the shell contract's shape, the page rules that move).

Overall / Verdict: the plan holds, and no spec needs to be thrown away. Seven findings would have
sent an implementing agent the wrong way or stopped it, and they concentrate in the two specs that
sit on stage 4's code: [undo-journal](../../phase5/specs/undo-journal.md) and
[apps-in-the-local-host](../../phase3/specs/apps-in-the-local-host.md). The worst is in the undo journal:
the port reads and writes text of at most 2 MiB, so the journal as drafted cannot keep a deleted
image, and its index step would unstage a person's own work. Every finding is written into its
spec in this PR. Three of them rested on a choice that is Jamie's, and two more questions came
up on the way. All five are under [Decisions for Jamie](#decisions-for-jamie), with his answers.

> **Resolution status (2026-11-14):** every finding below is written into the spec it names, in
> the PR that adds this review ([#110](https://github.com/stillpointlab/surfaces/pull/110)). Jamie
> answered the five decisions the same day. The md editor's save was fixed in
> [#111](https://github.com/stillpointlab/surfaces/pull/111), and the preview pages are a seed in
> Context Manager's pool (context-manager#1199).

---

## What stage 4 built that the specs did not know

- **The port is text.** `StoragePort.get` answers text of at most 2 MiB (`HOST_NOT_TEXT`,
  `HOST_FILE_TOO_LARGE`), and a `write` or `create` carries a string. A `move` without `content`
  keeps the file's bytes, which is how the explorer renames an image.
- **One `put` at a time, and a path once per call.** A `put` and a commit run under one write
  lock. The port stages its own moves and deletes after a successful `put`, by moving or removing
  the index entry (`git update-index --index-info`), never with `git add`.
- **`common-format/host` exports types only,** and a test says so. The same test fails the
  entry if its built text holds the words `process`, `Buffer`, `document` or `window`.
- **The events are `changed`, `listed` and `status`.** `listed` is a path added or removed;
  `status` is git's `HEAD` or index moving (a commit, a stage, a switch).
- **The page is one tree, one `FilePane` and one menu.** The address is `{ view, path }` with
  the views `file`, `edit` and `diff`. The tree already draws an app's row (`TreeMark.app`), and
  it has no row for the served folder itself (`''`). The page's only notice is the commit's.
- **The explorer's writes are one `put` of every file the listing has under a folder.** Rename
  and Delete are disabled for a folder the page cannot see whole (a cut listing, a nested
  repository).
- **The commit dialog does more than a list and a button:** it reads the changes again while it
  is open, has one box for all rows, names what is missing instead of disabling its button,
  offers only a new branch on a detached `HEAD`, says when the open file has unsaved edits, and
  shows git's own words on a refusal.
- **The page runs under a content security policy** with no `eval` and scripts from its own
  origin, and it has a dark colour scheme. Context Manager has neither.
- **Context Manager's adoption was one PR,** the pin alone and then the adoption, walked at
  each. Jamie's reflections: the walks take over 20 minutes and load the machine, concurrent CI
  runs caused build failures, and one integration at the end of the stage was good process.

Nothing in `packages/common/src/app.ts`, in either app package or in the harness's memory host
changed during stage 4, and the line counts the specs quote for Context Manager's files still
hold at its `main`.

---

## High

### H1. The undo journal cannot keep a file that is not text

- **Where:** [undo-journal](../../phase5/specs/undo-journal.md), "The journal"; `StoragePort` in
  `packages/common/src/host/index.ts`; `MAX_TEXT_BYTES` in the local host's `limits.ts`.
- **What:** the draft's inverse of a `delete` is a `create` "with the old content", read through
  the port. The port cannot read an image or a file over 2 MiB, and cannot write bytes.
- **Impact:** "delete a folder and undo it", the spec's own by-hand check, fails for any folder
  with an image in it.
- **Fix (in the spec, the agent's lean):** a delete of a file the port cannot read is one that
  cannot be undone, and asks first, as the too-large case already does. A rename is always
  undone, since a `move` without `content` keeps the bytes both ways. Keeping bytes in the
  journal is the other way; it is decision 1 below.

### H2. The undo journal's index step unstages a person's work

- **Where:** undo-journal, "Undo and redo" step 4 and "Index edge"; the local host's
  `server/git/stage.ts`.
- **What:** the draft returns the paths' index entries to `HEAD` with `git reset`, and its trial
  was made before staging was built. As built, the port moves index entries, so
  undoing a move through the port's own `put` moves the entry back with no extra step, and the
  reset is only needed for a delete. There it loses what the person had staged.
- **Impact:** tried on git 2.56 (2026-11-14): a file with a staged edit and a staged new file
  were deleted by the host and restored. After the draft's reset, the edit was unstaged and the
  new file untracked. After putting back the index entries the delete removed, `git status` read
  exactly as before.
- **Fix (in the spec):** a step keeps the index entries its deletes removed, and undo puts them
  back with the command staging already uses. The "Index edge" clarification goes.

### H3. The runner has no place for what a host knows beyond facts

- **Where:** [host-runner](../../phase2/specs/host-runner.md), `RunnerHost`; `TasksSnapshot` in
  `packages/apps/tasks/src/projection.ts`; `write` in `packages/apps/tasks/dev/workspace.ts`.
- **What:** tasks' snapshot carries plain data only a host knows: the pending moves, the cards
  created and not yet checked in. Context Manager's host has a loader per app for it. The draft
  runner has `facts` alone, and the harness keeps the moves in the workspace's `write`, which
  the memory port replaces.
- **Impact:** a moved card would show no "moved from", and its check-in row no old path, in the
  harness and in the local host.
- **Fix (in the spec):** `RunnerHost.know` answers the facts and the snapshot's host parts
  together. The memory port answers `changes()`, with a moved file's old path, as the node
  port's git does, so both hosts read the same thing. Where the function from changes to an
  app's facts lives is decision 3.

### H4. A lock that hides files from the listing breaks the explorer's writes

- **Where:** [apps-in-the-local-host](../../phase3/specs/apps-in-the-local-host.md), "The row and the
  lock"; the explorer's `renameChanges` and `deleteChanges`.
- **What:** the draft has the server leave a locked instance's files out of the listing. The
  explorer renames a folder by moving every file the listing has under it, so a folder above a
  locked instance would move without the instance's files. The runner also needs the whole
  listing.
- **Impact:** a rename of `docs` would leave `docs/tasks` behind, or be refused half way with a
  count in the dialog that is wrong.
- **Fix (in the spec):** the listing stays whole. The page leaves a locked instance's files out
  of what it gives the tree, the server refuses the writes, and a folder above a locked instance
  has Rename… and Delete… disabled with the reason, as a folder that holds a nested repository
  does.

### H5. The app pane would show stale state after a commit or a new file

- **Where:** apps-in-the-local-host, "Opening the app" step 5; `HostEvent`.
- **What:** the draft resolves the page again on a `changed` event. A card created on disk
  raises `listed`, and a commit raises `status`, after which nothing is changed any more. The
  pane's own op also raises events, which can arrive before the op's reply.
- **Impact:** after a commit from the explorer the board would still mark every card as
  changed; a card added from a terminal would not show.
- **Fix (in the spec):** the pane resolves again on all three events. Events that arrive during
  its own op wait for the reply, as `FilePane.followWrite` does for the explorer's writes, and a
  revision of the instance's files says whether what it shows is already current.

### H6. The check-in element as drafted would lose what the commit dialog does

- **Where:** [checkin-review](../../phase4/specs/checkin-review.md), "The element" and "In the local
  host"; the local host's `client/commit/`.
- **What:** step 2 replaces the explorer's commit dialog with `<checkin-review>`. The draft
  element has no way to change its rows while open, no box for all rows, a confirm button that
  is disabled with no reason given, and one set of words. Context Manager's dialogs say "pull
  request"; the local host's says "commit".
- **Impact:** the explorer would lose behaviour stage 4 shipped and tested, and one of the two
  hosts would show the other's words.
- **Fix (in the spec):** the element takes over the dialog's behaviour, listed there, with
  `setFiles` for rows that change while it is open and the words given by its host.

### H7. Four Context Manager PRs, each walked, against stage 4's lesson

- **Where:** [context-manager-adopts-apps](../specs/context-manager-adopts-apps.md), the plan.
- **What:** four PRs with both walk suites on each is at least eight rounds of walks, each over
  20 minutes and heavy on the machine. Jamie's reflections name that cost and say one
  integration at the stage's end was good process. The shells and the check-in element also move
  markup the walks select by: 57 uses of the two check-in dialogs' ids alone.
- **Impact:** hours of walks, and the contention the reflections describe.
- **Fix (in the spec, the agent's lean):** steps 1 to 3 are one PR in commits, walked at the pin
  alone and at the tip; the lock is a second PR, since it changes what a person can do and needs
  its own review. The walk edits ride with the commit that moves the markup. Decision 2.

## Medium

### M1. The runner turns a types-only entry into one with code

`common-format/host` has a test that it exports nothing, and that its built text never says
`process`, `Buffer`, `document` or `window`. The first half changes with the runner; the second
stays, and applies to the runner's messages and comments as much as its code. In
[host-runner](../../phase2/specs/host-runner.md).

### M2. The memory port has to keep the node port's rules

One `put` at a time, a path once per call, all or nothing, a `move` without `content`, `base`
checked on each change, and the same refusal codes. Without them the harness proves less than it
seems to. The spec adds one port suite in `common-format/testing`, run over both ports.

### M3. An instance at the served root has no row to sit on

The tree has no row for `''`, and the overlap rule read by folder would make a root instance
overlap every other. [apps-in-the-local-host](../../phase3/specs/apps-in-the-local-host.md) now defines an
instance's region once, for the lock, the overlap rule and the tree, and draws a root instance
above the tree.

### M4. The app's address needs a rule for where the manifest's path ends

`#/app/<manifestPath>` followed by a sub-path is two slash-separated paths in a row. The page
splits it by the instances it knows. An app's page builds a redirect by joining `base` and a
sub-path as text, since the local host's base is a fragment
([app-module-grows](../../phase2/specs/app-module-grows.md)).

### M5. The page has one notice, and it is the commit's

An app's `notification` request and the problems a lock reports need it. It becomes the page's
notice in step 1 of apps-in-the-local-host.

### M6. The branch the app offers goes stale

The page asks for git's state once and learns a new branch only from its own commit. A check-in
from an app reads it when the review opens ([checkin-review](../../phase4/specs/checkin-review.md)).

### M7. Packaging the apps into the local host

The host's development aliases, its client `tsconfig` paths and its server bundle name the five
format packages. The two app packages join each, and `createHost` takes the apps as an option so
a test can hand it a fake. In apps-in-the-local-host.

### M8. The app elements have never been seen in a dark scheme

The local host has one and Context Manager does not. The code editor's dark-on-dark highlighting
was found this way in stage 4. Both app specs' by-hand checks now include it.

### M9. The lock in Context Manager has no walk

Stage 4's adoption passed both suites, and the walks opened none of the files it changed most.
The lock is new behaviour with a server check, and no walk covers it. The spec's step for it now
ends with one walk of its own.

## Low / Hygiene

- **L1. Discovery finds fixtures.** This repository has two `inventory.yaml` files under
  `packages/apps/inventory/dev/examples/`. Served here, each shows as a locked app row. That is
  the brief's rule working; the by-hand check will meet it.
- **L2. zod in the page.** xmdl's validator probes `Function('')` and the page's policy reports
  it (stage 4's follow-up log). The apps' bounds run in the server, so only a create form's own
  checks reach the page. Noted in app-module-grows.
- **L3. Events of the host's own** (`apps`, `journal`) sit in the local host beside `HostEvent`,
  not in `common`.
- **L4. `open-options-menu`** carries `{ items, anchor }` and the board waits for
  `options-menu-select`; the host's menu takes `{ x, y, entries }`. The mapping is spelled out
  in apps-in-the-local-host.
- **L5. Stage 4's follow-ups** that a stage 5 spec now covers are marked in
  [its log](../../../../devlogs/stage4/followups.md): the tree's `focusRow`, the commit dialog's
  order and "Commit 0", the branch and `logs/HEAD` notes for undo, and the preview pages in
  Context Manager.

---

## Decisions for Jamie

Jamie answered all five on 2026-11-14, and each spec now says what he decided.

1. **Undo of a deleted image or large file** (H1). **Agreed:** it cannot be undone, and the host
   asks first. In [undo-journal](../../phase5/specs/undo-journal.md).
2. **Context Manager's adoption as two PRs, not four** (H7). **"Two is fine if less disruptive
   overall."** Steps 1 to 3 together, the lock apart. In
   [context-manager-adopts-apps](../specs/context-manager-adopts-apps.md).
3. **Where an app's facts are derived from file changes** (H3). **"Sounds fine, something like
   the format object?"** Yes: the module is the object a host registers, as a format's
   descriptor is, and it gains one member, `fromChanges`, which is to an app what `apply` is to
   a descriptor. The harness and the local host both call it; Context Manager, which knows
   more, does not. In [app-module-grows](../../phase2/specs/app-module-grows.md).
4. **The md editor's save reflows a file** (stage 4's follow-up log). **"Please fix this
   reflow, at least limit to the section changed. This is actually high priority for me, almost
   bug level."** Fixed in [#111](https://github.com/stillpointlab/surfaces/pull/111): a save
   rewrites the top-level blocks that changed and writes every other block back as the text it
   was set with. What is left (an edit inside a list rewrites the whole list; the sheet
   editor's save) is in the seed
   [a save keeps the rest of the file](../../../unassigned/seeds/a-save-keeps-the-file.md).
5. **The preview pages in Context Manager** (public, library, claim review) still mount without
   the descriptors. They stay out of stage 5's adoption. **Jamie asked where this is captured,
   since it reads as more than a follow-up, and whose it is, and then asked for the seed.** The
   pages are Context Manager's and so is the work: a seed in its own pool
   (context-manager#1199). This repository already supplies what they would mount through. The
   two hosts' mounts were compared for the seed: they share three lines (load, create the
   element, `apply`), so nothing moves here.

## Task list

- [x] **H1, H2:** [undo-journal](../../phase5/specs/undo-journal.md) amended.
- [x] **H3, M1, M2:** [host-runner](../../phase2/specs/host-runner.md) amended.
- [x] **H4, H5, M3, M4, M5, M7, M8, L1, L3, L4:**
      [apps-in-the-local-host](../../phase3/specs/apps-in-the-local-host.md) amended.
- [x] **H6, M6:** [checkin-review](../../phase4/specs/checkin-review.md) amended.
- [x] **H7, M9:** [context-manager-adopts-apps](../specs/context-manager-adopts-apps.md) amended.
- [x] **M4, L2:** [app-module-grows](../../phase2/specs/app-module-grows.md) amended.
- [x] **M8, and the walks' selectors (H7):** [app-shells](../../phase2/specs/app-shells.md) amended.
- [x] **Decisions 1 to 4:** Jamie, 2026-11-14.
- [x] **Decision 5:** a seed in Context Manager's pool (context-manager#1199), 2026-11-14.
