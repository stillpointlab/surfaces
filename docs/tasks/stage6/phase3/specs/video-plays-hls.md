---
column: todo
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

- [ ] In the built local host, in Chromium: an fMP4 stream and an MPEG-TS stream each play and
      seek from the tree, with no policy report.
- [ ] Opening an `.mp4` fetches no hls.js (the network panel, and the test on the build).
- [ ] A stream in byte ranges plays with its true length.
- [ ] A playlist with its segments missing says the first sentence.
- [ ] Firefox, by hand: both streams play in the harness.
- [ ] The browser tests pass in the PR's job, and their time is in the PR.
- [ ] The package's README says what a stream needs of a host: an address by path, ranges, and
      `blob:` for media. The release walk gains a stream.
- [ ] `npm run check` passes.

### Work package

- **Owns:** `packages/formats/video`, the lockfile for hls.js.
- **Must not change:** `common`, audio, the local host.
- **Runs after:** [video](video-preview.md).
