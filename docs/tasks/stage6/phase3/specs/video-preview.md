---
column: todo
created: 2026-11-25T23:30:00-07:00
tags: [formats, feature, code]
---

# Spec: the video preview

_From the [media previews brief](../../phase1/briefs/media_previews.md), phase 3, and the
[streaming spike](../../phase1/spikes/a-video-player-that-streams.md). One PR, on top of
[audio](audio-preview.md). A stream is [the next spec](video-plays-hls.md)._

## High-level goal

A video file chosen in the local host's tree plays in the page, through a `<video-preview>`
element in a package of its own, and a long one seeks without waiting for the whole file.

## Related context

- **Depends on:** [audio](audio-preview.md), for the two functions in `common` and for the local
  host leaving a playing file alone.
- **Main files:** a new `packages/formats/video` (`@stillpointlab/video-format`);
  `packages/hosts/local/src/client/registry.ts`; the root README's table; the release walk.
- **Jamie, 2026-11-25:** "I do want our own basic video player with streaming capability"; the
  browser's own controls for now, on our element.

## Technical requirement

### 1. The package

Made with `npm run new-format -- video --url`: `./format` (`videoFormat`, id `video`,
`needs: 'url'`), `./preview`, no editor, no worker.

**It opens** `.mp4`, `.m4v`, `.webm`, `.mov` and `.mkv`. The spike played each in Chromium and
Firefox with the codecs it names.

**It does not open `.ogv`.** Both browsers have dropped its picture and play its sound alone.
The raw route still names its type, so nothing else changes for such a file.

### 2. The element

`<video-preview>`, with `VideoPreviewElement extends UrlPreviewElement`.

- **What shows:** a `<video controls preload="metadata" playsinline>`, as large as the pane
  allows with its own proportions kept, on a dark ground. The file's name is its label.
- **It does not start by itself.**
- **States, failures, ready, a new source and leaving the tree** are audio's, word for word but
  the noun: "No video selected.", "Couldn't load this video.", "This browser can't play this
  video."
- **A picture the browser cannot show.** A container can hold a sound track the browser plays
  and a picture it has no decoder for; the browser then reports no failure and a picture of no
  size. When the length is known and the picture's width is 0, the element says so above the
  player: "This browser can't show this video's picture. Its sound plays." The spike met this
  with Theora; H.265 in an `.mp4` or `.mov` is the likely case today, and was not tried.

### 3. Registered in the local host

One import and one entry in `registry.ts`.

### 4. Tests

- **jsdom:** the descriptor suite, `describeUrlPreviewContract`, the states and sentences, the
  note for a picture of no size.
- **A browser,** few: a real clip loads and reports its length and its picture's size; it plays;
  it seeks; a file of noise fails with the second sentence.
- **Clips** under `dev/media/`, each under 50 kB (a second or two at a small size), with the
  `ffmpeg` line for each in the README.
- **The seek in a long file** is the raw route's and was measured there. It is tried again by
  hand in the built host, not in a test.

### 5. The harness

Fixtures for one clip of each ending, a clip with sound and no picture the browser can show, a
missing file, a file of noise, and no source.

## Non-goals

- A stream ([the next spec](video-plays-hls.md)).
- Controls of our own, a choice of quality, a poster, thumbnails on the seek bar.
- Captions from a `.vtt` beside the file.
- Picture in picture and full screen beyond what the browser's controls give.
- Context Manager (phase 5), and Safari.

## Acceptance / completion checklist

- [ ] In the built local host, in Chromium: one file of each ending plays from the tree, sized
      to the pane; another file opened stops the first.
- [ ] A 60 s video seeks to its last ten seconds in under two seconds.
- [ ] A video that is playing carries on through a tab hidden and shown again.
- [ ] A clip whose picture cannot be shown says so, and its sound plays.
- [ ] The browser tests pass in the PR's job, and their time is in the PR.
- [ ] Firefox, by hand: the same files play in the harness.
- [ ] The root README's table, the package's README and the release walk name the format.
- [ ] `npm run check` passes.

### Work package

- **Owns:** `packages/formats/video`; one line in the local host's `registry.ts`.
- **Must not change:** audio, `common`, the local host beyond that line.
- **Runs after:** [audio](audio-preview.md).
