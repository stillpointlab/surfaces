---
column: in-progress
created: 2026-11-25T23:30:00-07:00
tags: [formats, feature, code]
---

# Spec: the video preview plays an HLS stream

_From the [streaming spike](../../phase1/spikes/a-video-player-that-streams.md) and Jamie's
rulings on it, for phase 3 of the [media previews brief](../../phase1/briefs/media_previews.md).
One PR, on top of [video](video-preview.md)._

## High-level goal

An HLS playlist (`.m3u8`) in the folder, with its segments beside it, plays in `<video-preview>`
as a file does. hls.js is loaded when a playlist is opened and at no other time.

## Related context

- **Jamie, 2026-11-25:** hls.js, "loading it only when we are playing m3u8"; streams from the
  folder for now; `media-src 'self' blob:` allowed; the browser's controls, since hls.js works
  with them.
- **What the spike showed:** hls.js 1.7.4 played an fMP4 stream (VP9 and Opus) and an MPEG-TS one
  (H.264 and AAC), with a seek, in Chromium 158 and Firefox 159, under the local host's policy
  once it allowed `blob:` for media. It ran without its worker. A playlist whose segments are
  byte ranges of one file needs range requests.
- **What phase 2 gave:** the raw address carries the file's path in its own, so a segment named
  beside its playlist resolves; ranges; `blob:` in the policy; the types for `.m3u8` and `.m4s`.
- **Main files:** `packages/formats/video`.

## Technical requirement

### 1. The format opens `.m3u8`

`videoFormat.opens` gains it. A playlist is text, and the format still `needs: 'url'`: the
element is given the playlist's address and the engine reads it.

### 2. An engine behind one small interface

In the video package, not exported from it:

- **attach** to a `<video>` with a playlist's address; **let go**; and tell the element of a
  failure it cannot recover from, as one of the element's two failures.
- The element chooses by the source's ending: a file is the `<video>`'s own `src`, and a
  playlist goes to the engine. The ending is read from the address's path, so the local host's
  `?rev=` does not hide it.
- Everything else about the element holds for a stream as for a file: the states, ready when
  the length is known, the note for a picture of no size, the old source let go (the engine
  with it) and the pause on leaving the tree.

The interface is what MPEG-DASH
([a seed](../../../unassigned/seeds/mpeg-dash-streams.md)) and a live source would stand
behind. It has one engine now, and is given no member that engine does not use.

### 3. hls.js

- A dependency of the video package, Apache-2.0, at the version the spike ran or later. Its
  full build, not the light one: it is fetched only for a playlist, so its size costs a file
  nothing, and the light build leaves out alternate sound tracks.
- **Loaded on demand** through `createLazyLoader`, as a file of its own in the package's build
  and each host's. A test on the built package shows that the preview's own file does not
  contain it.
- **No worker** (`enableWorker: false`), so it never tries the `blob:` worker the policy refuses.
  The [worker spec](../../phase2/specs/a-worker-file-in-a-format-package.md) says how one would
  be added later.
- **Where the browser has no Media Source Extensions** and plays HLS itself (Safari on an
  iPhone), the playlist's address is the `<video>`'s own `src`. Chromium also plays HLS by
  itself now; hls.js is used wherever it can run, so the player is the same in each browser.
  This path is written from the documentation and cannot be run here.
- **Failures:** a playlist or a segment that does not arrive is the first sentence; a stream
  with nothing the browser can decode is the second. A media error hls.js can recover from is
  recovered once, as its documentation gives; a second is a failure.

### 4. Tests

- **jsdom:** the choice by ending, with the engine faked; the engine let go on a new source and
  never loaded for a file.
- **A browser,** few: a playlist with three segments beside it loads, plays and seeks into its
  last segment; the same stream with its segments as byte ranges of one file; a playlist whose
  segments are missing fails with the first sentence.
- **Streams** under `dev/media/`, each under 50 kB in all, with the `ffmpeg` lines in the README.

### 5. The harness and the host

- Harness fixtures for an fMP4 stream, an MPEG-TS one, one in byte ranges, and one whose
  segments are missing.
- By hand in the built local host: a playlist chosen in the tree plays and seeks; the network
  panel shows the segments asked for by path, as ranges where the playlist names ranges; no
  policy report.

## Known and left

- **A `.ts` segment is sent as text.** The ending is TypeScript's too, and the raw route gives
  it `text/plain`. hls.js asks for a segment's bytes whatever their type, and the spike's server
  sent every file as `application/octet-stream` with no harm; `text/plain` itself is first
  tried by this build, with an MPEG-TS stream of `.ts` segments in the host. The package's own
  MPEG-TS stream names its segments `.m2t`: a `.ts` file in the package is read as TypeScript by
  its tools, and Vite compiles it. Opened from the tree, a `.ts` segment is matched by the code
  format, and the host says "This file is not text, so it cannot open here."
- **A playlist that names another server** is refused by the policy and fails with the first
  sentence. Streams from beyond the folder are
  [a seed](../../../unassigned/seeds/streams-from-beyond-the-folder.md).
- **A stream of sound alone** opens in the video preview, with the note for no picture.
- **No choice of quality.** hls.js picks the level by the connection. A choice is part of
  [players of our own](../../../unassigned/seeds/players-of-our-own.md).

## Non-goals

- MPEG-DASH, live sources, encrypted streams, captions and alternate sound tracks as choices.
- A worker for hls.js.
- Context Manager, which serves no stream in this stage.

## Acceptance / completion checklist

- [x] In the built local host, in Chromium: an fMP4 stream and an MPEG-TS stream each play and
      seek from the tree, with no policy report.
- [x] Opening an `.mp4` fetches no hls.js (counted at a proxy before the host, not in the
      network panel, and the test on the build).
- [x] A stream in byte ranges plays with its true length.
- [x] A playlist with its segments missing says the first sentence. (In the host and the
      browser tests. In the harness it says the second: see As built.)
- [x] Firefox: both streams play in the harness. (Driven by Playwright's Firefox 159, not by a
      person's hand.)
- [x] The browser tests pass in the PR's job, and their time is in the PR. (A PR on another
      PR starts no job, so the run was started by hand on the branch: 70 s for the job, which
      ran every package's browser tests.)
- [x] The package's README says what a stream needs of a host: an address by path, ranges, and
      `blob:` for media. The release walk gains a stream.
- [x] `npm run check` passes. (4,025 tests, on the build's machine.)

### Work package

- **Owns:** `packages/formats/video`, the lockfile for hls.js.
- **Must not change:** `common`, audio, the local host.
- **Runs after:** [video](video-preview.md).

## As built

Built by an Opus 5.5 sub-agent, read and checked by the orchestrating agent, which changed no
code.

### The engine

- **The interface** is `src/preview/stream.ts`, not exported: `attach(media, src, failed)` and
  `release()`. A function that starts an engine answers `null` where none can run (no Media
  Source Extensions), and the element then gives the playlist's address to the `<video>` itself.
- **A playlist is told by the ending of the address's path,** in any case, so the local host's
  `?rev=` does not hide it.
- **hls.js 1.7.4,** the full build, no worker, a dependency of the video package alone. The
  element reaches it by `import()` through `createLazyLoader`, the first time a playlist opens.
- **It is not bundled into the package.** As with every dependency here, the package's build
  leaves `hls.js` as an import, in a small file of its own that only the `import()` reaches, and
  each host's bundler makes hls.js a file. A test builds the package and reads its files: one
  split file imports hls.js, and no entry reaches it but by `import()`.

| File                                          | Bytes   | Gzipped |
| --------------------------------------------- | ------- | ------- |
| The package's engine file (imports `hls.js`)  | 1,488   | 714     |
| The built local host's file with hls.js in it | 578,873 | 178,466 |
| The host's video preview file, without it     | 5,902   | 2,261   |

### Failures

While an engine feeds the `<video>`, the element does not ask `mediaFailureOf` (the source is the
engine's own `blob:`); the engine says which failure it met.

- **The first sentence:** a fatal network error; an answer the server refused (4xx); the engine
  itself not arriving.
- **The second sentence:** a playlist that arrived and does not parse or names no segment; a
  stream no codec of which the browser decodes; any other fatal error.
- **A refused file fails at once.** Left to itself hls.js asks again for a missing segment of a
  stream with one level, and gives up 31.7 s later (measured).
- **A fatal media error is recovered once,** by `recoverMediaError()`, unless it says no codec
  fits. Provoked with segments answered by a web page: a fatal error at 34 ms, a recovery, and a
  second fatal error at 167 ms, so that case ends in the second sentence. A recovery that then
  plays could not be provoked. Noise inside one segment was skipped as a gap, with no failure,
  in both browsers.

### `.ts` segments

- **Sent as `text/plain`, they play.** In the built host a stream of `.ts` segments, made
  outside the repository, played and sought in Chromium 158 and Firefox 159.
- **The package's own MPEG-TS stream names its segments `.m2t`.** A `.ts` file in the package is
  read as TypeScript by `tsc`, eslint and prettier, and Vite (the harness's server, and the
  browser tests') compiles any `.ts` it is asked for and answers 500. The spec's paragraph was
  corrected.
- **Opened from the tree,** a `.ts` segment is matched by the code format and the host says
  "This file is not text, so it cannot open here.", not "a code file" as the spec said.

### In the harness, the missing stream says the second sentence

The harness's server answers a missing file with its own page and a 200, which hls.js cannot
parse as a segment. It is the entry already in the follow-up log for image's and the template's
"Missing" fixtures. The host and the browser tests' server answer 404, and there the stream says
the first sentence, in 98 ms in the host.

### What was run, and what was not

- **In the built host, Chromium 158,** by a script with a proxy before the host: the fMP4, the
  `.m2t`, the `.ts` and the byte-range streams each know their 6 s, play and seek to 5 s; no
  `securitypolicyviolation`; an `.mp4` asks for no file of hls.js and the first playlist asks
  for one; the byte-range stream's four requests are ranges answered 206; a two-minute stream
  plays on through a hidden tab (imitated) and a real cut of the event stream; another file
  opened stops the stream, with no request for it in the 8 s after, also half a second in at
  150 kB/s.
- **In the built host, Firefox 159:** the five streams play.
- **In the harness, Chromium 158 and Firefox 159,** by Playwright, at the last code: the four
  streams and the nine older fixtures.
- **Tests:** video 58 and 8 in a browser (3.9 s), the local host 1,032, `npm run check` whole
  (4,025). The build ran that check while another repository's CI was running on the machine,
  against its instructions; it passed.
- **Never run:** the path for a browser with no Media Source Extensions (Safari on an iPhone),
  which is written from the documentation and tested with the check faked; the package's
  CommonJS build of the engine; a tab really hidden; a person's eyes and ears.
