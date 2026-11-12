# @stillpointlab/tasks-app

The tasks app's core: DOM-free, so a host runs it on its server and in its client alike. The root
entry (`.`) exports:

- the rules over a host's files: the projections and the draft helpers (see Rules below);
- reading: `parseTasksManifest`, `validateManifestAgainstTree`, `detectBoards`, `detectPool`,
  `parseFrontmatter`, `readColumn`, `parseCardProjection`, `parseOrderFile`, `buildTasksNav`;
- byte-preserving rewrites: `rewriteFrontmatter` for cards; `rewriteManifestCurrent`,
  `appendManifestListEntry`, `patchManifestEntryKey`, `removeManifestListEntry`,
  `patchManifestTopLevelScalar` and `appendManifestTag` for the manifest; `rewriteRelativeLinks`
  for a moved card's links;
- seeds: `tasksManifestSeedContent`; and the pool's `formatOrderFile` and `rewriteOrderFile`;
- the lifecycle: `tasksLifecycle`, the `AppLifecycle` a host mounts a tasks folder with (its scope,
  and the boards its tree shows);
- no exceptions for rules: the manifest patches answer `Result<{ content }>` from
  `@stillpointlab/common-format/app`, and a refusal carries a `code`, a `message` and, where there
  are some, zod `details`, which the host maps to its own errors.

Two more entries import nothing, for a client that needs them without the core (`.` builds the
manifest's zod schemas at module scope, which a bundler cannot drop):

- `./types`: the shared types and their constants (`BUILTIN_TASK_KINDS`, `taskKindById`,
  `UNASSIGNED_DIR`, `UNASSIGNED_COLUMN_ID`, `POOL_ORDER_FILE`);
- `./paths`: the naming rules (`slugifyTaskId`, `TASKS_SLUG_PATTERN`, `TASKS_ID_MAX_LENGTH`,
  `TASKS_DEFAULT_FOLDER`).

A third, `./create`, is the create form's checks (`checkTasksCreate`, with the limits and default
columns and kinds the form shows). It imports only `./paths` and `./types`, and `planTasksCreate`
runs the same checks, so the form and the plan cannot drift.

It was moved as-is from Context Manager (source commit `30428c3c`), where the host side stays:
drafts, check-in, the pool and board services, routes and the task board. The rest of this README
is the file format, drawn from Context Manager's ADR-0014, ADR-0020, ADR-0021 and ADR-0027.

## Rules

A host hands the core a `TasksSnapshot`, the app contract's `AppSnapshot` with two additions:

- `manifestPath`: the `tasks.yaml` the instance is anchored at.
- `paths`: every path the host can see, its tree's files and the files it created that have no
  upstream yet.
- `files`: the contents it read, with its drafts already laid over: the manifest, the pool's order
  file, and the cards it has. `null` (or a missing path) is a file the host could not read.
- `projections` (optional): cards the host holds parsed (`CardProjection`, as
  `parseCardProjection` makes it) and did not read, by path. A path in `files` wins.
- `moves` (optional): pending moves, each card's current path and the old paths it moved from, the
  original (the anchor) first, then the paths it passed through. The anchor is hidden everywhere
  (every state, pool order, column counts, card lookup): a card is where it moved to. The paths
  it passed through are for finding links to fix; a card created at one since still shows.

**Projection.** `projectTasksBoard(snapshot, path, facts)` is one board,
`projectTasksStage(snapshot, stage, facts)` one stage's phases as rows, and
`projectTasksNav(snapshot)` the tab strip's nav with the `current:` pointer and the done column.
Each is `null` when the manifest is missing or does not parse, and for a path that is no board or a
stage with no phases. A phase with no folders yet (the pointer's, or `stage1/phase1` of a bare
manifest) is an empty board. All three are built on `resolveTasks(snapshot)`, which a host reads
to refuse a broken manifest: `null` when it is gone, `TASKS_MANIFEST_INVALID` when it does not
parse, else the manifest, its warnings, the boards and the pool. The `projectResolved…` forms take
that resolution, and `projectResolvedCard(snapshot, tasks, path, facts)` is one card where it sits,
for a host answering with a single card; `projectCardEntry` projects one from its entry and
location when the host already knows them.

`facts` are what only the host knows, laid onto the states: per card by path, its `title`,
`tracked`, `changed`, `dirty`, `versionColumn`, `diverged`, `movedFrom`, `checkinPrUrl` and
`prState`; the order file's `changed`; and the `housekeeping` files that join a check-in. A card
with no facts is titled by its file name and has no local work. Ids are never facts: the core's
types carry none, and a host lays its own ids over the states. `columnOfContent(content, manifest)`
is the column a card's content renders in, for a host working out `versionColumn`.

Two more lists tell the ops what only the host knows: `created`, the cards created in the host
that have no upstream file yet, and `inFlight`, the cards whose check-in pull request is open.

**Ops.** Each op function takes the snapshot and the op in the shape the board asks for it, naming
cards by path, and answers the `changes` to write (contract `FileChange`s) or a refusal with the
codes and messages Context Manager's endpoints have always sent. Every refusal is decided before
any change.

- `moveTaskCard(snapshot, { path, column })` rewrites the column key (`null` drops it). A pool card
  has no column, and a rewrite that would break a valid frontmatter block is refused.
- `moveTaskCardFile(snapshot, { path, target, coMoving? })` moves the file to the pool or to a
  board's column: one `move` change, the column key rewritten and the file's relative links
  re-rooted (`coMoving` names files moving in the same batch, whose links between them stay). A
  card leaving the pool also answers the order file without it. It refuses an occupied
  destination, a created card whose first check-in is in flight, and undoing a move whose check-in
  is in flight. It answers the new `path` and `location`; the move's own bookkeeping (what to
  delete at check-in) is the host's.
- `reorderTaskPool(snapshot, { paths })` writes (or creates) the order file through
  `rewriteOrderFile`, which keeps its comments and blank lines (see Pool order).
- `setTaskCardTitle` and `setTaskCardTags` rewrite one key; tags must be in the registry.
- `createTaskCard(snapshot, { boardPath, title, kind, now })` names the card from its title and
  creates it from its kind's template (a snapshot file) or a frontmatter stub, with the title and
  `now` seeded in: the core reads no clock. It answers the new `path`.
- `referencesTo(snapshot, path)` lists the markdown files among the snapshot's contents that link
  to where a moved card used to be, and `fixTaskReferences(snapshot, { path, referencingPaths })`
  points their links at its new path.

The manifest ops write `tasks.yaml`, byte-preserving: comments, key order and quoting survive.

- `addTasksTag(snapshot, { tag })` adds a tag to the registry and answers the registry after it; a
  tag already there, in any casing, changes nothing.
- `editTasksManifest(snapshot, { edit })` is one board-settings change (`add-column`,
  `update-column`, `remove-column`, `set-default-column`, `set-done-column`, `add-kind`,
  `update-kind`, `remove-kind`) and answers the `manifest` and `warnings` after it. Removing is
  refused while anything uses what goes: a column some card carries (a card the host neither read
  nor holds parsed counts as carrying it, so the host loads every board card for this one), the
  manifest's explicit default or done column, a kind with files under its folder, and the last
  column or kind. A shape the rewriter cannot patch safely, or a result that would not parse, is
  refused (`TASKS_MANIFEST_UNPATCHABLE`, or the rewriter's own code) rather than guessed.
- `createTasksStagePhase(snapshot, { kind, stage? })` points `current:` at the next phase of a
  stage, or the next stage's phase 1, after the last in the nav, and answers its `stage`, `phase`
  and `path`: a phase with no folders is already a board.
- `setTasksCurrent(snapshot, { stage, phase })` points `current:` at a phase the nav shows.
- `closeTasksStagePhase(snapshot, { kind, paths })` moves `current:` on from the pointer's phase
  (to the next phase after it, or the next stage's phase 1) and moves the named cards there, each
  keeping its column. The whole selection is checked first: a card must be on the closing phase,
  not done, and not need attention. A card already under the target is skipped, so a close can run
  again. The changes are the moves, then the manifest's write; it answers the `target`, how many
  `moved`, and whether the target was `created`.

**Creating tasks** is two steps, as for inventory: `planTasksCreate(input)` answers the manifest to
seed (or refuses the repository root without `confirmRoot`, and a seed the app would not accept),
and `placeTasksCreate(plan, { taken, reusable })` refuses a seed path, or a folder above it, that is
already a file.

**The contract.** `tasksCore` is the same functions as the app contract's `AppCore`: views
`board { path }`, `stage { stage }` and `nav`, the ops above (`move`, `move-file`, `reorder-pool`,
`set-title`, `set-tags`, `create-card`, `fix-references`, `add-tag`, `edit-manifest`,
`create-stage-phase`, `set-current`, `close`), and `seed` (`planTasksCreate`). The app-core test
holds every op to the contract's round trip; fixing references runs over a snapshot with a pending
move, laid on through the op's `snapshot`.
`findTaskCard(tasks, path)` is a card's kind and where it sits, for a host that needs them.

**The module.** `tasksModule` is the app as a host runs it (`AppModule`): the twelve ops above are
the core's, and the host answers `resolve`, `scan-references`, `read-file`, `refresh-stage` and
`close-candidates` itself. Its replies are what the board and the strip settle on: a card for a
move or a new card, the pool of the view on screen for a reorder, the stage and phase for a new
one. `create-card` is stamped with the host's time. Refusals keep the statuses Context Manager's
endpoints send. The op maps both elements ask with (`TaskBoardOps`, `TasksNavOps`) live in
`elementOps.ts`, DOM-free, and the element entry re-exports them.

**Drafts.** When to rebase a diverged draft is the host's decision; the comparison is the core's.
`metadataOnlyCheck(draft, base)` says whether a draft changes only its base's frontmatter, or
answers the reconstruction the host formats its own way and compares with the draft.
`rebaseMetadata({ draft, base, latest, keys, mineWins, metadataOnly })` answers the `rebased`
content, or why not: `metadata` (a key both sides changed differently, or a change the patch
cannot carry) or `content` (the draft edits the body). `keys` is `trackedCardKeys(manifest)`;
`mineWins` is the explicit resolution, where my changes to those keys win and the rest are dropped.
`metadataDelta` is the key-wise comparison under both.

## Element

`@stillpointlab/tasks-app/element` registers `<spl-task-board>`: the Kanban board over one phase
folder, or (with `variant="stage"`) every phase of a stage as swimlanes, with the backlog pool beside
it; `<spl-tasks-nav>`, the stage/phase tab strip; and `<spl-tasks-create>`, the create form (both
below). It imports `./types`, `./paths`, `./create`, `common-format/app`, `common-format/elements`,
`common-format/html`, `common-format/pointer-drag` and `@stillpointlab/modal-dialog-component`, never
the core's root.

- **State in.** `setState(board)` or `setStageState(stage)`: a host's projection of the folder with
  its own overlay (which cards are linked, changed, checked in or drifted). The board settles
  (`whenReady()`, the `ready` attribute) once it has rendered one. `boardState` reads it back.
- **Attributes.** `variant` (`board` or `stage`, read when the board connects) and `storage-key`
  (where the pool's collapsed state is remembered).
- **Ops out**, each asked through `requestOp` and naming its card by repo path:

  | Op                | Fields                                   | Reply                    |
  | ----------------- | ---------------------------------------- | ------------------------ |
  | `move`            | `path`, `column`                         | `{ card }`               |
  | `move-file`       | `path`, `target` (`{ pool }` or a board) | `{ card }` at its path   |
  | `reorder-pool`    | `paths`                                  | `{ pool }`               |
  | `resolve`         | `path`, `mode`                           | `{ card }`               |
  | `scan-references` | `path`                                   | `{ references: paths }`  |
  | `fix-references`  | `path`, `referencingPaths`               | `{ fixed }`              |
  | `read-file`       | `path`                                   | `{ content }`            |
  | `refresh-stage`   | `stage`                                  | `{ stage }`              |
  | `edit-manifest`   | `edit` (one manifest edit)               | `{ manifest, warnings }` |
  | `create-card`     | `boardPath`, `title`, `kind`             | `{ card }`               |
  | `set-title`       | `path`, `title` (or `null` to remove)    | `{}`                     |
  | `set-tags`        | `path`, `tags`                           | `{}`                     |
  | `add-tag`         | `tag`                                    | `{ tags }`, the registry |

  A move renders at once and settles on the reply, or rolls back on a failure (whose `message` the
  board shows). A host that keeps ids maps paths to them, and links a tracked card before answering.
  After a dialog's change the host hands the board a fresh state, as it would after any edit.

- **Dialogs.** The board owns four `<modal-dialog>`s, made once and kept as its last child while it
  repaints, so a refresh behind an open dialog leaves its inputs and focus alone:
  - **settings** (columns, kinds, the default and done columns, one `edit-manifest` per change, its
    refusals in a status line), opened by the host's own button through `openSettings()`, which
    answers `false` when there is no board state to edit;
  - **new card**, from the toolbar's "+ New" buttons (`create-card`);
  - **title** and **tags**, from a card's ⋯ menu on a phase board (`set-title`; `add-tag` at once
    and `set-tags` on Save).

  New card, title and tags close before their op and report a refusal as a notification.

- **Requests**, plain bubbling events the host answers with its own UI: `open-card { path }`,
  `checkin-request` (the changed cards, the pool's order file by path, housekeeping files),
  `open-options-menu` (a card's ⋯ menu; answer with `options-menu-select` on the board) and
  `notification { message, type }`. `markCheckinInFlight(paths)` and `clearCheckinInFlight()` show a
  check-in in progress.
- **Styles** live in the board's light DOM and read the `--spl-*` tokens, including
  `--spl-pool-surface`, `--spl-alert-color`, `--spl-gold-color`, `--spl-primary-color` and the
  board's shadows.

### The tab strip

`<spl-tasks-nav>` renders the stages as tabs (the active one holding its phase select, with
"+ New phase"), "+ stage", a "Boards…" select for boards outside the stages, "Close…" while
`tasks.yaml` has a `current:` pointer, and on a phase page either the ★ current marker or "Set
current" (never on a phase the nav does not list). It is light DOM and is its own flex row; a host
places it.

- **State in.** `setState({ nav, current, currentPointer, currentPointerPath, doneColumn })`: the
  core's `buildTasksNav` result, the page's selection (`stage`, `phase`, `other`, `boardPath`), the
  pointer and its board path, and the done column. `navState` reads it back.
- **Links in.** `links: TasksNavLinks` gives `stage(n)`, `phase(n, m)` and `board(path)`; without
  them stage names render as text.
- **Ops out:**

  | Op                   | Fields           | Reply                                           |
  | -------------------- | ---------------- | ----------------------------------------------- |
  | `create-stage-phase` | `kind`, `stage?` | `{ stage, phase }`                              |
  | `set-current`        | `stage`, `phase` | `{}`                                            |
  | `close-candidates`   | `path`           | `{ cards: [{ path, title, column }] }`          |
  | `close`              | `kind`, `paths`  | `{ target: { stage, phase }, moved, created? }` |

- **Requests:** `navigate { href }` (a phase or board chosen, or one just created or closed to),
  `reload-request` (after Set current), `notification`, and `open-options-menu` from "Close…",
  answered with `options-menu-select` (`close-phase` or `close-stage`) on the strip.
- **The close dialog** comes with it: a `<modal-dialog id="close-dialog">` listing the pointer
  phase's cards outside the done column, all checked, and asking `close` with the checked paths.
  It is kept attached while the strip re-renders.

In the harness (`npm run dev`, "tasks"), every fixture runs on the core: the harness's memory host
holds a folder's files, answers the board's and the strip's ops through `tasksModule`, and
re-projects,
laying on the facts a host would (a card it changed is changed and linked, a moved column is dirty,
a moved card names its anchor). The fixtures cover every card state (a hand-built folder, with the
few facts no file shows), the stage view, an empty board, this repository's own `docs/tasks/`,
and each dialog open. The strip sits above the board in every fixture, and the "Nav:" fixtures
show a phase that is not current, a board outside the stages, no pointer, and the close dialog.

### The create form

`<spl-tasks-create>` is a manifest's own fields for a create: its columns (label, id and an
optional description) and kinds (label and id). Each id follows its label until it is edited by
hand, and the form says ids are permanent once created. A host lays it out in its create dialog
beside the folder and the root consent, which it owns, and answers its op.

- **State in.** `setState({ columns?, kinds? })` starts the form over with those labels; left out,
  Todo, In progress and Done, and Task.
- **`value()`** answers `{ input }`, the create's columns and kinds (`TasksCreateFields`), or the
  first problem `checkTasksCreate` finds. An untouched spare row is left out.
- **`submit()`** shows the first problem in the form's error line, or asks `create { input }` and
  shows a refusal the host answers. Enter in a text field submits.
- **`showError(failure)`** shows a host's own refusal in the error line, marking the row its
  `details[0]` names (`{ field: 'columns' | 'kinds', index }`). `clearError()` hides it. `focus()`
  focuses the first column.
- **`create-validity { valid }`** bubbles whenever the fields go from valid to invalid or back.
- The ids and classes are those of Context Manager's dialog, which the form replaces
  (`#create-tasks-columns`, `#create-tasks-kinds`, `#create-tasks-error` and the rest).

The harness's "Create" fixture answers the form with `tasksCore.seed`, in the folder the "Create
in" control chose (a folder, the repository root, or the root with consent), and shows the new
manifest's first board.

## The tasks folder

A `tasks.yaml` manifest marks a folder as a tasks app. Everything else is derived from the files
around it; the app keeps no board or card table, so files edited by hand always win.

```text
docs/tasks/
  tasks.yaml                 the manifest: columns, kinds, current pointer, tags
  spec.template.md           templates, wherever the manifest points
  stage2/
    phase1/                  a board
      briefs/apps_breakout.md
      spikes/apps-breakout.md
    phase2/
      specs/inventory-core.md
  unassigned/                the backlog pool, never a board
    seeds/result-types.md
    order.yaml               the pool's priority list
```

- **Boards.** A folder named `stage<N>/phase<M>` (relative to the manifest's folder) is a board,
  labelled "Stage N — Phase M". A folder that holds a declared kind's folder is also a board, for
  unconventional layouts. A phase with no folders yet is an empty board, and the `current:` phase
  always shows in the navigation, so a folder holding only `tasks.yaml` is a working tasks app.
- **Kinds.** Inside a board, each kind has a folder (`specs/`, `briefs/`, …). A card's kind is its
  folder, never its frontmatter.
- **Cards** are the Markdown files in those folders.
- **The pool.** `unassigned/` beside the manifest holds work not yet assigned to a phase, in the
  same kind folders. It shows as a shared first column on every board. Being in the pool is a
  location, not a column: assigning a card moves the file.
- **Pool order.** `unassigned/order.yaml` is a YAML list of repository paths, highest priority
  first. Paths it does not list sort last, by path. A reorder refills the file's item lines in
  the new order, each path keeping its trailing comment, and leaves comment and blank lines where
  they are, so a group heading heads whatever ranks below it. A path that leaves the pool loses its
  line; a new one goes after the last item. Only a file the app cannot read line by line (a flow or
  nested list) is regenerated.

## `tasks.yaml`

```yaml
version: 1

columns:
  - id: todo
    label: Todo
    description: Not yet handed to an agent.
  - id: in-progress
    label: In progress
  - id: done
    label: Done

frontmatterKey: column
defaultColumn: todo
doneColumn: done

kinds:
  - id: seed
    badge: sd
  - id: spec
    badge: sp
    creatable: false
    template: docs/tasks/spec.template.md

current:
  stage: 2
  phase: 3

tags:
  - code
  - docs
```

| Key              | Required        | Meaning                                                                                                                           |
| ---------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `version`        | yes             | `1`.                                                                                                                              |
| `columns`        | yes             | The workflow columns, in order: `id` (slug), `label`, optional `description`.                                                     |
| `frontmatterKey` | no              | The card key that holds its column: `column` (default) or `status`.                                                               |
| `defaultColumn`  | no              | Where new cards land. Default: the first column.                                                                                  |
| `doneColumn`     | no              | The column that means finished. Default: the last column.                                                                         |
| `kinds`          | no              | The card kinds, in display order (below). Without it, the built-in kinds apply.                                                   |
| `templates`      | when no `kinds` | Legacy template paths for the built-in kinds; `brief` and `spec` are required. Ignored, with a warning, when `kinds` is declared. |
| `current`        | no              | `stage` and `phase`: where the board opens. The app moves it when a phase closes.                                                 |
| `tags`           | no              | The tag registry the card tag picker offers. Tags match without regard to case.                                                   |

Slugs match `^[a-z0-9][a-z0-9_-]*$`. Column ids and kind ids must be unique, and `unassigned` is
reserved for the pool: no column, kind or kind folder may use it. `defaultColumn` and `doneColumn`
must name declared columns. Unknown keys are warnings, not errors, because the file is edited by
hand.

### Kinds

Each `kinds:` entry needs only an `id`:

| Key         | Default               | Meaning                                                              |
| ----------- | --------------------- | -------------------------------------------------------------------- |
| `label`     | the id, capitalised   | Display name.                                                        |
| `badge`     | the id's first letter | The collapsed pool card's badge. Two kinds sharing one is a warning. |
| `dir`       | the id plus `s`       | The kind's folder inside a board and the pool.                       |
| `creatable` | `true`                | Whether boards offer "+ New <kind>".                                 |
| `template`  | none                  | Repository path of the new-card template; it must exist.             |

A creatable kind without a template creates cards from a frontmatter stub (title and default
column). Without a `kinds:` block, the built-in kinds are spike, brief, spec (not creatable), review
and test, in folders named for their plural.

## Cards

A card is Markdown with optional YAML frontmatter at the very start of the file:

```markdown
---
column: in-progress
title: The inventory core moves here
tags: [code, apps]
pr: 38
completed: 2026-11-04
---

# Spec: the inventory core moves here
```

- **`column`** (or the manifest's `frontmatterKey`) is the card's one workflow field. A card with no
  frontmatter, unreadable frontmatter, no column, or a column the manifest does not declare goes to
  the board's needs-attention bucket rather than failing.
- **`tags`** come from the manifest's registry.
- Other keys (`pr:`, `completed:`, `blocked:` and your own) are kept as they are.
- **`title`** names the card; without one, the card shows its filename.
- Cards in the pool carry no column: being in the pool is their state.

## How the app writes

Moving a card, changing its tags, moving `current`, editing columns or kinds and adding a tag are all
rewrites of the existing text. Only the lines that change are touched; comments, key order, other
keys, line endings and the final newline stay as they were. Ids never change through the app. A
manifest shape the app cannot patch safely is refused with a message to edit the file by hand. The
pool's `order.yaml` keeps its comments and blank lines too: a reorder refills its item lines in the
new order, and only a file it cannot read line by line is regenerated.

The app never writes files that are not cards, and it does not warn about them either: markdown
inside a board or the pool that sits outside every kind folder (a `README.md` beside the kind
folders, an agent's notes) is left alone. ADR-0028 decision 4 asked for a warning per such folder;
agents leave these files routinely, so Context Manager relaxed it.
