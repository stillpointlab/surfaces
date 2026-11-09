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
- seeds: `tasksManifestSeedContent`; and the pool's `formatOrderFile`;
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
- `moves` (optional): pending moves, each card's current path and the old paths it moved from. An
  old path is hidden from every state: a card is where it moved to.

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
it; and `<spl-tasks-nav>`, the stage/phase tab strip (below). It imports `./types`, `./paths`, `common-format/app`, `common-format/elements`,
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

In the harness (`npm run dev`, "tasks"), fixtures cover every card state, the stage view, an empty
board, this repository's own `docs/tasks/` as files alone, and each dialog open; an in-memory host
answers the ops. The strip sits above the board in every fixture, with its own in-memory host, and
the "Nav:" fixtures show a phase that is not current, no pointer, and the close dialog.

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
  first. Paths it does not list sort last, by path. The app regenerates this file whole when it
  reorders the pool, so comments in it do not survive a reorder.

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
pool's `order.yaml` is the one file the app writes whole.

The app never writes files that are not cards. Markdown inside a board or the pool that sits outside
every kind folder (a `README.md` beside the kind folders, say) is reported by
`collectUnprojectedFileWarnings` (ADR-0028 decision 4); Context Manager expects to relax that rule,
since agents routinely leave such files.
