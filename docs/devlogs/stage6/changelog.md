# Stage 6: Media Previews Changelog

- **Dates:** 2026-11-25 –
- **Stage Tag:** TBD _(filled with `stage6-complete` at stage close)_

> Agent-drafted from evidence (merged PRs, git history, task cards). Appended per phase at phase
> close. Regenerable at any time; see [devlogs](../README.md). Reflections do NOT belong here — they
> go in `reflections.md`.

> The stage's theme is the
> [media previews brief](../../tasks/stage6/phase1/briefs/media_previews.md): a PDF, an audio
> file and a video file each open as a preview in the local host and in Context Manager, a video
> can also play an HLS stream, and the scaffold makes a format a host can register. Phase 1 opens
> the stage and builds the token Jamie ruled into it; the groundwork is phase 2, the formats are
> phases 3 and 4, Context Manager adopts them in phase 5, and phase 6 is the close.

---

## Phase 1: The stage opened, the streaming spike, and a token for the run (`stage6-phase1-complete`)

Range: `stage5-complete..stage6-phase1-complete` (`5c4166a..abf99f2`), 2026-11-23 – 2026-11-25.
The phase's own part of that range is 17 commits, three merges, 56 files, +2,049/−125; under
`packages/`, 18 files, +788/−95, all in the local host. The tag's merge also carries the raw
route ([#182](https://github.com/stillpointlab/surfaces/pull/182)), which was stacked on the
token and reached main with it; its nine commits are phase 2's and are counted there.

### Shipped

- Stage 5's task check-in from Context Manager
  ([#176](https://github.com/stillpointlab/surfaces/pull/176), Jamie): the validation card.
- Stage 6 opened ([#177](https://github.com/stillpointlab/surfaces/pull/177)):
  - the [media previews brief](../../tasks/stage6/phase1/briefs/media_previews.md), with
    Jamie's nine answers to its first draft;
  - the spike [a video player that streams](../../tasks/stage6/phase1/spikes/a-video-player-that-streams.md),
    with his four rulings on it;
  - five seeds moved from the pool into the phase, and five new ones in the pool: a media
    manager, very basic media editors, players of our own, streams from beyond the folder, and
    MPEG-DASH streams;
  - stage 5's two open follow-ups closed by his ruling, and [stage 6's log](followups.md)
    opened;
  - the board's pointer moved to stage 6.
- The spec for a token for the run
  ([#178](https://github.com/stillpointlab/surfaces/pull/178);
  [spec](../../tasks/stage6/phase1/specs/a-token-for-the-run.md)), with Jamie's three rulings.
- The four specs of phase 2 ([#179](https://github.com/stillpointlab/surfaces/pull/179)): the
  scaffold, the raw route, browser tests, and a worker file in a format package.
- A token for the run ([#181](https://github.com/stillpointlab/surfaces/pull/181)):
  - the `surfaces` command makes a token for each run and prints the address with it;
  - `GET /?token=…` sets a cookie named for the port (`HttpOnly`, `SameSite=Strict`) and
    redirects to the address without the token; a program sends `Authorization: Bearer`;
  - every route is behind it, the page's own files included; a request without it meets the
    words that say what to do, or `HOST_TOKEN_REQUIRED` under `/api/`;
  - `createHost({ token: null })` answers without one, for tests and for a host inside another
    program;
  - a page left open across a restart says so once, and stops its stream;
  - the README says who the host answers, and the release walk gains four steps.

### Decisions

Jamie's, 2026-11-25:

- **The stage is media previews.** More of the git and GitHub work in surfaces is wanted in the
  long term and is paused. Stage 7 is looked at again at this stage's close: a media manager, or
  very basic media editors first.
- **On the brief** (its "Decided", 1 to 9): three packages; a basic video player of our own that
  can play a stream; pdf.js; image gains nothing; every common ending the browsers play; Context
  Manager may limit a file's size for now; the spike on writing bytes is in this stage's close;
  a phase carries on at most three follow-ups.
- **On the spike** (10 to 13): hls.js, loaded only when an `.m3u8` is opened, and MPEG-DASH
  waits; streams come from the folder for now; `media-src 'self' blob:` is allowed in both
  hosts; the browser's own controls for now.
- **On the token:** a cookie, not a header; that another port on the same machine is sent the
  cookie is accepted ("local host is trusted enough"); the page's own files are behind it too.
- **On phase 2's specs:** browser tests run in a pull request only for the packages it changes,
  with the whole set by hand and at a stage's close ("I don't want to get bogged down waiting for
  CI"); one contract for each role, and each format keeps its own element and exported type; a
  web worker is a format's third part, `<format>-worker`.

Jamie has not ruled on the calls in the token spec's
[As built](../../tasks/stage6/phase1/specs/a-token-for-the-run.md#as-built), which are the
agents': the exchange is in the request check, so development mode shares it; a token in a query
is the exchange and nothing else; the comparison is over digests. He merged the build on
2026-11-25.

### Testing & review

- The spike ran each library and each file ending in Playwright's Chromium 158 and Firefox 159,
  on a scratch server that sent the local host's page policy word for word. Safari was not run.
- The token's two ways (a cookie, a header) were tried on the same server in both browsers
  before the spec asked for a ruling: a media element, hls.js, the event stream and a second tab
  all carried the cookie.
- The token build: the full check of its tip in CI, 3,695 tests.
- By hand in Chromium on the built server: the address without the token, the printed address,
  an image, a markdown file saved, a tasks board, a commit, a create and its undo, a second tab,
  and a restart on the same port. `curl` with and without `Authorization: Bearer`. Development
  mode's refusals and its reload socket.
- The orchestrating agent's read of the build found one fault, fixed before the PR: an address
  that began with two slashes was redirected to another host.
- Not tried: Firefox against the host itself; Safari anywhere; the printed address followed
  from a link on another site.

### Deferred

- Three entries in the [follow-up log](followups.md#phase-1), all built at the close
  ([#185](https://github.com/stillpointlab/surfaces/pull/185)): a stream the browser gave up on is opened again; Undo, Redo and Commit
  are disabled once the restart notice shows; `HOST_FORBIDDEN` is 403 by its code. None is
  carried.
- What that build left unchecked is one entry under phase 2: what the explorer, an app, a save
  and an open commit review do after a restart.

### At the phase's close

- The tag is on the merge that brought the token to main (`abf99f2`).
- Phase 2's first two builds were made beside the token's, on Jamie's word to begin phase 2's
  work as stacked pull requests, and were merged before this close: the raw route with the
  token, and the scaffold ([#183](https://github.com/stillpointlab/surfaces/pull/183)) after it.
- Four seeds stay in the phase's folder as cards to do: each closes with the phase that builds
  it.

---

## Phase 2: The groundwork: the scaffold, the raw route, browser tests and a worker file (`stage6-phase2-complete`)

Range: `stage6-phase1-complete..stage6-phase2-complete` (`abf99f2` to the merge of
[#192](https://github.com/stillpointlab/surfaces/pull/192)), 2026-11-25 – 2026-11-26. As the range stood at [#192](https://github.com/stillpointlab/surfaces/pull/192)'s tip: 44 commits and
six merges, 80 files, +3,587/−313. It also holds what merged after phase 1's tag and is that
phase's or the next's: the token's follow-ups ([#185](https://github.com/stillpointlab/surfaces/pull/185)), phase 1's close ([#186](https://github.com/stillpointlab/surfaces/pull/186)) and
phase 3's specs ([#187](https://github.com/stillpointlab/surfaces/pull/187)). It does not hold the raw route's nine commits, which reached main
in the merge phase 1's tag is on (16 files under `packages/`, +574/−81).

### Shipped

- The raw route serves media ([#182](https://github.com/stillpointlab/surfaces/pull/182);
  [spec](../../tasks/stage6/phase2/specs/raw-route-serves-media.md)): a file's address carries
  its path (`/api/raw/<path>`), so an address relative to the file reaches its neighbours; range
  requests, with `416` for one that asks for no byte; the types of streams and more media;
  `media-src 'self' blob:` in the page's policy.
- The scaffold makes a format a host can register ([#183](https://github.com/stillpointlab/surfaces/pull/183);
  [spec](../../tasks/stage6/phase2/specs/scaffold-registrable-formats.md)): the text template
  ships its `./format` descriptor; a second template, for a preview given a URL
  (`npm run new-format -- <name> --url`); both templates are workspaces, tested and shown in the
  harness where they lie; `UrlPreviewElement` and its suite in `common`, with image's names
  kept; the scaffold formats what it writes.
- Browser tests, kept small ([#188](https://github.com/stillpointlab/surfaces/pull/188);
  [spec](../../tasks/stage6/phase2/specs/browser-tests-in-ci.md)): a package's
  `*.browser.test.ts` run in headless Chromium through `npm run test:browser` and never through
  `npm test`; a pull request's CI runs those of the packages it changes, a push to `main` none,
  a run by hand all; the URL template's own browser test; the scaffold copies a file that is
  not text byte for byte.
- A format package can ship a worker file ([#190](https://github.com/stillpointlab/surfaces/pull/190);
  [spec](../../tasks/stage6/phase2/specs/a-worker-file-in-a-format-package.md)): the way, proved
  through four builds and written in the root README; the build fails when a shared chunk holds
  the worker's address.
- The phase's follow-ups, as ruled ([#192](https://github.com/stillpointlab/surfaces/pull/192)): a body that ends short of its length closes
  the connection, and a raw file is read no further than its headers said; after a restart an
  app's refused op shows under the notice, and Undo and Redo say why they are off; the type
  check reads `tooling/` and the root's vitest configs; one list of where browser tests live; a
  missing Chromium is told once; four READMEs name their packages as they are.

### Decisions

Jamie's:

- **A format's worker is two files,** `src/worker/worker.ts` and a starter beside it, where the
  spec had one folder: "fine as long as we stay consistent across formats" (2026-11-25).
- **The follow-up log, entry by entry** (2026-11-26, in three batches): the raw route's
  `no-store` is carried, "with the intent to address during audio spec impl"; six are fixed;
  that `test:browser` builds everything first is closed; image's root entry stays for now, with
  [a seed](../../tasks/stage6/phase6/seeds/root-entries-register-nothing.md) for all five older
  formats.
- **After a restart:** "showing the error+disable and not going overboard trying to fix".

Jamie has not ruled on these, which are the agents' calls in each spec's "As built", merged by
him:

- The raw address is decoded once, whole; an address that climbs out of `/api/raw/` is no
  route (404, where the old address answered 400); `416` has a code of its own.
- The URL template's dashed names are `sample-url`, and `setSource`'s second argument is `name`.
- Which packages a pull request's browser job runs is decided by a script the workflow calls,
  from the diff since the pull request's base.
- An error after a restart shows as a line under the notice, which #185 had said nothing
  replaces.
- Phase 3's three specs were merged ([#187](https://github.com/stillpointlab/surfaces/pull/187)) with the audio spec's three questions
  unanswered; the agent's leans in them stand until he says otherwise.

### Testing & review

- `npm run check` from a clean tree at each build's tip: 3,784 (the raw route), 3,754 and, with
  two trial formats, 3,830 (the scaffold), 3,885 (browser tests), 3,884 (the worker file), 3,908
  (the follow-ups, before the orchestrating agent's three commits, which CI checked).
- The raw route by hand in Chromium on the built server, with the spike's media: a seek to the
  last ten seconds of a 60 s WebM in about 70 ms, and in 2.1 s held to 300 kB/s; a playlist's
  segment served by its relative address; a `blob:` media source; no policy report.
- The scaffold: two trials made, installed and checked with no edit, shown in the harness, and
  the text one opened in the local host with one import and one entry.
- Browser tests in CI: the browser job ran beside `check` in 1 min 7 s with Chromium installed
  from nothing; a throwaway pull request (#189, closed) played a 1 s WebM with its sound on; the
  run by hand from `main` ran every package's; a docs-only pull request ([#191](https://github.com/stillpointlab/surfaces/pull/191)) skipped
  the job. `npm test` timed the same before and after, and started no browser.
- The worker's proof: six forms of the address through the package's build, the local host
  built and in development mode, and Context Manager's client build, each in Chromium with
  policy reports heard; then the harness. Context Manager's part was a client build on a
  throwaway local branch of the adoption's clone.
- The follow-ups: a 300 MB file cut to 10 MB while `curl` and Chromium read it, before and
  after; the page walked after a restart in the built host.
- Not tried: Firefox against the host, and Safari anywhere; pdf.js itself in a worker; a
  `<video>` on a file that shrinks.

### Deferred

- **Carried, one entry:** the raw route's `no-store`, into the
  [audio spec](../../tasks/stage6/phase3/specs/audio-preview.md)'s section 4.
- **Noticed in the drain and not ruled, two:** the raw route refuses a `HEAD` without an
  `Origin`; two tooling scripts carry no types. The agent's lean on both is to close.
- Everything else in the [log](followups.md#phase-2) is built or closed.

### At the phase's close

- The tag is on the merge of [#192](https://github.com/stillpointlab/surfaces/pull/192), the phase's last.
- A seed for [the older formats' root entries](../../tasks/stage6/phase6/seeds/root-entries-register-nothing.md),
  from Jamie's question on image's.
- Phase 1's transcript was backed up at its close; phase 2's follows this one.

## Phase 3: The audio preview, the video preview, and HLS in it (`stage6-phase3-complete`)

Range: `stage6-phase2-complete..stage6-phase3-complete`, 2026-11-26. As the range stood at the
merge of [#196](https://github.com/stillpointlab/surfaces/pull/196): 38 commits and four merges,
126 files, +4,403/−245. [#195](https://github.com/stillpointlab/surfaces/pull/195) reached main
inside [#197](https://github.com/stillpointlab/surfaces/pull/197)'s merge, which was stacked on
it.

### Shipped

- The tooling's scripts and the lint config are TypeScript
  ([#193](https://github.com/stillpointlab/surfaces/pull/193)), the last of phase 2's
  follow-ups: Node runs the four scripts under `tooling/` as they are, the type check reads
  them, and `tooling/tsconfig.json` holds them to syntax Node can run.
- The audio preview ([#194](https://github.com/stillpointlab/surfaces/pull/194);
  [spec](../../tasks/stage6/phase3/specs/audio-preview.md)): `<audio-preview>` in
  `packages/formats/audio`, the first format made with the URL template, opening nine endings
  with the browser's own controls; two functions in `common` that audio and video share.
- A playing file is left alone by the local host (the same PR): the raw route sends a validator
  (`ETag`) and lets the browser keep a file and ask whether it changed; the pane replaces an
  open URL file's element only when its validator changes; `probe` asks for one byte.
- The video preview ([#195](https://github.com/stillpointlab/surfaces/pull/195);
  [spec](../../tasks/stage6/phase3/specs/video-preview.md)): `<video-preview>` in
  `packages/formats/video`, opening five endings, filling the pane on a dark ground, with a note
  for a picture the browser cannot show; a token for that ground in `common`; the pane hands a
  player it puts aside an empty source, so its file stops arriving.
- HLS in the video preview ([#197](https://github.com/stillpointlab/surfaces/pull/197);
  [spec](../../tasks/stage6/phase3/specs/video-plays-hls.md)): the format opens `.m3u8`; hls.js
  behind an engine interface inside the package, loaded for a playlist and at no other time.
- A spike on Context Manager adopting the runner
  ([#196](https://github.com/stillpointlab/surfaces/pull/196);
  [spike](../../tasks/stage6/phase3/spikes/context-manager-on-the-runner.md)), the paper item
  from the stage's brief.

### Decisions

Jamie's, all on 2026-11-26:

- **Everything is TypeScript:** "let's consolidate on .ts for all files, even tooling".
- **The request check keeps asking a `HEAD` for an `Origin`:** "we'll leave Origin on HEAD for
  now and wait until it is something a feature requires".
- **Audio's two failures stay two sentences,** at the cost of one request of one byte: "we can
  keep the extra request to keep the errors distinct".
- **The faults the runner spike noticed in Context Manager are filed there:** "let's add them
  there" ([context-manager#1315](https://github.com/stillpointlab/context-manager/pull/1315)).
- **Byte detection where two formats share an ending is seeded,** from his question on a `.ts`
  segment: [a format told by a file's bytes](../../tasks/unassigned/seeds/a-format-told-by-a-files-bytes.md).
- **Playlists from other servers "one day",** perhaps with Context Manager in the desktop app:
  his note is in the seed that was there.

Jamie has not ruled on these, which are the agents' calls in each spec's "As built", merged by
him:

- ESLint loads its TypeScript config through `jiti`, a new dev dependency; the one JavaScript
  file left is the local host's `bin/surfaces.js`.
- The raw route's validator is the file's size and time, sent with `Cache-Control: no-cache`;
  the validator is the `?rev=` of a file's address.
- `MediaError.code` does not tell a file that did not arrive from one that cannot be decoded,
  so `mediaFailureOf` asks the address.
- `--spl-media-backdrop` is a new token in `common`.
- The package's MPEG-TS test stream names its segments `.m2t`; hls.js is left as an import in
  the package's build; a file the server refuses fails a stream at once.
- The audio spec's three leans (the two functions in `common`; a track stops when another file
  opens; section 4 in that spec) stand, never ruled.

### Testing & review

- `npm run check` at each build's tip: in CI for the tooling and audio (another repository's CI
  held the build's machine), 3,999 for video and 4,025 for HLS on the build's machine. The HLS
  build ran its check while that other CI was running, against its instructions.
- Each build was read by the orchestrating agent, which changed: for audio, the failure's
  question to one byte; for video, the ground's colour to a token and the pane's letting go of
  a player.
- By script, in the built local host, Chromium 158, with a proxy before the host: every ending
  of each format plays from the tree; seeks (a 60 s video to its last ten seconds in under
  0.3 s; 0.64 s at 300 kB/s); a seek back in a 115 MB audio file asks for nothing again, where
  the old headers sent 6 to 8 MB in three runs of four; a track and a stream play on through
  the event stream cut and come back; another file opened stops what played; four streams
  (fMP4, MPEG-TS as `.m2t` and as `.ts`, byte ranges) with no policy report.
- In the harness, Chromium 158 and Firefox 159, by Playwright: every fixture of the three
  builds.
- Browser tests in CI: audio 5, video 8; the job took 37 to 70 s. A PR on another PR starts no
  CI, so two of the three stacked builds were run by hand on their branches.
- The runner spike was done by reading; its five leading findings and one fault were read
  again in the code by the orchestrating agent.
- Imitated: the hidden tab (headless Chromium hides none). Never run: Safari; a browser with
  no Media Source Extensions; a person's eyes and ears.

### Deferred

Fourteen entries in the [log](followups.md#phase-3), thirteen from the three builds and one
from a question of Jamie's, each ruled by him on 2026-11-26, three at a time:

- **Carried, one:** an audio or video preview is never ready in a browser that loads nothing of
  a file before a person presses play. It waits for his walk on a Mac and an iPhone.
- **Built, six** ([#201](https://github.com/stillpointlab/surfaces/pull/201)): the harness answers 404 for a missing file; `common`'s README registers
  audio and video; the scaffold's prose and its `canplay` comment; two READMEs; hls.js's retries
  capped.
- **Looked into, one:** the harness shows an element's `ready` twice because the element says it
  twice, by the ready gate's contract. Not changed; Jamie's to rule.
- **Closed, six:** a file renamed, or written again with the same bytes, restarts what plays; a
  disk with a coarse clock; a changed segment; a `.ts` segment in the tree; the browser tests'
  port.

### At the phase's close

- Phase 4 was opened beside it: the [pdf.js spike](../../tasks/stage6/phase4/spikes/pdfjs-in-a-format-package.md)
  and the [PDF preview's spec](../../tasks/stage6/phase4/specs/pdf-preview.md)
  ([#199](https://github.com/stillpointlab/surfaces/pull/199)), with Jamie's rulings on its five
  questions and two spikes he asked for (unlocking a PDF with a password; signing a PDF).
- The tag is on the merge of [#201](https://github.com/stillpointlab/surfaces/pull/201), the phase's last.
- Phase 2's transcript was backed up after its close; phase 3's follows this one.

---

## Phase 4: The PDF preview, its text, and a password field (`stage6-phase4-complete`)

Range: `stage6-phase3-complete..stage6-phase4-complete`, 2026-11-26 – 2026-11-27. As the range
stood when [#210](https://github.com/stillpointlab/surfaces/pull/210) was opened, without this
close's own commits: 35 commits and 5 merges, 73 files, +7,024/−72.
[#202](https://github.com/stillpointlab/surfaces/pull/202) reached main inside
[#204](https://github.com/stillpointlab/surfaces/pull/204)'s merge, which was stacked on it.

### Shipped

- The PDF preview ([#202](https://github.com/stillpointlab/surfaces/pull/202);
  [spec](../../tasks/stage6/phase4/specs/pdf-preview.md)): `<pdf-preview>` in
  `packages/formats/pdf`, on pdf.js 6.5.438, the first format with a worker of its own. A column
  of pages, each drawn while it is near view and given back when it is far; three sentences for
  three failures; no WebAssembly, and nothing added to either host's policy. pdf.js's character
  maps, fonts and fallback decoders are copied into the package by a generating step, and the
  root README gains the convention for files fetched by name.
- A PDF's text ([#204](https://github.com/stillpointlab/surfaces/pull/204);
  [spec](../../tasks/stage6/phase4/specs/pdf-text-layer.md),
  [#203](https://github.com/stillpointlab/surfaces/pull/203)): pdf.js's text layer over each drawn
  page, so a person can select and copy, the browser can find, and a screen reader is given a
  page's label and its lines.
- A password field ([#209](https://github.com/stillpointlab/surfaces/pull/209)), from the
  [spike](../../tasks/stage6/phase4/spikes/unlocking-a-pdf-with-a-password.md)
  ([#205](https://github.com/stillpointlab/surfaces/pull/205)): a PDF that needs a password asks
  for it in place of the pages, as often as pdf.js asks, and keeps it nowhere.
- Three fixes from the phase's log ([#210](https://github.com/stillpointlab/surfaces/pull/210)):
  the first page is drawn after reading its size alone, with the others' sizes read after and
  the page in view kept in place; a change of the screen's pixel ratio draws the pages again; a
  page's picture no longer waits for the text of the page before it.
- A spike on signing a PDF with a drawn signature, run
  ([#207](https://github.com/stillpointlab/surfaces/pull/207),
  [#208](https://github.com/stillpointlab/surfaces/pull/208);
  [spike](../../tasks/stage6/phase4/spikes/signing-a-pdf.md)): pdf.js's own save writes a drawn
  signature or a picture with none of its viewer, adds to the file's end, and leaves an earlier
  digital signature valid. A card for
  [a signature a reader can verify](../../tasks/stage6/phase4/spikes/a-pdf-signature-that-can-be-verified.md)
  stands beside it, not run.

### Decisions

Jamie's, on the PDF preview's spec, 2026-11-26:

- **pdf.js's worker is shipped with one line changed,** so its fallback decoders load by the
  package's own names: "one-line change is fine with build fail".
- **`'wasm-unsafe-eval'` stays out of both policies:** "sounds fine".
- **`@napi-rs/canvas` is accepted** as a dependency pdf.js brings: "should be fine".
- **The text layer is its own spec, next:** "text layer next is fine".
- **A password and signing each get a spike:** "let's add a spike", "Also add a spike for
  supporting signing pdfs".

Jamie's, 2026-11-27:

- **The password field is a follow-up, inside the element:** "followup is fine if it fits as a
  drain sized item"; "inside makes sense, less dependency". Chromium's offer to save the password
  is stopped and Firefox's is left: "ok".
- **A PDF that forbids copying is not enforced:** "leave no-copy for now - we aren't aiming to be
  a secure pdf platform, just a convenience. We can review later if it is needed".
- **Text is held for the pages near view alone,** with a seed for finding a word anywhere:
  "seed for better Ctrl-F in pdfs is fine"
  ([seed](../../tasks/unassigned/seeds/finding-a-word-anywhere-in-a-pdf.md)).
- **The issue written for pdf.js is not sent:** "we'll leave it for now".
- **An element's `ready` twice is closed,** once its cause was told: "we can close for now".
- **Signing is "a signature drawn on the page",** and "we can add verifiable as a spike". Its
  eight questions, all ruled: a later phase, captured
  ([seed](../../tasks/unassigned/seeds/a-drawn-signature-on-a-pdf.md)); a mode of the preview,
  "then migrated to editor"; drawn and picture first; a pad of our own; an annotation; warn and
  go on for a PDF already signed; nothing remembered, "(let's capture for pdf editor though)";
  the signed copy saved beside the original.
- **The first page is not to wait on every page's size:** "let's fix it, even if we measure I
  want to think about low power like mobile".

Jamie has not ruled on these, which are the agents' calls in each spec's "As built" or PR, merged
by him:

- The worker is handed to pdf.js for each document (`PDFWorker.create({ port })`), not set once
  for the page; pdf.js's files are fetched by the package's own factory, and an address that is
  `data:` is decoded without a fetch, since Context Manager inlines small files.
- A canvas is bound at 2^24 pixels and 16,384 a side.
- The text layer's selection ends at an element of its own, as in pdf.js's viewer; a page's box
  clips; a page with text is a group labelled "Page N of M".
- For the password field: a person is asked again when a file is reopened or changes; asking
  counts as ready, with a sentence in `common`'s contract; there is no Cancel button; the four
  sentences as the spike worded them.

### Testing & review

- `npm run check` at each build's tip: 4,120 for the PDF preview, 4,132 for its text, 4,140 for
  the password field, 4,151 for the fixes, each on the build's machine with the other
  repositories' CI seen idle first.
- Each build was read by the orchestrating agent. The PDF preview's and the text layer's "As
  built" are its own writing; the password field's source and README were read whole.
- By script, in the built local host, Chromium 158 and Firefox 159: a 200-page PDF to its last
  page with only the pages near view holding a canvas; no policy report in the page or the
  worker for seven PDFs, each listener shown to hear; a line selected by a drag, copied and
  pasted; a selection across two pages; a password asked, refused and taken, found in no
  address, console line or DOM.
- A stand-in for Context Manager's client, its build options and its policy: the same PDFs,
  clean. Context Manager itself was not run.
- Browser tests in CI: 14 for the PDF package, about 3 s; the job took 43 to 59 s. A PR on
  another PR starts no CI, so the text layer's was run by hand on its branch.
- The spikes: the password trial and the signing trial were run in the built host in both
  browsers by sub-agents and are not committed. Of the signing spike's claims the orchestrating
  agent checked that a saved file starts with the original's bytes and that poppler still calls
  an earlier digital signature valid.
- Never run: Safari; a real screen reader; the browser's own find bar; a touch screen; a screen
  with a pixel ratio above 1; Adobe's reader or Preview on a saved signature.

### Deferred

Eighteen entries in the [log](followups.md#phase-4): eleven from the two builds and four from
the spikes and Jamie's rulings, and three the fixes found, each ruled by him on 2026-11-27,
three at a time:

- **Carried, three,** all to Jamie's validation at the stage's end: the browser's own find bar
  on a PDF's text; a fast drag that may leave a line's last letter out ("make sure a suitable
  pdf is available and I will test in validation"); and the cost of 3,000 page boxes made at
  once ("let's leave this open until validation completes"). With phase 3's (an audio or video
  preview's `ready` on an iPhone) four are carried, one over the three the brief allows, by his
  word.
- **Built, four:** the password field ([#209](https://github.com/stillpointlab/surfaces/pull/209));
  and in [#210](https://github.com/stillpointlab/surfaces/pull/210) the first page not
  waiting on every page's size (a 3,000-page PDF's first page in 126 ms where it took 474), a
  redraw on a change of pixel ratio, and a page's picture not held up by the text before it.
- **Looked into, one:** pdf.js's measuring canvas. The entry was wrong: pdf.js takes it away
  itself when a document is destroyed. A test holds it; Jamie ruled "fix, let's clean up" on
  the entry as written, was told, and merged it as it was.
- **Closed, ten:** a page waiting for the one text being laid; Firefox's line about microtasks; the generating script's name; prettier run
  from inside a package; the CommonJS worker no host loads; copying from a PDF that forbids it;
  find near view, with its seed; the issue for pdf.js; pdf.js's reading of a symbol font and a
  vertical comma, "as known issue", now in the package's README; Chromium's selection empty for
  a moment between two pages.

### At the phase's close

- The build of a drawn signature waits for the spike on writing bytes, which is in the stage's
  close.
- Phase 5's spec was drafted and Jamie ruled its first questions the same day: Context Manager's
  goods hold no bytes yet, so the adoption is for repository files, and goods that hold bytes
  are a spike in Context Manager
  ([context-manager#1322](https://github.com/stillpointlab/context-manager/pull/1322)); a
  `WORKER_BASE_URL` for the PDF preview's worker.
- The tag is on the merge of [#210](https://github.com/stillpointlab/surfaces/pull/210),
  the phase's last code.
- Phase 3's transcript was backed up after its close; phase 4's follows this one.
