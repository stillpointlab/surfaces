---
created: 2026-11-26T17:20:00-07:00
tags: [formats, feature, host-contract]
---

# A format told by a file's bytes, where endings collide

A format is chosen by a file's ending alone. `createFormatRegistry` says so in its own words:
"`find` never reads a file", and where two formats open the same ending the first registered
wins. Stage 6 met the first collision: `.ts` is TypeScript's ending and an MPEG-TS segment's. The
code format takes it, the host reads the segment as text, and says "This file is not text, so it
cannot open here." Jamie, 2026-11-26, ruling that entry of phase 3's log: "do we have any path to
byte detection when format declared extensions collide? happy to defer for now - but if it is
possible we should seed it for later".

It is possible. What follows is the claude agent's reading, not a design Jamie has agreed.

## A path

- **A descriptor may say how it knows its own files,** an optional member beside `opens`: given
  a file's first bytes, it answers yes or no. Most media say what they are at once: `%PDF-`; an
  MPEG-TS packet's `0x47` at bytes 0, 188 and 376; `ftyp` at byte 4 of an MP4; `OggS`; `fLaC`;
  `RIFF…WAVE`; the EBML mark of WebM and Matroska; PNG's and JPEG's first bytes.
- **The host hands over the bytes.** The local host's raw route answers ranges, and its `probe`
  already asks for a file's first byte; asking for the first few hundred is the same request.
  Context Manager would read them its own way.
- **Asked only when the ending does not settle it:** two formats open the ending, the format the
  ending names refuses the file (the "not text" case above), or the file has no ending a format
  opens. A file whose ending settles it costs nothing more than today.

## What it costs

- **The registry's promise changes.** `find` is a plain look-up today, with no file read and no
  waiting. A second, waiting call beside it keeps the first as it is.
- **Both hosts must agree when to ask,** or a file opens differently in each.
- **A text file has no mark.** Bytes can say "this is MPEG-TS, not TypeScript"; they cannot say
  which of two text formats a file is.

## Where else it would help

- A file under the wrong ending, or none: a video saved as `.bin`, a download with no ending.
- An ending two formats could open one day: `.ogg` (sound, or a video's container), `.mp4` and
  `.webm` holding sound alone, which the video preview opens with its note for no picture.
- A file that is not what its ending says, which each media preview now answers with "This
  browser can't play this …": the host could say so before a player is made.

## Read with

- `packages/common/src/format.ts` (`createFormatRegistry`, `FormatDescriptor`).
- The [HLS spec](../../stage6/phase3/specs/video-plays-hls.md), "Known and left" and its "As
  built" on `.ts` segments.
