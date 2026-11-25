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
day. The phases below and the leans under "Open questions" are proposals until he rules on them._

## High-level goal

A PDF, an audio file and a video file each open as a preview, in the local host and in Context
Manager, the way an image does today. Each is a format package made with the scaffold, so the
stage also leaves a scaffold whose output a host can register.

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
  a range request, which a browser needs to seek in a long video.
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
- In Context Manager, the same goods preview where an image does today.
- `npm run new-format -- <name>` makes a package a host can register with no edit by hand, and
  the template is tested where it lies.
- The packages that need a browser run their tests in one, in CI.
- The local host asks every request for the run's token.

In order:

| Phase | What                                                                                                                           | Where           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| 1     | This brief; the token, as a spec and its build; the specs for phase 2                                                          | here            |
| 2     | Groundwork: the scaffold makes a registrable format and tests in place; browser tests in CI; `/api/raw` answers range requests | here            |
| 3     | Audio and video previews                                                                                                       | here            |
| 4     | PDF preview                                                                                                                    | here            |
| 5     | Context Manager adopts the three                                                                                               | Context Manager |
| 6     | The close: release review, release walk, Jamie's validation                                                                    | here            |

## How the stage runs

What stage 5 did, kept, with what Jamie's reflections on it change:

- **The follow-up log is drained at each phase's close,** not at the stage's end. A phase carries
  on only a few entries (question 8).
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
  answer (question 7).

## Constraints

- **Preview only.** No editor for any of the three, and no write of a media file. The storage port
  stays text.
- **Neither host's policy is loosened** for a frame or an object. What a PDF needs to draw is
  built into the package and served from the host's own origin.
- **Nothing the five text formats do changes,** and image changes only if question 4 says so.
- **The descriptor's contract holds** unless a spec shows a preview cannot be built on it.
- **Context Manager's part is its own:** the rows in its table, how it serves a large file, and
  its limits are decided in its adoption spec, not here.

## Open questions

Each has the agent's lean. Answers on the pull request, as before.

1. **One package for each of PDF, audio and video, or audio and video in one?** Lean: three. The
   convention is one format for one kind of good, and what audio and video share is a `<audio>` or
   `<video>` element.
2. **The browser's own controls for audio and video?** Lean: yes, with no player of our own and
   no library. A waveform or a thumbnail is a later wish.
3. **pdf.js for PDF.** Jamie, 2026-11-25: a fine choice, to be looked at once more when its spec
   is written. That look checks what the seed left open (the worker as its own built file, what
   happens to a JPEG 2000 image under each host's policy) and the size of what a page loads.
   Today's read adds one point for it: the local host allows no frame, so the browser's own
   viewer is not a way there.
4. **Does image gain anything in this stage?** The media seed notes it has no raw view, and that
   SVG is text. Lean: no; a source view for SVG is small and can ride with the first media
   editor.
5. **Which file endings open?** Lean: those `/api/raw` names today, and each spec adds what
   Chromium and Firefox both play (`.m4a`, `.flac`, `.mov` are the likely asks). `.ogg` stays
   audio.
6. **How large a file does Context Manager serve, and how?** Its image route sends a whole file.
   A video needs ranges and most likely a stream from where the file is kept. Lean: its adoption
   spec decides, after a read of how it holds a large good; this is the adoption's largest part.
7. **The spike on writing bytes: in this stage's close, or stage 7's start?** Lean: this stage's
   close, since stage 7 may open on the editors.
8. **How many follow-ups may a phase carry on?** The reflections ask "1-3?". Lean: three.
9. **The two entries carried from stage 5's log** ([the stage 6 log](../../../../devlogs/stage6/followups.md)):
   - the harness's two ways to read. Lean: close by design, since a fixture is the dev page's
     sample data and no test loads one;
   - a typed `[d]` whose definition is inside a kept list item. Lean: add it to the seed
     [a changed block comes back with its brackets escaped](../../../unassigned/seeds/brackets-escaped-in-a-changed-block.md),
     which is the same writer.
