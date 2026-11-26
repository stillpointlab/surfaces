---
column: done
pr: 194
completed: 2026-11-26
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
- **Two failures, two sentences.** `MediaError.code` alone does not tell them apart: a 404 and a
  file of noise are both `MEDIA_ERR_SRC_NOT_SUPPORTED` in Chromium 158 and Firefox 159, so for
  that code the address is asked once:
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
  client's `probe` returns it, and the pane keeps the one it last applied.
- **The browser keeps what it has played.** The raw route answers `cache-control: no-store`, so
  a seek back in a long file is downloaded again. Jamie carried that entry of the log into this
  build on 2026-11-26, "with the intent to address during audio spec impl": with a validator the
  route can let the browser keep a file and ask whether it changed.
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

- [x] In the built local host, in Chromium: one file of each ending plays from the tree; a seek
      works in a long one; another file opened stops the first.
- [x] A track that is playing carries on through a tab hidden and shown again, and through the
      event stream's reconnection. (The hidden tab was imitated: see As built.)
- [x] A seek back into a part of a long file already played asks for no byte again (counted
      at a proxy before the route, not in the network panel), and a file changed on disk is
      still loaded anew.
- [x] A file that is not audio under an audio ending says the second sentence; a file removed
      while its row shows says the first, or the host's own words for a file that is gone.
      (It said the host's.)
- [x] The browser tests pass in the PR's job, and their time is in the PR. (A PR on another
      PR starts no job, so the run was started by hand on the branch: 49 s for the job.)
- [x] Firefox: the same files play in the harness. (Driven by Playwright's Firefox 159, not by
      a person's hand.)
- [x] The root README's table, the package's README and the release walk name the format.
- [x] `npm run check` passes. (In CI, in that run; not run whole on the build's machine: see
      As built.)

### Work package

- **Owns:** `packages/formats/audio`; the two functions in `common`; `registry.ts` and the
  pane's handling of a changed URL file in the local host, with the raw route's validator if
  that is the way.
- **Must not change:** the descriptor's contract, image, or the template.
- **Runs after:** phase 2's browser tests.

## As built

Built by an Opus 5.5 sub-agent, read and checked by the orchestrating agent, which put the branch
on [the tooling's move to TypeScript](https://github.com/stillpointlab/surfaces/pull/193), made
the failure's question ask one byte (below), and ran the harness in both browsers again at the
end.

### The fault was there, as section 4 read it

Seen first, in the development host in Chromium 158, with a trial `<audio>` and a proxy before
the host so the event stream could be cut as a dropped network cuts it. A track three seconds in
was replaced by a new element, at 0:00 and paused, each time:

- a `changed` event for the file, the same bytes written again (`?rev=1`);
- the tab hidden and shown (`?rev=2`);
- the stream cut and come back (`?rev=3`).

Each replacement also asked for the whole file once, to learn whether it was there.

### How section 4 is built

One value, the file's **validator**, mends the reconnection and the caching together.

- **The raw route** reads its `stat` to the nanosecond and sends `ETag: "<size>-<time>"` (both
  in hex) and `Cache-Control: no-cache` with every answer of a file (200, 206, 304). A request
  with `If-None-Match` naming the tag is answered 304 with no body. A `Range` under an `If-Range`
  that is not exactly the tag is answered with the whole file.
- **`no-cache`, not a time to live:** the browser may keep what it was sent, and asks the route
  before it uses any of it. So every use still passes the request checks and the token.
- **What stays `no-store`:** every refusal, the 416 among them, and every other route.
- **`probe`** answers `{ ok, validator }`. It is a `GET` for the file's first byte, past the
  browser's cache. It was a `GET` for the whole file with the body let go, and that was measured
  to send 450 kB to 1.1 MB of a long file before the cancel landed. An empty file has no first
  byte (416): it is there, with no validator.
- **`urlFor(path, validator)`** puts the validator in the address as `?rev=`. The client's own
  count of changes and reconnections is gone. So an address changes when its file does and only
  then, and between changes the browser's copy serves it.
- **The pane** asks for the validator as a URL file opens, and again on a change or when the
  stream comes back:
  - the same validator: nothing happens, and a track plays on;
  - another: a new element at the new address;
  - the file gone: "This file was deleted on disk.";
  - any other refusal (the host away): the element keeps what it has.
- **The request check is as it was.** Chromium sends no `Origin` with a `HEAD` to its own
  origin, and the host refuses it (seen: `HEAD /api/raw/tone.mp3 Origin=(none) -> 403`). `probe`
  is a `GET`, so nothing needed the check changed, as Jamie ruled on 2026-11-26.

### A seek back, measured

A ten-minute, 115 MB file, counted at the proxy (what the raw route was asked and what it sent),
against the same proxy rewriting the route's answers to what it sent before (`no-store`, no
`ETag`):

| Run | As built          | As it was    |
| --- | ----------------- | ------------ |
| 1   | one 304, no bytes | 8.2 MB again |
| 2   | one 304, no bytes | 8.4 MB again |
| 3   | nothing asked     | 6.4 MB again |
| 4   | nothing asked     | nothing      |

In the fourth run of the old headers Chromium's own buffer still held the part played. The same
file opened again in a new player was not steady either way: about 5.5 MB as built, most of what
it needed coming from the kept copy through a 304, and 1 byte or 8.6 MB as it was.

### `MediaError.code` does not tell the two failures apart

The spec said it did, and its sentence is corrected. Measured in Chromium 158 and Firefox 159: a
404, a 403, a connection dropped part way, an empty file and a file of noise all end as
`MEDIA_ERR_SRC_NOT_SUPPORTED`. So:

- `mediaFailureOf(media)` in `common` takes the element, not the error, and answers in time
  (it is `async`). A decode error is the second sentence; a network error or an abort is the
  first; for "not supported" it asks the address once, and an answer that arrived is the second
  sentence.
- **It asks for one byte** (`Range: bytes=0-0`), past the browser's cache. The build asked for
  the whole file and let the body go, which is what `probe` was measured not to do well. An
  empty file (416) is the second sentence, as it was.
- **Jamie, 2026-11-26:** "we can keep the extra request to keep the errors distinct".
- `releaseMedia(media)` is the other shared function: pause, take the source away, load nothing.

### Where the spec was silent

- **Failed:** the name stays and the words take the player's place. A failure after the length
  was known (the network lost part way) shows the words too, reported once.
- **Leaving the page pauses in a microtask,** so an element moved (out and back in one task)
  plays on, as a browser's own media element does.
- **In the registry** audio is after image and before code.
- **`.oga`** is the `.ogg` clip under the other name.
- **The pane asks for the validator of every URL file it opens,** an image too: one request of
  one byte more.
- **The scaffold's output was kept as it came** but its prose, which read oddly under the new
  name, and the template's sample picture, which is gone.
- **The local host names audio in two more places** than section 5 says: its `package.json` and
  its client's `tsconfig`, as for every format.

### What was run, and what was not

- **In the built host, Chromium 158,** by a script and not a person: every line of the
  checklist's first four. The removed file said the host's words ("This file was deleted on
  disk."); the element's first sentence is shown by the browser tests and the harness. This run
  was before the one-byte change to the failure's question.
- **The hidden tab was imitated.** Headless Chromium does not hide a tab that is behind
  another, so the script set `document.hidden` and sent a real `visibilitychange`. The stream's
  cut was real. A tab really hidden, in a browser with a window, is in the release walk.
- **In the harness, Chromium 158 and Firefox 159,** by Playwright, at the branch's last commit:
  each of the nine endings loads, plays and is labelled with its name; the missing file says the
  first sentence, the noise the second, no source "No audio selected.".
- **Tests on the build's machine:** audio 35 and 5 in a browser (1.1 s), the local host 1,027,
  `common` 425. `npm run check` whole was not run there: another repository's CI held the
  machine for the length of the build. This PR's CI is the whole check.
- **Not tried:** Safari; a person's ear.
