# Stage 4 Follow-ups

Write-ahead log of knowingly deferred work — short bullets appended at the moment of deferral, by
humans and agents alike. No triage, estimates, or owners at capture time. Reviewed at the next
stage's setup. See [devlogs](../README.md#follow-up-wal).

Opened 2026-11-12 at stage 3's close. The [stage 3 WAL](../stage3/followups.md) was drained before
it opened: every entry was closed.

Reviewed 2026-11-14 at stage 5's setup, with the
[read of stage 5's specs](../../tasks/stage5/phase1/reviews/specs-against-stage-4.md): each entry
says where it went. Nothing was dropped.

- 2026-11-14 (stage 4 phase 2, format-descriptors): `tooling/template/format` has no `./format`
  entry, so a format made with `npm run new-format` has no descriptor. It needs `src/format.ts`,
  the export and its stub, splitting with `./dist/chunks/*` in `sideEffects`, the two tests and
  the fixtures switched to `format:`.
  - Moved 2026-11-14 to the seed [one scaffold for formats and
    apps](../../tasks/stage6/phase1/seeds/one-scaffold-for-formats-and-apps.md).
- 2026-11-14 (format-descriptors): the splitting setup (`splitting: true` and `chunkNames`) is
  repeated in five `tsup.config.ts` files. `tooling/tsup.ts` could carry it.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (format-descriptors): `<image-preview>` reports a failed load twice when `alt` and
  `src` change together: a stale `load` from the previous image renders over the new source. The
  local host does not hit it, because it makes a new element for each file.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (format-descriptors): the root `README.md`'s harness paragraph and format-convention
  table predate the `./format` entry.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (format-descriptors): in the harness, a deep link to a fixture whose content is `''`
  falls back to the first fixture (a truthiness test in `main.ts`), and `vite.config.ts`'s
  default-format pattern does not match `@stillpointlab/local-host`.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (explorer-tree): the harness's event log (`WATCHED_EVENTS`) does not list the
  tree's events, so the tree's fixture keeps a log of its own.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (host-page): the code editor's highlighting is dark on dark under a dark colour
  scheme (the code format's theme). Context Manager has no dark scheme, so it shows first here.
  - Moved 2026-11-14 to the seed [a dark scheme
    pass](../../tasks/unassigned/seeds/dark-scheme-pass.md).
- 2026-11-14 (host-page): relative links and images in a markdown file resolve against `/` and
  are not found. Context Manager rewrites them; the local host could, to `#/file/` and
  `urlFor`. Remote images are blocked by the page's content security policy.
  - Moved 2026-11-14 to the seed [relative links in a markdown
    file](../../tasks/unassigned/seeds/markdown-relative-links.md).
- 2026-11-14 (host-page): xmdl's validator (zod 4) probes `Function('')`, which the page's
  policy blocks. It falls back, and two policy reports show in the console.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (host-page): after the event stream reconnects, the page lists again but does not
  check the open file, so a change made during the outage shows only at the next event or save.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md). The app pane resolves again
    on the `listed` a reconnection sends
    ([apps-in-the-local-host](../../tasks/stage5/phase3/specs/apps-in-the-local-host.md)); the
    open file is still not checked.
- 2026-11-14 (host-page): the sheet editor's save adds `format: csv` to a `.sheet` document and
  drops its final newline.
  - Moved 2026-11-14 to the seed [a save keeps the rest of the
    file](../../tasks/unassigned/seeds/a-save-keeps-the-file.md).
- 2026-11-14 (host-page): after a fragment navigation the tree's focus ring stays on the row
  that had focus, while the selection moves.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (file-operations): a path the server refuses for its text (a `.` segment, a
  backslash, git's folder) is answered `HOST_PATH_OUTSIDE_ROOT`, worded "is outside the served
  folder". It needs a code and words of its own.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (file-operations): the pane's change check reads an open image as text and is
  answered 400 (`HOST_NOT_TEXT`), which it takes for "still there". Harmless, and a console
  error on every change to an open image.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (file-operations): a nested repository's row has a chevron that opens to nothing,
  and a disabled menu entry's reason is only a `title`.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (file-operations): the page finds a row to focus by the tree's markup
  (`[role="treeitem"][data-path]` in its shadow root). The tree could offer `focusRow(path)`.
  - Moved 2026-11-14 to
    [apps-in-the-local-host](../../tasks/stage5/phase3/specs/apps-in-the-local-host.md), whose
    rows and menus need it.
- 2026-11-14 (file-operations): going back to an address from before a rename says there is no
  file at that path.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (file-operations): a dialog with no detail line shows an empty band between its
  title and its buttons (`<modal-dialog>`'s body padding).
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (git-in-the-host): the md editor's save reflows a file: three lines became one and
  the final newline went. The Changes view makes it plain, and it matters more now that the
  editor writes files on disk and git shows the change.
  - Closed 2026-11-14 (Jamie: fix it, high priority;
    [#111](https://github.com/stillpointlab/surfaces/pull/111)): a save rewrites the top-level
    blocks that changed and writes every other block back as it was set, final newline included.
    What is left is in the seed [a save keeps the rest of the
    file](../../tasks/unassigned/seeds/a-save-keeps-the-file.md).
- 2026-11-14 (git-in-the-host): `HEAD` text is read with no filter, so a repository that
  converts line endings on checkout, or uses a smudge filter, shows every line as changed.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (git-in-the-host): a folder whose only file moved out of the served folder loses
  its row, so that deletion shows in the commit dialog and nowhere in the tree.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (git-in-the-host): the commit dialog lists paths in git's order and the tree in
  natural order (`many-2` before `many-10`).
  - Moved 2026-11-14 to [checkin-review](../../tasks/stage5/phase4/specs/checkin-review.md): the
    review lists in the tree's order.
- 2026-11-14 (git-in-the-host): `HOST_GIT_FAILED` answers 500, as the mapping it joined does. A
  hook that refuses is not the server's fault; 422 would say so.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (git-in-the-host): one commit test checks that a `put` has not finished after
  300 ms, the only assertion in the package that depends on time.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (git-in-the-host): a watch on `logs/HEAD` would catch `reset --soft` and
  `update-ref`, which touch neither `HEAD` nor `index`. Undo, in stage 5, may want it.
  - Closed 2026-11-14 by the read of
    [undo-journal](../../tasks/stage5/phase5/specs/undo-journal.md): undo changes the index, which
    the watcher already reports.
- 2026-11-14 (git-in-the-host): a commit can switch branches (a new branch), and the undo
  journal's draft spec does not know about branches.
  - Closed 2026-11-14 by the read of
    [undo-journal](../../tasks/stage5/phase5/specs/undo-journal.md): the `base` check covers a
    switch, and a commit on a new branch changes no file.
- 2026-11-14 (git-in-the-host): the Commit button reads "Commit 0" when nothing has changed. It
  could be disabled, or hidden, until there is a change.
  - Moved 2026-11-14 to [checkin-review](../../tasks/stage5/phase4/specs/checkin-review.md): the
    button is disabled with nothing changed.
- 2026-11-14 (phase 3's close): `packages/formats/md/README.md` still calls the package
  `@stillpointlab/md-editor`, its name before the monorepo, in its title, install line and
  examples.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (context-manager-adopts-formats): a descriptor's `apply` always sets the content,
  so a host that renames an open file cannot ask it for the path's attributes alone (the code
  language). Context Manager keeps one language branch for that. A way to re-derive a path's
  attributes without content would remove it, and the local host's rename would use it too.
  - Carried 2026-11-14 to the [stage 5 log](../stage5/followups.md).
- 2026-11-14 (context-manager-adopts-formats): Context Manager's public and library preview
  pages and claim review do not mount through the descriptors yet. It is in Context Manager's
  own follow-up log; the stage 5 adoption spec is the place to decide whether it joins.
  - Moved 2026-11-14 to
    [context-manager-adopts-apps](../../tasks/stage5/phase6/specs/context-manager-adopts-apps.md),
    which leans to leaving it in Context Manager's log (decision 5 of the stage 5 review).
