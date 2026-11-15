# Stage 5 Follow-ups

Write-ahead log of knowingly deferred work — short bullets appended at the moment of deferral, by
humans and agents alike. No triage, estimates, or owners at capture time. Reviewed at the next
stage's setup. See [devlogs](../README.md#follow-up-wal).

Opened 2026-11-14 at stage 5's setup. The [stage 4 WAL](../stage4/followups.md) was reviewed
first: what a stage 5 spec covers is in that spec, five entries went to four seeds, and the rest
are carried here as they were written.

## Carried from stage 4

- 2026-11-14 (format-descriptors): the splitting setup (`splitting: true` and `chunkNames`) is
  repeated in five `tsup.config.ts` files. `tooling/tsup.ts` could carry it.
- 2026-11-14 (format-descriptors): `<image-preview>` reports a failed load twice when `alt` and
  `src` change together: a stale `load` from the previous image renders over the new source. The
  local host does not hit it, because it makes a new element for each file.
- 2026-11-14 (format-descriptors): the root `README.md`'s harness paragraph and format-convention
  table predate the `./format` entry.
- 2026-11-14 (format-descriptors): in the harness, a deep link to a fixture whose content is `''`
  falls back to the first fixture (a truthiness test in `main.ts`), and `vite.config.ts`'s
  default-format pattern does not match `@stillpointlab/local-host`.
- 2026-11-14 (explorer-tree): the harness's event log (`WATCHED_EVENTS`) does not list the
  tree's events, so the tree's fixture keeps a log of its own.
- 2026-11-14 (host-page): xmdl's validator (zod 4) probes `Function('')`, which the page's
  policy blocks. It falls back, and two policy reports show in the console.
- 2026-11-14 (host-page): after the event stream reconnects, the page lists again but does not
  check the open file, so a change made during the outage shows only at the next event or save.
- 2026-11-14 (host-page): after a fragment navigation the tree's focus ring stays on the row
  that had focus, while the selection moves.
- 2026-11-14 (file-operations): a path the server refuses for its text (a `.` segment, a
  backslash, git's folder) is answered `HOST_PATH_OUTSIDE_ROOT`, worded "is outside the served
  folder". It needs a code and words of its own.
- 2026-11-14 (file-operations): the pane's change check reads an open image as text and is
  answered 400 (`HOST_NOT_TEXT`), which it takes for "still there". Harmless, and a console
  error on every change to an open image.
- 2026-11-14 (file-operations): a nested repository's row has a chevron that opens to nothing,
  and a disabled menu entry's reason is only a `title`.
- 2026-11-14 (file-operations): going back to an address from before a rename says there is no
  file at that path.
- 2026-11-14 (file-operations): a dialog with no detail line shows an empty band between its
  title and its buttons (`<modal-dialog>`'s body padding).
- 2026-11-14 (git-in-the-host): `HEAD` text is read with no filter, so a repository that
  converts line endings on checkout, or uses a smudge filter, shows every line as changed.
- 2026-11-14 (git-in-the-host): a folder whose only file moved out of the served folder loses
  its row, so that deletion shows in the commit dialog and nowhere in the tree.
- 2026-11-14 (git-in-the-host): `HOST_GIT_FAILED` answers 500, as the mapping it joined does. A
  hook that refuses is not the server's fault; 422 would say so.
- 2026-11-14 (git-in-the-host): one commit test checks that a `put` has not finished after
  300 ms, the only assertion in the package that depends on time.
- 2026-11-14 (phase 3's close): `packages/formats/md/README.md` still calls the package
  `@stillpointlab/md-editor`, its name before the monorepo, in its title, install line and
  examples.
- 2026-11-14 (context-manager-adopts-formats): a descriptor's `apply` always sets the content,
  so a host that renames an open file cannot ask it for the path's attributes alone (the code
  language). Context Manager keeps one language branch for that. A way to re-derive a path's
  attributes without content would remove it, and the local host's rename would use it too.

## Stage 5

- 2026-11-14 (phase 1's close): three relative links in older docs point at files that are gone:
  `related-tasks.md` (a seed) to `../tasks/public_page_viewer_bootstrap.md`, and stage 2's
  `cm-app-prep.md` and changelog to the seed `result-types-for-app-cores.md`. Nothing checks
  links in CI.
- 2026-11-14 (app-module-grows): inventory's bounds, pages and create copy are now in
  `packages/apps/inventory` (`bounds.ts`, `pages.ts`, `meta.ts`) and still in Context Manager
  (`services/inventory/opSchema.ts`, `services/inventory/pages.ts`, `client/apps/registry.ts`, the
  create noun in `services/apps/registry.ts`). Two copies until context-manager-adopts-apps.
- 2026-11-14 (app-module-grows, step 1): `AppMeta` has no noun for the "… created" notice a host
  shows after a create (Context Manager's client says "Inventory", "Task project"). The local
  host will want one.
- 2026-11-14 (app-module-grows, step 1): inventory's `fromChanges` counts changed and new files,
  as its spec says, so a zone or a manifest renamed by hand is not dirty and an app's check-in
  would not list it. The explorer's commit would.
- 2026-11-14 (app-module-grows, step 1): the suite's page cases cannot say "the page answers a
  view whose subject is missing, so the host gives not found" (`/room/garage` with no garage).
  `answers: 'not-found'` covers no match and a page that refuses.
- 2026-11-14 (app-module-grows, step 1): the module has no bound for its host ops
  (`link-editor`); each host bounds them itself.
- 2026-11-14 (app-module-grows, step 2): tasks' bounds, pages and create copy are now in
  `packages/apps/tasks` (`bounds.ts`, `pages.ts`, `meta.ts`) and still in Context Manager. Two
  copies until context-manager-adopts-apps, as for inventory.
- 2026-11-14 (app-module-grows, step 2): tasks' `fromChanges` cannot say whether a card's column
  moved (`dirty`, `versionColumn`): that needs the last check-in's content, not a status. The
  harness's workspace works it out from its base files today. host-runner has to choose: the
  module reads a base the host supplies, or the mark is given up outside Context Manager.
- 2026-11-14 (app-module-grows, step 2): tasks' pages read a stage or phase with `parseInt`, as
  Context Manager's did, so `/stage/3x` opens stage 3. Tighten it once Context Manager has
  adopted the pages.
- 2026-11-14 (app-module-grows, step 2): the `add-kind` bound carries a reserved-folder check
  from Context Manager that can never be true.
- 2026-11-14 (app-module-grows, step 2): tasks' `fromChanges` takes every new `.gitkeep` among
  the changes as housekeeping, wherever it is. A host hands it the instance's changes only.
