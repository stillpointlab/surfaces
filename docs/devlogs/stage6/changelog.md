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
  [a seed](../../tasks/unassigned/seeds/root-entries-register-nothing.md) for all five older
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
- A seed for [the older formats' root entries](../../tasks/unassigned/seeds/root-entries-register-nothing.md),
  from Jamie's question on image's.
- Phase 1's transcript was backed up at its close; phase 2's follows this one.
