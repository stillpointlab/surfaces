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
