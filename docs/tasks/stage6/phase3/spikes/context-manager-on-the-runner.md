---
column: done
pr: 196
completed: 2026-11-26
created: 2026-11-26T12:33:00-07:00
tags: [common, hosts, context-manager, spike]
---

> Tech-spike working notes: capture the question, what you find, and where it points — enough that a
> brief can be distilled from it later. Keep it honest about uncertainty; link sources. The
> `column:` frontmatter above drives this file's card on the task board (absent for pooled spikes).

# Spike: Context Manager on the runner

## Question

Jamie, 2026-11-22: "I suspect I'll want CM to adopt the runner but need more info". The
[seed](../../../unassigned/seeds/context-manager-on-the-runner.md) lists what a spike would answer.
This spike gathers it. It decides nothing, and nothing in it is a plan Jamie has agreed.

It is done by reading only: surfaces at `146c56c`, Context Manager at `b0fdb288`. Nothing was built
or run. Context Manager's paths start with `src/` or `docs/`; surfaces' with `packages/`. Each
finding says what it rests on: **read** (in the code), **counted** (`wc`, `grep`, `git log`), or
**inferred**.

## Findings

### What changes the seed's picture most

- **Context Manager never refuses a stale write.** `saveDraft` records the base it is handed and
  writes; it compares it with nothing (`src/services/draft.service.ts:183-232`). ADR-0030 deferred
  compare-and-set on purpose (`docs/adr/0030-draft-base-version-is-provenance.md:47`). The port's
  `HOST_FILE_CHANGED` is compare-and-set. They are different checks, not two spellings of one.
  (read)
- **One op reaches four services, so no transaction can hold it.** A rewrite goes to Redis
  (`draft.service.ts:218,230`); a new file to Postgres and S3
  (`src/services/git/repoImport.service.ts:829-910`); a link reads GitHub, then writes S3 and
  Postgres (`repoImport.service.ts:398`, `:876`). Prisma's `$transaction` is used inside single
  repository functions; only two repositories under `src/models/database/repositories/` take a
  transaction client (`ledger.repository.ts:249`, `deletion.repository.ts`). (read, counted)
- **One op is not all or nothing even by intent.** Tasks' `move-file` marks its order-file prune
  `bestEffort`: if it fails, the move stands (`src/services/tasks/board.service.ts:148-150`,
  `src/services/apps/appHost.ts:511-518`). An all-or-nothing `put` contradicts that. (read)
- **Neither Context Manager app loads what the runner loads.** Both bring their own loader, so the
  generic one is called by no app (`appHost.ts:439-446`; `grep` finds no other caller of
  `AppFilesService.loadInstance`). Tasks reads only the files the op names
  (`board.service.ts:159-229`, `:306-337`); the runner reads every file in the lifecycle's scope,
  twice per op (`packages/common/src/host/runner.ts:134`, `:255`, `:286`), and tasks' scope is every
  card (`packages/apps/tasks/src/lifecycle.ts:34-48`). Context Manager's own board has about 604
  Markdown files under `docs/tasks` (counted). The `know` gap the seed names is the smaller half of
  this.
- **Moves are the app's, and need the op.** A move is not a storage write in Context Manager: the
  tasks entry saves a draft and then rewrites the good's `gitOrigin`, with a column taken from the
  op (`board.service.ts:344-366`, `:1068-1114`). Inventory has no `move` and is refused
  (`appHost.ts:489-494`). A port's `put` sees no op. (read)

### 1. Can Context Manager's storage be a `StoragePort`?

The port is four calls (`packages/common/src/host/index.ts:29-41`). The runner uses `list`, `get`
and `put`; it never calls `status` and never reads the versions `put` answers (`runner.ts`, read
whole). `status` is the suite's, and the local host's facts (read).

| Port call                      | What Context Manager has                                                                                                                     | What does not fit                                                                                                                                                                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list()`                       | The tree cache's blobs joined with the app-only goods (`src/services/apps/appFiles.service.ts:124-132`)                                      | No folders for app-only files (`:181-184` adds blobs only); a moved tracked card's old path stays listed, hidden by the core through `moves` (`board.service.ts:535-554`); no way to refuse: an unsynced tree is `REPO_NOT_SYNCED` (`appHost.ts:310-312`), and `list` returns no `Result` |
| `get(path)` with a `version`   | Draft-first read (`appFiles.service.ts:212-272`)                                                                                             | Its `version` is the draft's base (`:237`), which a save does not change, so it cannot tell two contents apart; a tracked file with no good has no version (`:251-263`); no NUL check, no 2 MiB limit, no path rules                                                                      |
| `put(changes)`, all or nothing | One change at a time: seed, draft or the app's move (`appHost.ts:504-558`)                                                                   | No plan step, no compare-and-set, no lock across files (the Redis lock is per good and refuses, `draft.service.ts:165-172`), no delete, `bestEffort` changes                                                                                                                              |
| `status()`                     | `fileStates`: dirty, and new for a seeded file (`appFiles.service.ts:60-71`); a move in `gitOrigin.movedFrom` (`board.service.ts:1096-1104`) | Nothing for a deleted file; `moved` is tasks' bookkeeping, not the host's                                                                                                                                                                                                                 |

So: yes, as an adapter, but only with new code for the version, the plan step, compare-and-set, a
lock and moves; the rows' last column is that code. (inferred from the rows, each read)

### 2. `put` is all or nothing; drafts are written one at a time

- **Today there is no transaction around an op's writes.** `runOp` links each unlinked file in turn
  (`appHost.ts:236-240`), then writes each change in turn (`:254`, `:511-518`). (read)
- **What a write that dies half way leaves:** the links already made, which ADR-0023 holds to be
  harmless (a linked good with no draft is clean); the seeds already made, each a good, a draft row
  and a version in S3, each with its own clean-up on failure (`repoImport.service.ts:904-910`); the
  drafts already saved. A draft is two Redis writes, content then metadata (`draft.service.ts:218`,
  `:230`), so it can itself be cut between them. A retry runs the op on the new state; nothing makes
  it idempotent. (read; the retry's effect is inferred)
- **Which ops write several files:** tasks' `close` and `fix-references` take lists
  (`board.service.ts:329-332`); `move-file` writes the card and may prune the order file
  (`:313-319`). (read)
- **Could there be one?** Not across Redis, Postgres and S3. What could exist (inferred): a plan
  step that makes every check before any write, as the node port does
  (`packages/hosts/local/src/server/port.ts:12-23`); drafts of one op in one Redis `MULTI` (`Cache`
  is a `RedisClientType`, `src/models/cache/index.ts:9`); seeds undone on failure with the clean-up
  that exists. A crash mid-write would still leave a part, which is also true of the node port
  (`port.ts:575-580`), so the suite's bar ("a refused `put` writes nothing") is reachable; a true
  transaction is not.

### 3. Where linking goes (ADR-0023)

- **On a file's first change:** the op is applied to the tracked file as read from the tree; the
  scope is checked; each rewritten or moved file with no good is linked (`appHost.ts:236-240`).
  Linking imports the file at the tree's blob, or wakes a dormant good at the head
  (`repoImport.service.ts:173-215`, `:478-519`). The instance is loaded again, the op applied again
  and the scope checked again (`appHost.ts:241-252`). (read)
- **Why twice:** the comment says so each draft carries the linked version as its base
  (`appHost.ts:232-235`). A second reason, by reading: a woken good keeps any draft it had
  (`reseedDraft: false`, `repoImport.service.ts:487-502`), and the draft-first read then shows that
  draft, not the blob the op was applied to. (read; that this is the common case is not known)

| Shape                                      | How                                                                                                                                                                                  | What it costs                                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inside `put`**                           | `get` answers a tracked file with a version made from its blob; `put` links it, compares what the link shows with the base, and refuses `HOST_FILE_CHANGED` if a woken draft differs | The silent second apply becomes a conflict the person sees and retries; a refused `put` has still linked (no content changes, except a woken draft surfacing); the runner is unchanged |
| **A step between the check and the write** | `RunnerHost` gains an optional step that links and answers "load again"; the runner then loads, applies and checks once more, as `appHost.ts:241-252` does                           | About 25 to 40 lines and their tests in the runner (inferred), carried unused by the harness and the local host; Context Manager's behaviour is kept as it is                          |

### 4. Versions and bases

| Question               | The port's `version`                               | A draft's base                                                                                   |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| What it is             | An opaque value that changes with the content      | The published version the draft was made from, a provenance label (`ADR-0030`, decision 1)       |
| Checked on write?      | Yes: a stale one refuses the whole call            | No: recorded; a base move without a content change is ignored (`draft.service.ts:191-210`)       |
| Changes on each write? | Yes (`packages/common/src/testing/host.ts:96-110`) | No: a draft keeps its base across saves (`appFiles.service.ts:237`)                              |
| Keyed by               | Path                                               | Good and person: a move keeps the good (`board.service.ts:350`); each person has their own draft |
| A tracked file         | Has one                                            | Has none (`appFiles.service.ts:251-263`)                                                         |

- **Not the same check.** They can coexist: a port could answer a digest of the content as its
  version (a draft's `fileHash`, a version's, or the blob's sha) and keep the provenance base to
  itself, read again inside `put`. (inferred)
- **Adopting the port's check changes behaviour.** Two tabs that both move a card get a 409 where
  today the later write wins and the difference surfaces at check-in. That is ADR-0030's deferred
  item, decided by the way in. (inferred)

### 5. `know`

- **The runner asks once per load,** with the module and the loaded instance (`runner.ts:47-51`,
  `:154-161`), and lays the answer's snapshot over the loaded one. (read)
- **Context Manager's loader takes more than the seed says.** `load(ctx, { view, op, written })`
  (`appHost.ts:67-71`, `:202-216`). Tasks uses the op to choose which files to read
  (`board.service.ts:306-337`), the view to refuse a pool reorder before anything is written
  (`TASKS_VIEW_REQUIRED`, `:165-170`), and `written` to build the reply's card facts and to answer
  the order file with the bytes just written rather than a re-read (`:176`, `:195-229`). (read)
- **The overlay needs the loaded instance,** which `runOp` does not return. A `RunnerHost` made per
  request can keep the last one it was asked about, as the local host keeps its digest
  (`packages/hosts/local/src/server/apps/facts.ts:79-90`). (read; the fix is inferred)
- **So either** `know` carries `{ op, view, written }` (a few lines in the runner, ignored by the
  other hosts), **or** Context Manager stops choosing files by op and computes facts for the whole
  scope on every load, which is the cost in the fifth finding above. The reorder check could move to
  the module, if the module's bound on an op could see the view; today it cannot
  (`packages/common/src/app.ts`, `bounds.op`). (inferred)
- `taken` is in Context Manager's snapshot and not the runner's: every good's path, a linked file
  whose path left the tree included (`appFiles.service.ts:198`,
  `src/services/inventory/inventory.service.ts:100`). `know` could add it. (read)

### 6. Refusals

`refusalStatus` asks the module alone (`src/services/apps/refusalStatus.ts:15-17`); both modules
class an unknown code `invalid` (`packages/apps/tasks/src/module.ts:144`,
`packages/apps/inventory/src/module.ts:72`). Run as is, `HOST_FILE_CHANGED` would go out as 400. The
local host asks `hostRefusalClass` first
(`packages/hosts/local/src/server/apps/app-host.ts:97-100`). (read)

| Runner or port                                                    | Class       | Context Manager today                                                                                                         |
| ----------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `APP_OP_UNKNOWN`, `APP_*_INVALID`                                 | invalid     | The same codes, 400 (`appHost.ts:151-155`, `:194`)                                                                            |
| `APP_PATH_OUT_OF_SCOPE`                                           | invalid     | The same, 400 (`appHost.ts:483-487`)                                                                                          |
| `APP_MANIFEST_NOT_FOUND`                                          | not-found   | 404 with the app's own code, `TASKS_MANIFEST_NOT_FOUND` or `INVENTORY_MANIFEST_NOT_FOUND` (`appHost.ts:209-213`)              |
| `APP_CHANGES_INVALID`                                             | invalid     | **None:** a path named twice is written twice, in order                                                                       |
| `HOST_FILE_CHANGED`                                               | conflict    | **None** (no compare-and-set)                                                                                                 |
| `HOST_PATH_EXISTS`                                                | conflict    | A good's path only: `DatabaseConflictError` from the unique index (`digitalGood.repository.ts:171-178`); none for a tree file |
| `HOST_FILE_NOT_FOUND`                                             | conflict    | `NotFoundError('Repo file')`, **404**, from a link (`repoImport.service.ts:238-242`)                                          |
| `HOST_NOT_TEXT`                                                   | invalid     | At link time only: `REPO_TEXT_NOT_EDITABLE`, `REPO_FILE_NOT_IMPORTABLE`, `SHEET_CSV_NOT_EDITABLE`, 400                        |
| `HOST_FILE_TOO_LARGE` (2 MiB)                                     | invalid     | `DRAFT_TOO_LARGE`, **413**, at 10 MiB by default (`draft.service.ts:107-114`, `src/config/runtimeConfig.ts:597`)              |
| `HOST_PATH_OUTSIDE_ROOT`, `HOST_PATH_INVALID`, `HOST_BAD_REQUEST` | invalid     | **None**                                                                                                                      |
| `HOST_WRITE_FAILED`                                               | (unclassed) | Any thrown error, 500                                                                                                         |

Context Manager's refusals with no partner: `APP_FILE_NOT_LINKED` 409 (`appHost.ts:244-250`,
`:545-547`); `APP_MOVE_UNSUPPORTED` 500 (`:489-494`); `DRAFT_EMPTY_OVERWRITE` 409, an app writing an
empty file over a published one (`draft.service.ts:133-138`); `DRAFT_SAVE_IN_PROGRESS` 409
(`:170-172`); `TASKS_VIEW_REQUIRED` 400; and tasks' 400 for a manifest that does not resolve
(`board.service.ts:512`), where the runner loads a refused manifest alone and lets the core answer
(`runner.ts:120-129`). The routing and create refusals (`APP_NOT_HOSTED`, the flag's 404,
`REPO_NOT_SYNCED`, `<APP>_ALREADY_EXISTS`, `VIEW_SCOPE_OVERLAP`) stay outside any runner. **The
mapping is not whole.** A port may throw Context Manager's `ApiError` through the runner, which does
not catch, and the route would send it as it does today; that works and bypasses the classes. (read;
the last point inferred)

### 7. The three "known to be missing" items

- **A cut-off create and `reusable`: still true, and an all-or-nothing `put` does not close it.**
  The runner passes `taken` alone (`runner.ts:343-345`); Context Manager passes `reusable`
  (`appHost.ts:345-350`). Its instance is a row written after the files (`:358-362`), so a death
  between the files and the row leaves seeds with no instance whatever `put` does. To close: the
  runner's `createInstance` takes `reusable` from its caller and passes it on, a few lines. (read;
  the size inferred)
- **Overlap before `createInstance`: still true, and the two hosts' rules differ.** Context Manager
  compares folders, so an instance at the repository's root overlaps every other
  (`src/shared/utils/viewScope.utils.ts:38-43`, `appHost.ts:316-334`). The local host compares a
  root instance's seeded scope (`app-host.ts:344-371`, `:395-415`). One check in the runner needs
  the hosts to agree on one rule, or a hook each host answers. (read)
- **`revision` covers the scope's files and not the listing: true of the runner
  (`runner.ts:143-148`), closed by the local host (`facts.ts:37-39`), and moot for Context
  Manager,** whose `runOp` and `project` answer no revision (`appHost.ts:264-265`, `:390`) and whose
  pages are not refreshed by one. It bears on adoption only if Context Manager wants live refresh.
  (read)

### 8. The port's suite, case by case

By reading `packages/common/src/testing/host.ts`, not by running it. It has 45 cases today (counted:
18 tests, two of them tables of 10 and 19 rows), where the host-runner spec's "As built" counted 44.
"As is" means a thin adapter over today's services; "port code" means checks the adapter can make
alone; "new mechanism" means Context Manager's storage needs something it does not have.

| Cases                                                                                                                                                                                                                                                       | Verdict                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get`: a missing file, a folder; `put`: a write or move of a missing file; a write without a base; an empty call; `status` empty over the files as made; BOM and CRLF kept (8)                                                                              | **As is,** with codes mapped. BOM rests on `Buffer.toString('utf8')` keeping it (`src/services/github/githubClient.ts:438-439`); S3's read was not read                                                                               |
| `list` sorted with folders; `get` answers the version `put` answered; NUL; over 2 MiB; exactly 2 MiB; six path rules; a create with its folders; five "nothing is there" refusals; four bad requests; four root refusals (25)                               | **Port code.** The memory port has these checks as private functions (`packages/common/src/host/memory-port.ts:67-195`, `:241-294`); exported, an adapter would reuse them. The 2 MiB limit refuses files Context Manager opens today |
| `list` follows a `put`; a write with a matching base; one stale base refuses all; a move with content; a move without; deletes; two `put`s at once; a delete of a missing file or a folder; a stale base on a move or a delete; `status` for each kind (12) | **New mechanism:** compare-and-set, a plan step, a lock across the call, a move that is the host's and not tasks', and a delete Context Manager's apps do not have                                                                    |

The two-at-once case (`host.ts:319-337`) wants the second `put` to wait and then fail on its base;
Context Manager's per-good lock refuses at once with another code. Running the suite over Context
Manager also needs a connection made from a file map, with Postgres, Redis and S3 behind it: test
code it does not have. (read; counts counted)

### 9. Size

- **Today** (counted, `wc -l`, without tests): `src/services/apps/` is 1,410 lines: `appHost.ts`
  559, `appFiles.service.ts` 273, `checkinRecord.ts` 317, `checkin.ts` 156, `registry.ts` 55,
  `seedFile.ts` 33, `refusalStatus.ts` 17. ADR-0040's 1,887 (taken at `df2b1aab`, 2026-11-21) counts
  the client's generic parts as well; since then `appHost.ts` and `appFiles.service.ts` have not
  changed and the check-in files have grown by 433 lines. Check-in is outside the runner; what
  adoption touches is `appHost.ts`, the loaders and `seedFile.ts`.
- **What would go** from `appHost.ts` (inferred from its functions): `runOp`'s steps (lines
  189-266), `checkChanges` (`:467-497`), `loadWith` (`:433-447`), most of `project` (`:372-391`),
  and the bounds, seed and place steps of `create` (`:298-305`, `:345-357`). About 150 lines go;
  about 60 come back as calls, the overlay and the mapping. `unlinked`, `write` and `writeOne`
  (`:455-558`, about 70 lines) move into the port. `AppFilesService.loadInstance`
  (`appFiles.service.ts:160-203`, 44 lines) can go with or without adoption: nothing calls it.
- **What would stay:** `hosted`, `checkin`, `checkinOf`, `refusal`, the create's own checks (flag,
  synced tree, overlap, `reusable`, the instance row), both overlays, everything in check-in.
- **The new port must contain** a `list` (tree, app-only goods, moved anchors hidden, folders), a
  `get` (draft-first read, a content digest as version, the text and path checks), a `put` (plan,
  compare-and-set, a lock, linking in one shape, drafts, seeds, moves, undo), a `status`, and a map
  from Context Manager's errors to the port's codes. Estimate: **300 to 600 lines**, plus 50 to 200
  changed in tasks' entry to give facts from a whole-scope load. The low end rests on reusing the
  memory port's checks and leaving deletes out (the suite then needs an option to skip them); the
  high end on writing the checks again, a multi-draft writer in `DraftService` and deletes.
- **So Context Manager grows,** by about 150 to 650 lines net (inferred). `appHost.ts` shrinks; the
  host as a whole does not. The seed's "a smaller generic host" holds for one file only.

### 10. What has changed since 2026-11-22

- **Surfaces:** `b7d3ee5` (2026-11-23): the runner refuses to write over a file it could not read
  (`runner.ts:198-210`, `:275-282`). It bears directly: a port over Context Manager must give every
  readable file a version, tracked files included, which today have none. `9701bb7` is git's, in the
  node port; no bearing. (counted, read)
- **The token** (`4f8f4dd`) **and the raw route** (`bf0f6f3`, `3a2e0e0`, `532e5f4`, `657eaf4`,
  `c0f36df`, `d945733`) are in the local host's HTTP server (`host.ts`, `range.ts`), not in the
  port, the runner or the suite. **No bearing:** Context Manager has its own sign-in and its own
  routes. (counted, read)
- **Context Manager:** four commits (`91eb4e77`, `3f000c21`, `0c20897f`, `9a158240`), all about
  recording a check-in. None touches `runOp`, drafts, links, the loaders or the scope rules; those
  files are unchanged since `df2b1aab` (2026-11-21). (counted)

### Where the seed is wrong or out of date

| The seed says                                                          | The code                                                                                                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context Manager's `runOp` "takes the same steps"                       | Its loads are the app's and op-shaped, its writes are not all or nothing (`bestEffort`), and moves are the app's (§1, §5)                                  |
| Drafts are written "each against a base kept by good"                  | A base is recorded, not written against: no check (§4)                                                                                                     |
| Context Manager's loader "also takes the op and what was just written" | And the view; and both apps bring their own loader, so the gap is the files loaded, not only what `know` carries (§5)                                      |
| "The runner has no place for" linking                                  | True, and since `b7d3ee5` the runner refuses a rewrite of a file with no version, which a tracked file in Context Manager is (§10)                         |
| "Either Context Manager's port makes its writes one transaction"       | No transaction spans Redis, Postgres, S3 and GitHub (§2)                                                                                                   |
| `outOfScope` is "a copy of" `checkChanges`                             | Close: `checkChanges` also refuses moves an app cannot write and names a move's destination, not its source, in the message (`appHost.ts:484`, `:489-494`) |
| A `revision` gap for a host on the runner's revision alone             | Context Manager has no revision at all (§7)                                                                                                                |
| ADR-0040: 1,887 lines, `appHost.ts` 559                                | `appHost.ts` is still 559; the generic host grew by 433 lines of check-in since, which adoption does not touch (§9)                                        |

### What reading could not settle

- **Whether a draft read right after a save sees it.** Tasks answers a reorder with the bytes it
  wrote because "a draft read can lag the save" (`board.service.ts:195-199`; the cause was never
  written down in `docs/tasks/stage4/phase3/specs/pool_reorder_first_link_race.md`). The runner's
  reload and the suite both rely on reading what was just written. A test over real Redis, Postgres
  and S3 would say.
- **What a whole-scope load costs in Context Manager.** Measure an op on a board the size of Context
  Manager's own, on a development instance.
- **Whether `move-file`'s column can be read from the moved content** (`columnOfContent`), so that a
  port could make the move without the op. A test of the tasks core would say.
- **Whether Context Manager runs more than one server process,** which decides whether a lock across
  a `put` can live in memory or must be in Redis. Its infrastructure code would say.

### Faults noticed in passing

- **Context Manager writes part of an op and then refuses.** `APP_FILE_NOT_LINKED` in `writeOne` is
  thrown inside the write loop, after earlier changes of the same op are written
  (`src/services/apps/appHost.ts:511-518`, `:542-547`), though the comment says refusals come before
  anything links (`:235`). Tasks' `writeMove` reaches the same case with a non-null assertion, a 500
  (`src/services/tasks/board.service.ts:350`). Reachable when the second apply adds a file the first
  did not; how often is not known.
- **A draft is two Redis writes** (`src/services/draft.service.ts:218`, `:230`): content and
  metadata can disagree after a failure between them.
- **Context Manager's scope check does not ask whether a create's path is free**
  (`appHost.ts:475-488`). The core decides from the paths it was given; the unique index catches a
  good's path but not a tree file's, which a seed would then shadow. A race with a sync is the case.
  (inferred)

## Recommendation

### Three shapes

1. **A full port, linking inside `put`.** Context Manager implements `StoragePort` with a plan step,
   compare-and-set on a content digest, a lock and linking; the runner gains `reusable` and `know`'s
   request. _Costs:_ the 300 to 600 lines above, in the host people use; refusals where the later
   write wins today; a conflict where today the op is silently applied again; every card read on
   every tasks op. _Buys:_ one set of steps; checks Context Manager lacks (a path named twice, stale
   writes, refused writes write nothing); the suite tests its storage. _To try first:_ the suite
   over the port in Context Manager's integration tests; the cost of a tasks op at a real board's
   size; the woken good with a draft.
2. **The runner with a step for linking.** As above, but the runner offers a hook between its check
   and its write, and may load again and apply again once. _Costs:_ the runner grows (about 25 to 40
   lines, inferred) for one host; the port still needs compare-and-set to keep the suite's contract,
   so most of shape 1's port is still written. _Buys:_ Context Manager's behaviour after a link
   stays as it is. _To try first:_ the same, and whether the harness and the local host can carry
   the hook untested.
3. **No adoption; one scope check, called from both.** The runner's `outOfScope` and `namedTwice`
   are exported from `common-format/host`; Context Manager's `checkChanges` calls them, adds its
   move check, and its tests run a shared table of cases. _Costs:_ some 30 to 60 lines (inferred);
   the steps around the check (bounds, create, overlap) can still drift. _Buys:_ the duplicate the
   seed names is gone, with no change to how Context Manager stores anything. _To try first:_
   nothing beyond the change itself.

### The agent's lean

Shape 3 now, and shape 1 kept as the end state, tried only after the two measurements under "What
reading could not settle". The differences found are mostly in what the two hosts mean (latest wins
against compare-and-set, loads by op against loads by scope, a best-effort write, a move with the
op's column), not in plumbing; adopting the runner decides them by the way in. This is the agent's
lean, not a ruling.

### For Jamie

1. **Should Context Manager refuse a stale write?** ADR-0030 left compare-and-set for later. Shapes
   1 and 2 bring it in.
2. **After a first link, apply the op again silently, or answer a conflict and let the person
   retry?**
3. **May a tasks op read every card in scope,** or must the runner learn to load less, which changes
   it for every host?
4. **Does `move-file`'s order-file prune stay best-effort,** against an all-or-nothing `put`?
5. **One overlap rule at the root,** Context Manager's (the whole repository) or the local host's
   (the seeded scope), or one per host?
6. **One text limit:** the port's 2 MiB or Context Manager's 10 MiB?
7. **Do Context Manager's apps ever delete a file?** If not, the suite needs a way to skip its
   delete cases.
8. **Is "Context Manager on the runner" still the end state,** or is the runner the reference that
   Context Manager is checked against?

## References

- The seed:
  [context-manager-on-the-runner](../../../unassigned/seeds/context-manager-on-the-runner.md).
- [host-runner](../../../stage5/phase2/specs/host-runner.md), with its "As built" section.
- Surfaces: `packages/common/src/host/` (`index.ts`, `runner.ts`, `memory-port.ts`),
  `packages/common/src/testing/host.ts`, `packages/hosts/local/src/server/port.ts`,
  `packages/hosts/local/src/server/apps/`.
- Context Manager: `src/services/apps/`, `src/services/draft.service.ts`,
  `src/services/git/repoImport.service.ts`, `src/services/tasks/board.service.ts`,
  `src/services/inventory/inventory.service.ts`; ADR-0023, ADR-0030 and ADR-0040 under `docs/adr/`.
