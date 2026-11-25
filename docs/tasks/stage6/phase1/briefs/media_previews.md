---
column: todo
created: 2026-11-25T13:40:00-07:00
tags: [formats, feature, scaffold, dev-tooling, docs]
---

> A brief captures the _why_ and the desired outcome before any task breakdown exists. Keep it short
> — one page. Specs derived from it live in the sibling `specs/` folder, built from
> `spec.template.md`. The `column:` frontmatter above drives this file's card on the task board.

# Brief: media previews

_Drafted by the claude agent on 2026-11-25, at stage 6's opening, from the plan Jamie agreed that
day, and amended the same day with his answers to its first nine questions. The phases are a
proposal until he rules on them._

## High-level goal

A PDF, an audio file and a video file each open as a preview, in the local host and in Context
Manager, the way an image does today. A video plays in a basic player of our own, and that
player can play a stream. Each is a format package made with the scaffold, so the stage also
leaves a scaffold whose output a host can register.

## Background

- Jamie's [stage 5 reflections](../../../../devlogs/stage5/reflections.md) left three ways on:
  more formats, new apps, or more of the move out of Context Manager. On 2026-11-25 he chose the
  formats:
  - the previews are a gain in both hosts;
  - a third app (a [media manager](../../../unassigned/seeds/media-manager.md)) would sit on them,
    and is the likely stage 7;
  - more of the git and GitHub work in surfaces is wanted in the long term and is paused, since it
    gains Context Manager little now.
- The seeds this grows from are in [`../seeds/`](../seeds/):
  - [media formats, preview first](../seeds/media-formats-preview-first.md);
  - [PDF preview](../seeds/pdf-preview.md), with its survey of libraries;
  - [one scaffold for formats and apps](../seeds/one-scaffold-for-formats-and-apps.md);
  - [browser tests in CI](../seeds/browser-tests.md);
  - [a token for the run](../seeds/a-token-for-the-run.md), which Jamie ruled into this stage's
    phase 1 on 2026-11-22.

### What is there today

Read at surfaces `e4758a2` and Context Manager `2b4182fd`.

- **The descriptor already has the shape.** A format that `needs: 'url'` is given the file's URL
  and no text. Image is the one such format, and the model: a descriptor, a preview element with
  its loading and failed states, and no editor.
- **The local host's `/api/raw` names the types** for `.pdf`, `.mp3`, `.wav`, `.oga`, `.ogg`,
  `.weba`, `.mp4`, `.webm` and `.ogv`. It sends a whole file in one response and does not answer
  a range request, which a browser needs to seek in a long video. A file's address carries its
  path in the query (`/api/raw?path=…`), so an address relative to the file does not reach its
  neighbours: a playlist cannot find its segments.
- **The local host's page policy** allows media from its own origin (`media-src 'self'`) and
  scripts from its own origin, which covers a worker. It allows no frame and no object
  (`frame-src 'none'`, `object-src 'none'`), and a raw response carries `sandbox`. A PDF cannot be
  shown there by the browser's own viewer in a frame without loosening that.
- **The scaffold makes a format no host can register.** The template has no `./format` entry, and
  a change to the template is proven by making a trial format and removing it by hand.
- **No package runs its tests in a browser.** `formatTest({ browser: true })` exists and nothing
  flips it. jsdom plays no media and draws no canvas.
- **Context Manager registers five formats** in one table (`src/shared/utils/formats.utils.ts`),
  and already classes audio, video and PDF as binary. Its image route sends the whole file in
  one response, and its read of a repository image has a 2 MiB bound whose meaning for a larger
  file the adoption's spec has to read. Its policy allows no object and names no rule for media
  or workers, so both fall to its own origin.

## Desired outcome

- In the local host, a `.pdf`, an audio file or a video file chosen in the tree shows in the
  page. A long video seeks. A file the browser cannot play says so in words.
- A playlist (`.m3u8`, `.mpd`) with its segments beside it plays in the same player.
- In Context Manager, the same goods preview where an image does today.
- `npm run new-format -- <name>` makes a package a host can register with no edit by hand, and
  the template is tested where it lies.
- The packages that need a browser run their tests in one, in CI.
- The local host asks every request for the run's token.

In order:

| Phase | What                                                                                                                                                                                             | Where           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| 1     | This brief and the [streaming spike](../spikes/a-video-player-that-streams.md); the token, as a spec and its build; the specs for phase 2                                                        | here            |
| 2     | Groundwork: the scaffold makes a registrable format and tests in place; browser tests in CI; the raw route answers range requests and gives an address by path; a package can ship a worker file | here            |
| 3     | The audio preview; the video player: a plain file, then HLS, then MPEG-DASH                                                                                                                      | here            |
| 4     | PDF preview                                                                                                                                                                                      | here            |
| 5     | Context Manager adopts the three                                                                                                                                                                 | Context Manager |
| 6     | The close: release review, release walk, Jamie's validation; the spike on writing bytes                                                                                                          | here            |

## How the stage runs

What stage 5 did, kept, with what Jamie's reflections on it change:

- **The follow-up log is drained at each phase's close,** not at the stage's end. A phase carries
  on at most three entries.
- **The stage's end is for the release review and Jamie's validation,** and what they find is
  built then, not deferred to the next stage's start.
- **One integration in Context Manager,** at the end, with the walks at that pin.
- **One spec is one work package** for a sub-agent in a worktree of its own. The orchestrating
  agent reads each result, runs `npm run check` from a clean tree when CI is idle, and opens the
  pull request. No one uses `git stash`: it is shared by every worktree.

## Alongside, on paper

None of these holds a phase up:

- **A spike on [Context Manager on the runner](../../../unassigned/seeds/context-manager-on-the-runner.md),**
  the information Jamie asked for on 2026-11-22.
- **A seed for the character creator,** in Jamie's words, and his words for the
  [media manager](../../../unassigned/seeds/media-manager.md).
- **A spike on writing bytes** through the storage port, at the stage's close, so
  [very basic media editors](../../../unassigned/seeds/basic-media-editors.md) can start from an
  answer.

## Constraints

- **Preview only.** No editor for any of the three, and no write of a media file. The storage port
  stays text.
- **Neither host's policy is loosened** for a frame or an object. What a PDF needs to draw is
  built into the package and served from the host's own origin. The one loosening asked for is
  `blob:` for media (open question 2).
- **A plain media file loads no streaming library.** An engine loads when a playlist is opened.
- **Nothing the five text formats or image do changes.**
- **The descriptor's contract holds** unless a spec shows a preview cannot be built on it.
- **Context Manager's part is its own:** the rows in its table, how it serves a large file, and
  its limits are decided in its adoption spec, not here.

## Decided

Jamie's answers on 2026-11-25 to this brief's first draft:

1. **Three packages:** PDF, audio and video each have their own.
2. **A basic video player of our own, which can play a stream:** HLS through hls.js or something
   like it, and the other streaming formats. The
   [spike](../spikes/a-video-player-that-streams.md) was run the same day.
3. **pdf.js** for PDF. Its spec still opens with the checks the seed left: the worker as a built
   file of its own, and what a JPEG 2000 image does under each host's policy.
4. **Image gains nothing in this stage.** A source view for SVG goes with the image editor, and
   is noted in [its seed](../../../unassigned/seeds/image-editor-basic.md).
5. **Every common ending the browsers play.** The spike played one file of each in Chromium and
   Firefox: its list is the specs' starting point, and WAV and MP3 are on it.
6. **Context Manager may limit a file's size for now,** and serves audio and video as a stream a
   player can seek in.
7. **The spike on writing bytes is in this stage's close.**
8. **A phase carries on at most three follow-ups,** a number open to change. The aim is that
   the stage's close never meets a log of fifty again.
9. **Stage 5's two open entries:** the harness keeps its two ways to read for now, and the typed
   `[d]` joins the seed
   [a changed block comes back with its brackets escaped](../../../unassigned/seeds/brackets-escaped-in-a-changed-block.md).
   Both are closed in [stage 5's log](../../../../devlogs/stage5/followups.md).

## Open questions

From the [spike](../spikes/a-video-player-that-streams.md), which gives the agent's lean on each:

1. **Where streams come from.** A playlist in the folder with its segments beside it is what
   the stage builds. A stream on another server, a host cutting a stored video into a stream,
   and live video are each a larger step: in this stage, or seeds?
2. **`media-src 'self' blob:`** in both hosts' policies, which a streaming library cannot play
   without in Chromium.
3. **Controls drawn by us,** or the browser's controls on our element for a first pass?
