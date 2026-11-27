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
  - Built 2026-11-26 (Jamie: fix; [#201](https://github.com/stillpointlab/surfaces/pull/201)): the harness's server answers 404 for a file that is
    not there.
- 2026-11-26 (audio): `common`'s README lists the order to register formats in as
  `md, xmdl, sheet, image, code`. It is Context Manager's order, and phase 5's to bring up to
  date (`packages/common/README.md`).
  - Built 2026-11-26 (Jamie: fix; [#201](https://github.com/stillpointlab/surfaces/pull/201)).
- 2026-11-26 (audio): the scaffold's renamed prose reads oddly for a real name ("the audio shows
  what it is given as an image", "a `<audio-preview>`"), in the package's README and comments.
  - Built 2026-11-26 (Jamie: fix; [#201](https://github.com/stillpointlab/surfaces/pull/201)): the templates are worded so that they read true
    under a new name.
- 2026-11-26 (video): the root README's format convention still says "image, and video, audio
  or PDF to come", and the local host's README names "(an image, audio)" as what takes a URL.
  - Built 2026-11-26 (Jamie: fix; [#201](https://github.com/stillpointlab/surfaces/pull/201)).
- 2026-11-26 (video): the harness's event log shows an element's `ready` twice for each fixture.
  Not looked into (`tooling/harness/main.ts`).
  - Jamie, 2026-11-26: fix. If the harness listens twice it is mended there; if an element
    says `ready` twice, that is told to Jamie before anything is changed.
  - Looked into ([#201](https://github.com/stillpointlab/surfaces/pull/201)) and not changed: the element says it twice, as the ready gate's contract
    has it. A preview given a URL is put in the page with no source and settles as empty, then
    is given its source and settles again when that has loaded. md and code show one. Told to
    Jamie; his to rule.
  - Closed 2026-11-27 (Jamie, asked for the cause first: "we can close for now"). The cause is
    the order of mounting, in the harness and, as read, in the local host's pane: an element is
    put in the page and then given its file. A preview given a URL has nothing to wait for
    until then, so it settles at once as empty. md and code begin work that waits when they
    connect, and their file comes before it lands, so that first cycle never settles.
- 2026-11-26 (video): the scaffold's contract test suggests `canplay` in a comment, and both
  media formats settle on `loadedmetadata` (`tooling/template/url-format`). With the entry
  above on the scaffold's prose.
  - Built 2026-11-26 (Jamie: fix; [#201](https://github.com/stillpointlab/surfaces/pull/201)).
- 2026-11-26 (HLS): a playlist that names another server says the first sentence only after
  31.6 s and 14 policy reports: hls.js asks again after an answer with no status. The build's
  rule for failing at once covers a 4xx alone (`packages/formats/video/src/preview/hls-engine.ts`).
  - Built 2026-11-26 (Jamie: fix, "cap makes sense"; [#201](https://github.com/stillpointlab/surfaces/pull/201)): hls.js asks again at most twice,
    and the sentence comes in 3.4 s. Playlists from other servers "one day" are in the seed
    [streams from beyond the folder](../../tasks/unassigned/seeds/streams-from-beyond-the-folder.md),
    with his note that it may wait for Context Manager in the desktop app.
- 2026-11-26 (HLS): the pane asks after a playlist alone, so a segment changed on disk does not
  load the stream again (`packages/hosts/local/src/client/pane.ts`).
  - Closed 2026-11-26 (Jamie: "close is fine").
- 2026-11-26 (HLS): a `.ts` segment in the tree opens as code and is refused as not text. A
  folder of segments shows as a list of such files.
  - Closed 2026-11-26 for now, with a seed for telling a format by a file's bytes where endings
    collide: [a format told by a file's bytes](../../tasks/unassigned/seeds/a-format-told-by-a-files-bytes.md)
    (Jamie: "happy to defer for now - but if it is possible we should seed it for later").
- 2026-11-26 (HLS): the port of the browser tests' server cannot be set from the command line
  (`tooling/vitest.ts`).
  - Closed 2026-11-26 (Jamie: "close is fine").
- 2026-11-26 (the phase's follow-ups, from Jamie's question on `canplay` and `loadedmetadata`):
  an audio or video preview is ready, and takes its loading cover away, on `loadedmetadata`. A
  browser that loads nothing of a file before a person presses play never sends it. Tried with
  `preload="none"` standing in for such a browser, in Chromium 158 and Firefox 159: `loadstart`
  and `suspend` come and nothing more, so the element would stay at "Loading" and never be
  ready. Safari on an iPhone is said to behave so in some modes and was not run. `suspend` is no
  sign to go by: Chromium sends it before the metadata of a file it goes on to load.
  - **Carried** (Jamie, 2026-11-26): "iOS Safari makes sense as a test bed, let's add to
    followup as you suggest and I'll switch to Mac when we drain that one". It waits for his
    walk on a Mac and an iPhone.

## Phase 4

- 2026-11-26 (PDF): every page's size is read before any is drawn, one request to the worker a
  page. 200 pages took 46 ms; a PDF of thousands was not measured
  (`packages/formats/pdf/src/preview/pdf-preview.ts`).
  - Jamie, 2026-11-27: fix. "let's fix it, even if we measure I want to think about low power
    like mobile".
- 2026-11-26 (PDF): a change of the screen's pixel ratio (a window moved to another screen)
  does not draw the pages again (`packages/formats/pdf/src/preview/pages.ts`).
  - Jamie, 2026-11-27: fix.
- 2026-11-26 (PDF): Firefox says "The execution of microtasks on this page was reordered to
  avoid unsafe execution." once for each PDF opened. It comes with pdf.js; why was not looked
  into.
  - Closed 2026-11-27 (Jamie: "close").
- 2026-11-26 (PDF): `gen-styles.ts` now also runs `gen-pdfjs.ts` for a package that depends on
  `pdfjs-dist`, so the script's name says less than it does (`tooling/gen-styles.ts`).
  - Closed 2026-11-27 (Jamie: "close is fine").
- 2026-11-26 (PDF): `prettier --write` run from inside a package's folder does not read the
  root's `.prettierignore`, and formatted the generated copies once. The generating step saw
  the sizes differ and wrote them again.
  - Closed 2026-11-27 (Jamie: "close").
- 2026-11-26 (PDF): the package's CommonJS worker (`dist/worker.cjs`) requires an `.mjs`. No
  host loads it; the README's "Workers" already says the CJS worker is not the worker.
  - Closed 2026-11-27 (Jamie: "close, I assume we don't need it because we use our own?"). So
    it is: both hosts load the package's worker as an ES module, and the CommonJS file is there
    because the shared build writes both kinds for every entry.
- 2026-11-26 (PDF text): the browser's own find bar was not tried on a PDF's text, since no
  script can press it. `window.find` finds a phrase in both browsers; in Chromium it selects the
  text and does not scroll the column to it, in Firefox it does.
  - **Carried** (Jamie, 2026-11-27): "let's carry to user validation at stage end".
- 2026-11-26 (PDF text): pdf.js leaves a hidden canvas, for measuring text, in the host's
  `document.body`, one for each language, and nothing takes it away (`TextLayer.cleanup()` is
  never called).
  - Jamie, 2026-11-27: "fix, let's clean up".
- 2026-11-26 (PDF text): a page's text is laid before the next page's canvas, so later pages of
  a dense PDF are drawn about 30 ms later each (`packages/formats/pdf/src/preview/pages.ts`).
  - Jamie, 2026-11-27: fix.
- 2026-11-26 (PDF text): pdf.js reads the test PDF's ZapfDingbats line as "3456789:;<=>", and
  a vertical Japanese comma as its vertical form. That is what is copied and what a reader
  hears.
  - Closed 2026-11-27 (Jamie: "close as known issue"). It is in the package's README, under
    what the text does not give.
- 2026-11-26 (PDF text): in Chromium the selection is empty for a moment while a drag crosses
  the blank between two pages, and comes back.
  - Closed 2026-11-27 (Jamie: "close").
- 2026-11-27 (PDF, from the [spike](../../tasks/stage6/phase4/spikes/unlocking-a-pdf-with-a-password.md)):
  a PDF with a password is told so in words, with no field to type one.
  - Jamie, 2026-11-27: "followup is fine if it fits as a drain sized item"; the field "inside"
    the element; the password manager's offer stopped in Chromium and left in Firefox.
  - Built 2026-11-27 ([#209](https://github.com/stillpointlab/surfaces/pull/209)): 581 lines,
    255 of them tests, within the spike's first version.
- 2026-11-27 (PDF text, from the same spike): the text layer lets a person copy from a PDF whose
  owner forbids copying, as pdf.js's own viewer does by default.
  - Closed 2026-11-27 (Jamie: "leave no-copy for now - we aren't aiming to be a secure pdf
    platform, just a convenience. We can review later if it is needed").
- 2026-11-27 (PDF text): the browser's find reaches the pages near view alone, since only they
  hold their text.
  - Closed 2026-11-27 with a seed (Jamie: "seed for better Ctrl-F in pdfs is fine"):
    [finding a word anywhere in a PDF](../../tasks/unassigned/seeds/finding-a-word-anywhere-in-a-pdf.md).
- 2026-11-27 (PDF): the package ships a copy of pdf.js's worker with one line changed, and the
  issue asking pdf.js for a way without it is written and not sent.
  - Closed 2026-11-27 (Jamie: "we'll leave it for now").
