---
column: todo
created: 2026-11-25T23:30:00-07:00
tags: [formats, feature, code]
---

# Spec: the audio preview

_From the [media previews brief](../../phase1/briefs/media_previews.md), phase 3, and the
[streaming spike](../../phase1/spikes/a-video-player-that-streams.md). The first of three specs
in the phase, each one PR on the one before: this, then [video](video-preview.md), then
[HLS](video-plays-hls.md)._

## High-level goal

An audio file chosen in the local host's tree plays in the page, through an `<audio-preview>`
element in a package of its own. It is the first format made with the scaffold's URL template,
and the first whose file keeps going while the person does something else, so it also settles
what the local host does with a file that is playing.

## Related context

- **Depends on phase 2:** the scaffold (`npm run new-format -- audio --url`), the raw route (an
  address by path, range requests, the types), and
  [browser tests](../../phase2/specs/browser-tests-in-ci.md), which this is the first format to
  use.
- **The model** is `tooling/template/url-format/` and, behind it, `packages/formats/image`.
- **Main files:** a new `packages/formats/audio` (`@stillpointlab/audio-format`);
  `packages/hosts/local/src/client/registry.ts` and `pane.ts`; `packages/common` for the two
  functions in section 3; the root README's table of packages; the release walk.
- **Jamie, 2026-11-25:** three packages; "all common formats the browsers support"; the
  browser's own controls for now.

## Technical requirement

### 1. The package

Made with the scaffold and kept to its shape: `./format` (the descriptor `audioFormat`, id
`audio`, `needs: 'url'`), `./preview` (the element), no editor, no worker.

**It opens** `.mp3`, `.wav`, `.flac`, `.ogg`, `.oga`, `.opus`, `.m4a`, `.aac` and `.weba`. The
spike played one file of each in Chromium and Firefox but `.oga`, which is `.ogg` under another
name and is tried here.

### 2. The element

`<audio-preview>`, with `AudioPreviewElement extends UrlPreviewElement` as its exported type.

- **What shows:** the file's name, and under it an `<audio controls preload="metadata">`. The
  name is also the player's label for a screen reader.
- **It does not start by itself.** The person presses play.
- **States,** as the template's:
  - _empty:_ "No audio selected.";
  - _loading:_ until the browser knows the file's length (`loadedmetadata`);
  - _loaded:_ the player;
  - _failed:_ words in place of the player, said once to the error handler.
- **Two failures, two sentences.** The browser tells them apart (`MediaError.code`):
  - the file did not arrive: "Couldn't load this audio.";
  - it arrived and the browser has no decoder for it: "This browser can't play this audio."
- **Ready** settles when the length is known or the load has failed, never on a time.
- **A new source lets the old one go:** it is paused and its download ended (`src` removed, then
  `load()`), so a file switched away from stops sounding and stops arriving.
- **Leaving the page's tree pauses it.** The element keeps its media, so put back it is where it
  stopped, and it does not start again by itself.

### 3. What audio and video share

The two elements are alike in everything but the tag they hold. Two functions go in `common`,
beside `createStatus`, and each element is written on them:

- which of the two failures a `MediaError` is;
- letting a media element go (pause, end the download).

Nothing larger is shared in this stage. A set of controls both use is the
[players of our own](../../../unassigned/seeds/players-of-our-own.md) seed.

### 4. The local host leaves a playing file alone

Read in the code, not yet tried: the pane answers every `changed` event for the open file, and
every reconnection of its event stream, by making a **new element** for a format that takes a
URL. The stream is held only while the tab shows. So a person who starts a track and looks at
another tab comes back to a new player at 0:00. An image hides this, since loading it again
looks the same.

- The first step of the build is to see it happen, in the built host, with a trial element or
  the template.
- **Required:** the open file's element is replaced only when the file itself has changed or
  gone. A reconnection that finds the same file changes nothing a person can see or hear.
- **A lean, for the build to check:** the raw route already reads the file's size for its
  ranges, in a `stat` that holds its time too. It sends the two as a validator (`ETag`), the
  client's `probe` returns it, and the pane keeps the one it last applied. This is also most of what the log's entry on
  `cache-control: no-store` needs, which is closed here if it falls out and left if it does not.
- A file that does change on disk while it plays is loaded again from its start. That is
  accepted.

### 5. Registered in the local host

One import and one entry in `registry.ts`. Nothing else in the host names audio: the tree, the
pane and the raw route work from the descriptor and the file's ending.

### 6. Tests

- **jsdom** (`npm test`): the descriptor suite, `describeUrlPreviewContract`, the element's
  states with events dispatched by the test, both failure sentences, the old source let go, the
  pause on leaving.
- **A browser** (`*.browser.test.ts`), few: a real clip loads and reports its length; it plays
  and its time moves; it seeks; a file of noise fails with the second sentence, and a missing
  one with the first.
- **Clips** under `dev/media/`, each under 50 kB, with the `ffmpeg` line that made each in the
  README. One clip for each ending is not needed in tests: the harness has them (below).
- **The local host:** the pane's test for section 4.

### 7. The harness

Fixtures for a clip that plays, one for each ending the format opens (so each can be heard by
hand in any browser), a missing file, a file the browser cannot decode, and no source.

## Clarifications

For Jamie, with the agent's lean in each:

1. **Sharing two functions through `common`** (section 3), and not a copy in each package or a
   package under `components/`. Lean: `common`, since it is small and has no look of its own.
2. **A track stops when another file is opened.** The local host has one pane, and the element
   that played is gone. Lean: yes, for now; sound that outlives its file's view is the media
   manager's to design.
3. **Section 4 is in this spec** and not one of its own. It is a change to the host that only a
   playing file needs, and audio is the first. Lean: here, as the spec's first step; if it
   proves larger than the validator, it is split out and audio lands with the fault logged.

## Non-goals

- Controls of our own, a waveform, a playlist, or sound that carries on after its file is
  closed.
- An editor, or any write.
- Reading tags or cover art from the file.
- Context Manager, which adopts all three formats in phase 5.
- Safari. No build of it runs here, and the walk on a Mac is Jamie's.

## Acceptance / completion checklist

- [ ] In the built local host, in Chromium: one file of each ending plays from the tree; a seek
      works in a long one; another file opened stops the first.
- [ ] A track that is playing carries on through a tab hidden and shown again, and through the
      event stream's reconnection.
- [ ] A file that is not audio under an audio ending says the second sentence; a file removed
      while its row shows says the first, or the host's own words for a file that is gone.
- [ ] The browser tests pass in the PR's job, and their time is in the PR.
- [ ] Firefox, by hand: the same files play in the harness.
- [ ] The root README's table, the package's README and the release walk name the format.
- [ ] `npm run check` passes.

### Work package

- **Owns:** `packages/formats/audio`; the two functions in `common`; `registry.ts` and the
  pane's handling of a changed URL file in the local host, with the raw route's validator if
  that is the way.
- **Must not change:** the descriptor's contract, image, or the template.
- **Runs after:** phase 2's browser tests.
