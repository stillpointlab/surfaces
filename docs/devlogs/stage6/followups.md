# Stage 6 Follow-ups

Write-ahead log of knowingly deferred work — short bullets appended at the moment of deferral, by
humans and agents alike. No triage, estimates, or owners at capture time. Reviewed at the next
stage's setup. See [devlogs](../README.md#follow-up-wal).

Opened 2026-11-25 at stage 6's setup. The [stage 5 WAL](../stage5/followups.md) was drained at that
stage's close, and Jamie ruled on the two entries it had left: nothing is carried here.

From this stage the log is drained at each phase's close, and a phase carries on at most three
entries (the [media previews brief](../../tasks/stage6/phase1/briefs/media_previews.md)).

## Phase 1

- 2026-11-25 (a token for the run): a page whose stream reconnects while the server answers
  "Starting." (503) is dropped by the browser for good, and the check of `/api/root` meets the
  same 503. The page then learns of a restart only at its next call. Older than the token; the
  restart notice now leans on it.
  - Built 2026-11-25 ([#185](https://github.com/stillpointlab/surfaces/pull/185)): a stream the browser gave up on is opened again each
    second, until the server answers it or the run is found over. The built command never answers
    that 503; development mode does, while Vite starts.
- 2026-11-25 (a token for the run): once the restart notice shows, Undo, Redo and Commit can
  still be clicked, and their failures are not shown, since the notice keeps its place.
  - Built 2026-11-25 ([#185](https://github.com/stillpointlab/surfaces/pull/185)): the three are disabled with the notice, and the keys
    ask nothing.
- 2026-11-25 (a token for the run): `statusFor` in `respond.ts` has no case for
  `HOST_FORBIDDEN`, which falls to 400. Every caller passes 403 itself, so nothing is wrong
  today.
  - Built 2026-11-25 ([#185](https://github.com/stillpointlab/surfaces/pull/185)): 403 by its code.

## Phase 2

- 2026-11-25 (the raw route serves media): the raw route answers `cache-control: no-store`, so a
  browser keeps no media on disk and a seek back in a long file is downloaded again.
  - Carried 2026-11-26 (Jamie: "carry with the intent to address during audio spec impl"), into
    the [audio spec](../../tasks/stage6/phase3/specs/audio-preview.md)'s section 4.
- 2026-11-25 (the raw route serves media): a file is sent after its size is read, so one that
  shrinks while it is sent ends short of its `Content-Length`. Older than the ranges, which it
  now holds for too.
  - Built 2026-11-26 (Jamie: fix; [#192](https://github.com/stillpointlab/surfaces/pull/192)): a body that ends short of its length closes the
    connection, so the client fails at once where it waited five seconds. The drain also found
    the other side, a file that grows, and reads no further than the size the headers gave.
- 2026-11-25 (the scaffold makes a registrable format): `tooling/new-format.test.ts` is linted
  and run, and no type check reads it.
  - Built 2026-11-26 (Jamie: fix; [#192](https://github.com/stillpointlab/surfaces/pull/192)): `npm run typecheck` reads `tooling/*.ts`, its
    tests and the root's two vitest configs.
- 2026-11-25 (the scaffold makes a registrable format): image's root entry registers its
  element, where the templates' register nothing, and its README's heading still names
  `@stillpointlab/image-editor`.
  - 2026-11-26 (Jamie: the heading for now; "presumably we want to convert to the convention
    eventually?"): the README is fixed, with code's, sheet's and xmdl's, which said the same
    ([#192](https://github.com/stillpointlab/surfaces/pull/192)). The root entry is
    [a seed](../../tasks/unassigned/seeds/root-entries-register-nothing.md) for all five older
    formats.
- 2026-11-25 (the token's follow-ups): after a restart, the explorer's create, rename and
  delete, an app's op, a save, and a commit review already open still call the server. Whether
  each failure shows was not checked. A disabled Undo keeps the title of its step.
  - Built 2026-11-26 (Jamie: "showing the error+disable and not going overboard trying to fix";
    [#192](https://github.com/stillpointlab/surfaces/pull/192)): walked in the built host. A save, the explorer's three and an open commit
    review each showed the refusal already. An app's op showed nothing, and now shows as a line
    under the notice. Undo and Redo say why they are off.
- 2026-11-25 (browser tests): the root's browser config names its folders as globs, and CI's
  filter reads the workspaces. The two can drift apart.
  - Built 2026-11-26 (Jamie: fix; [#192](https://github.com/stillpointlab/surfaces/pull/192)): the config takes its list from the filter's
    function.
- 2026-11-25 (browser tests): `npm run test:browser` builds everything `build:deps` does, for
  one package too.
  - Closed 2026-11-26 (Jamie: close). `npm test` does the same, and the job runs beside `check`.
- 2026-11-25 (browser tests): the words for a missing browser print once for each package,
  inside vitest's own error.
  - Built 2026-11-26 (Jamie: fix; [#192](https://github.com/stillpointlab/surfaces/pull/192)): three lines, once, before any package's config
    loads.
- 2026-11-26 (the phase's follow-ups): the raw route refuses a `HEAD` that carries no `Origin`.
  Nothing in the page sends one.
  - Closed 2026-11-26 (Jamie: "we'll leave Origin on HEAD for now and wait until it is something
    a feature requires"). The check asks every request that is not a `GET` for the page's
    `Origin`, to keep out a write from another site's page, and a `HEAD` falls under its wording.
- 2026-11-26 (the phase's follow-ups): `tooling/check-tokens.mjs` and `gen-styles.mjs` carry no
  types, so the type check that now reads `tooling/` does not read them.
  - Built 2026-11-26 (Jamie: "let's consolidate on .ts for all files, even tooling"): the four
    scripts under `tooling/` and the lint config are TypeScript, which Node runs as it is, and
    the type check reads them. The one JavaScript file left is the local host's
    `bin/surfaces.js`: Node takes no types out of a file under `node_modules`.

## Phase 3

- 2026-11-26 (audio): a file renamed while it plays starts again. The pane hands the element its
  new path, which is a new address (`packages/hosts/local/src/client/pane.ts`, `follow`).
  - Closed 2026-11-26 (Jamie: "we can close").
- 2026-11-26 (audio): the same bytes written again start a playing track again. The validator
  is the file's size and time, and a rewrite, an editor's save of nothing or `touch` changes the
  time (`packages/hosts/local/src/server/conditional.ts`).
  - Closed 2026-11-26 (Jamie: "close if fine, pretty edge case"). Telling the same bytes from
    new ones would mean reading the whole file at each check.
- 2026-11-26 (audio): the validator is as fine as the disk's clock. On a disk that keeps time to
  the second or two (FAT, exFAT), a file written twice inside one tick at the same size is not
  seen to change, by the pane or by the browser's copy. Before this build a `changed` event
  always loaded the file again.
  - Closed 2026-11-26 (Jamie: "close").
- 2026-11-26 (audio): the harness's server answers a missing file with its own page and a 200,
  so image's and the URL template's "Missing" fixtures show a file that will not decode, not one
  that is missing. Audio's uses a revoked object URL
  (`packages/formats/image/dev/fixtures.ts`, `tooling/template/url-format/dev/fixtures.ts`).
  - Jamie, 2026-11-26: fix. The harness's server answers 404 for a file that is not there.
- 2026-11-26 (audio): `common`'s README lists the order to register formats in as
  `md, xmdl, sheet, image, code`. It is Context Manager's order, and phase 5's to bring up to
  date (`packages/common/README.md`).
  - Jamie, 2026-11-26: fix, now and not in phase 5.
- 2026-11-26 (audio): the scaffold's renamed prose reads oddly for a real name ("the audio shows
  what it is given as an image", "a `<audio-preview>`"), in the package's README and comments.
  - Jamie, 2026-11-26: fix. The template is worded so that it reads true under a new name.
- 2026-11-26 (video): the root README's format convention still says "image, and video, audio
  or PDF to come", and the local host's README names "(an image, audio)" as what takes a URL.
  - Jamie, 2026-11-26: fix.
- 2026-11-26 (video): the harness's event log shows an element's `ready` twice for each fixture.
  Not looked into (`tooling/harness/main.ts`).
  - Jamie, 2026-11-26: fix. If the harness listens twice it is mended there; if an element
    says `ready` twice, that is told to Jamie before anything is changed.
- 2026-11-26 (video): the scaffold's contract test suggests `canplay` in a comment, and both
  media formats settle on `loadedmetadata` (`tooling/template/url-format`). With the entry
  above on the scaffold's prose.
  - Jamie, 2026-11-26: fix, with that entry.
- 2026-11-26 (HLS): a playlist that names another server says the first sentence only after
  31.6 s and 14 policy reports: hls.js asks again after an answer with no status. The build's
  rule for failing at once covers a 4xx alone (`packages/formats/video/src/preview/hls-engine.ts`).
- 2026-11-26 (HLS): the pane asks after a playlist alone, so a segment changed on disk does not
  load the stream again (`packages/hosts/local/src/client/pane.ts`).
- 2026-11-26 (HLS): a `.ts` segment in the tree opens as code and is refused as not text. A
  folder of segments shows as a list of such files.
- 2026-11-26 (HLS): the port of the browser tests' server cannot be set from the command line
  (`tooling/vitest.ts`).
- 2026-11-26 (the phase's follow-ups, from Jamie's question on `canplay` and `loadedmetadata`):
  an audio or video preview is ready, and takes its loading cover away, on `loadedmetadata`. A
  browser that loads nothing of a file before a person presses play never sends it. Tried with
  `preload="none"` standing in for such a browser, in Chromium 158 and Firefox 159: `loadstart`
  and `suspend` come and nothing more, so the element would stay at "Loading" and never be
  ready. Safari on an iPhone is said to behave so in some modes and was not run. `suspend` is no
  sign to go by: Chromium sends it before the metadata of a file it goes on to load.
