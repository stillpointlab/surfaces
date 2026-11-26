---
column: in-progress
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

- [x] In the built local host, in Chromium: one file of each ending plays from the tree, sized
      to the pane; another file opened stops the first.
- [x] A 60 s video seeks to its last ten seconds in under two seconds. (In under 0.3 s on
      loopback, and 0.64 s at 300 kB/s.)
- [x] A video that is playing carries on through a tab hidden and shown again. (The hidden tab
      was imitated, as audio's.)
- [x] A clip whose picture cannot be shown says so, and its sound plays.
- [ ] The browser tests pass in the PR's job, and their time is in the PR.
- [x] Firefox: the same files play in the harness. (Driven by Playwright's Firefox 159, not by
      a person's hand.)
- [x] The root README's table, the package's README and the release walk name the format.
- [x] `npm run check` passes. (3,999 tests, on the build's machine at the branch's last code.)

### Work package

- **Owns:** `packages/formats/video`; one line in the local host's `registry.ts`.
- **Must not change:** audio, `common`, the local host beyond that line.
- **Runs after:** [audio](audio-preview.md).

## As built

Built by an Opus 5.5 sub-agent, read and checked by the orchestrating agent, which changed two
things (the ground's colour and the pane, below) and ran the checklist's script in the built host
again after them.

### The element

Audio's, on the same two functions of `common`, with a `<video>` in place of the `<audio>`.
Where it differs:

- **No name shows.** The spec makes the name the player's label, so it is the `<video>`'s
  `aria-label` alone, and the failed state shows its words with no name over them.
- **The player fills the pane** with no padding, the picture contained (`object-fit: contain`):
  a 64×36 clip drew at 992×558 in a 992×759 pane.
- **The note for a picture of no size** is `common`'s notice in its warning tone, above the
  player, once the length is known. The element also listens for the `<video>`'s `resize`, so a
  picture that comes later takes the note away. That is for a stream, the next spec.

### The ground

The spec says a dark ground, and no token was dark in a light theme and a dark one alike. The
build used `light-dark()` over two tokens, which follows the page's `color-scheme`. Context
Manager sets the `--spl-*` properties and not `color-scheme`, so in its dark theme the ground
would have been its text colour. `common` has a token for it now, `--spl-media-backdrop`
(`#0d1117`), which a host need not set.

### The clip with no picture

`dev/media/no-picture.mkv`: Theora and Vorbis in Matroska, 2 s, 10.9 kB. It is the spike's codec
under an ending the format opens. Chromium 158 and Firefox 159 both gave it a length, a picture
of 0×0, sound decoded and time moving. Also sound with no picture in both: MPEG-4 Part 2 in
`.mp4` and `.mov`, Motion JPEG in `.mov` and `.mkv`, ProRes in `.mov`, FFV1 in `.mkv`. H.263 in
`.mov` is sound alone in Chromium and refused by Firefox. H.265 was not tried: the `ffmpeg` here
has no encoder for it but a hardware one.

### A player put aside is let go

Found by this build, in the local host, and true of audio too: the pane opens another file (or a
changed one) in a new element and takes the old one out of the page, where it is paused and
keeps its media, so what it was fetching still arrived. The pane now hands an element that
leaves for good an empty source, through its format's `apply`, and the element lets its media
go. In the built host the first video's time is 0 once another opens; it stayed at 1.02 s
before.

### What was run, and what was not

- **In the built host, Chromium 158,** by a script, at the branch's last code: each of the five
  endings plays from the tree and fills the pane; another file opened stops the first; the two
  seeks; the hidden tab (imitated) and the event stream cut for real; the clip with no picture;
  the file of noise.
- **The seek,** in a 60 s, 16 MB H.264 file: 34 ms to 50 s and 18 ms to 55 s on loopback, one
  range request each. With Chromium's network slowed: 0.41 s at 1 MB/s, 0.64 s at 300 kB/s.
- **In the harness, Chromium 158 and Firefox 159,** by Playwright, before the ground's colour
  and the pane changed: each ending loads at 64×36, plays and is labelled; the clip with no
  picture shows the note and plays; the missing file, the noise and no source say their words.
- **Tests:** video 33 and 5 in a browser (1.7 s), the local host 1,031, `npm run check` whole
  (3,999).
- **Not tried:** Safari; a tab really hidden; H.265; a person's eyes and ears.
