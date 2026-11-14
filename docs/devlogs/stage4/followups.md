# Stage 4 Follow-ups

Write-ahead log of knowingly deferred work — short bullets appended at the moment of deferral, by
humans and agents alike. No triage, estimates, or owners at capture time. Reviewed at the next
stage's setup. See [devlogs](../README.md#follow-up-wal).

Opened 2026-11-12 at stage 3's close. The [stage 3 WAL](../stage3/followups.md) was drained before
it opened: every entry was closed.

- 2026-11-14 (stage 4 phase 2, format-descriptors): `tooling/template/format` has no `./format`
  entry, so a format made with `npm run new-format` has no descriptor. It needs `src/format.ts`,
  the export and its stub, splitting with `./dist/chunks/*` in `sideEffects`, the two tests and
  the fixtures switched to `format:`.
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
- 2026-11-14 (host-page): the code editor's highlighting is dark on dark under a dark colour
  scheme (the code format's theme). Context Manager has no dark scheme, so it shows first here.
- 2026-11-14 (host-page): relative links and images in a markdown file resolve against `/` and
  are not found. Context Manager rewrites them; the local host could, to `#/file/` and
  `urlFor`. Remote images are blocked by the page's content security policy.
- 2026-11-14 (host-page): xmdl's validator (zod 4) probes `Function('')`, which the page's
  policy blocks. It falls back, and two policy reports show in the console.
- 2026-11-14 (host-page): after the event stream reconnects, the page lists again but does not
  check the open file, so a change made during the outage shows only at the next event or save.
- 2026-11-14 (host-page): the sheet editor's save adds `format: csv` to a `.sheet` document and
  drops its final newline.
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
- 2026-11-14 (file-operations): the page finds a row to focus by the tree's markup
  (`[role="treeitem"][data-path]` in its shadow root). The tree could offer `focusRow(path)`.
- 2026-11-14 (file-operations): going back to an address from before a rename says there is no
  file at that path.
- 2026-11-14 (file-operations): a dialog with no detail line shows an empty band between its
  title and its buttons (`<modal-dialog>`'s body padding).
