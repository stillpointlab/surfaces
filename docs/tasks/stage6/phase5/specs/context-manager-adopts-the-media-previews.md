---
column: todo
created: 2026-11-27T15:30:00-07:00
tags: [context-manager, formats, feature, code]
---

# Spec: Context Manager adopts the audio, video and PDF previews

_From the [media previews brief](../../phase1/briefs/media_previews.md), phase 5: "Context
Manager adopts the three", as "one integration in Context Manager, at the end, with the walks at
that pin". A draft by the claude agent at phase 4's close, for Jamie to read before any of it
starts. The work is in Context Manager's repository; this card is its spec._

## High-level goal

A good that is an audio file, a video file or a PDF previews in Context Manager wherever an image
good does today: it plays, it seeks, its pages draw and its text can be selected.

## Related context

Read at Context Manager `6db02950` (its `main` on 2026-11-27) and surfaces `867eed5`. Read, not
run: nothing here was tried in Context Manager.

- **The table.** `src/shared/utils/formats.utils.ts` registers five formats and joins each to a
  kind and to the stored content types it opens. `RepoFilePathKind` has no kind for audio, video
  or PDF. `isBinaryContentType` in `digitalGood.service.ts` already classes `audio/*`, `video/*`
  and `application/pdf` as media an agent's read never answers as text.
- **What a format given a URL gets.** The server renders an `<img>` at the good's bytes route
  for any format that `needs: 'url'` (`src/services/goodPreviewBody.ts`), and the client mounts
  the format's preview over it (`src/client/utils/formatPreview.ts`). An `<img>` is the wrong
  thing to leave for a sound, a film or a PDF if the preview cannot load.
- **The bytes routes send a whole file.** `sendImage` (`src/routers/_middleware/imageResponse.ts`)
  takes a `Buffer` and sends it, with a policy of its own on the answer
  (`default-src 'none'; style-src 'unsafe-inline'; sandbox`) and `nosniff`. No route answers a
  range. The brief's ruling 6: Context Manager "serves audio and video as a stream a player can
  seek in", and "may limit a file's size for now".
- **A repository's image has a bound of 2 MiB** (`IMAGE_PREVIEW_CACHE_MAX_BYTES`,
  `src/services/git/repoConnection.service.ts`). What it means for a larger file was left for
  this spec to read, and is not read yet.
- **The policy** (`src/routers/app.ts`) names no `media-src` and no `worker-src`, so media falls
  to `default-src 'self'` and a worker to `script-src`. The brief's ruling 12:
  "`media-src 'self' blob:` is allowed", and Context Manager's adoption makes the change.
- **Scripts may come from another origin.** `script-src` and `connect-src` gain
  `appConfig.assets.baseUrl` when it is set, and `ASSET_BASE_URL` is among production's settings.
  A browser refuses a worker whose script is on another origin, whatever a policy says. The
  [worker spec](../../phase2/specs/a-worker-file-in-a-format-package.md) reasoned this for
  development mode and did not run it. The PDF preview cannot draw without its worker.
- **What the formats ask of a host,** from their READMEs: a URL that answers ranges with a
  validator (audio, video); `media-src 'self' blob:` for a stream (video's HLS); the worker and
  the files pdf.js fetches by name served from where the page's scripts are, `connect-src`
  reaching them, and no WebAssembly (PDF).

## Technical requirement

### 1. The pin

Context Manager's surfaces pin moves to the commit `stage6-phase4-complete` names, with the three
new packages among its workspaces.

### 2. The table: three kinds, their content types, their rows

- `RepoFilePathKind` gains `audio`, `video` and `pdf`.
- The three descriptors join `formatRegistry` before `code`, in the order `common`'s README
  gives.
- Each has a row: its kind, its format, and the stored content types it opens. The content types
  come from the endings each descriptor opens, as image's do, not from `audio/*` at large: a
  type the preview cannot play should not be offered one.
- Whatever else reads a kind or `isImageContentType` to decide something (the repository tree,
  project links, the library, export and import) is read, and each either learns the new kinds
  or is written down as not needing to.

### 3. A bytes route that a player can seek in

- A good's bytes for these three kinds are served from a route that answers a range
  (`Accept-Ranges`, `206`, `416`, `If-Range`) with a validator, reading the range from where the
  bytes are stored and not the whole file into memory.
- The answer keeps what `sendImage` guards: the sandbox policy and `nosniff`, with whatever a
  media element or pdf.js's fetch needs and no more.
- It reads by the same rule as the page that shows it: its owner, or anyone when it is public.
- **A bound on size** is chosen and said in words when a file is over it
  ([Clarification 2](#clarifications)).

### 4. What is left when a preview cannot load

For each of the three the server renders something true in place of the `<img>`: the browser's
own `<audio controls>` or `<video controls>` at the bytes route, and for a PDF a link to the
bytes. The client mounts the preview over it as it does for an image.

### 5. The policy and the worker

- `media-src 'self' blob:` is added, as ruled.
- **The PDF worker is loaded from the page's own origin** in every mode Context Manager runs in:
  development, and production with its scripts on another origin. How is the spec's first thing
  to find out and the one most likely to change its size
  ([Clarification 1](#clarifications)).
- Nothing else is loosened: no `'wasm-unsafe-eval'`, no frame, no object.

### 6. Where it shows

Every place an image good previews today: the good's page, a library reference, the public page,
and a repository file. Each is named in the PR with what was seen there.

### 7. Not HLS

A playlist's segments are files beside it, and a good has no "beside". The brief's ruling 11:
"Context Manager serving one" is planned for later, in
[its seed](../../../unassigned/seeds/streams-from-beyond-the-folder.md). The video row does not
open `.m3u8` in Context Manager.

### 8. Tests and walks

- Context Manager's own unit tests for the table, the route (ranges, the guard's headers, who
  may read) and the fallback markup.
- The walks at the new pin, with new steps: a sound plays and seeks; a film plays and seeks; a
  PDF draws, scrolls to its last page, and a line of it is selected; a PDF with a password asks;
  no policy report in the console for any of them.
- The walks, `e2e:reset` and any scratch push wait for Jamie's word, as before.

## Clarifications

For Jamie, with the agent's lean:

1. **The worker when scripts come from another origin.** If production serves its scripts from
   `ASSET_BASE_URL`, the PDF preview's worker cannot start from there. The ways: Context Manager
   serves the worker file (and only it) from its own origin; or the PDF preview is given a way
   to start its worker from an address the host names. Lean: find out first whether production
   sets `ASSET_BASE_URL` today; if it does, Context Manager serves the worker from its own
   origin, and surfaces changes nothing.
2. **The bound on a file's size.** Ruling 6 allows one. Lean: one number for all three, read
   from Context Manager's existing limits on a good once they are read, and a sentence in place
   of the preview for a file over it.
3. **How such goods get in.** Whether a person can add an audio file, a video or a PDF as a good
   today (an upload, an import from a repository, an agent's write) was not read. If no way
   exists, the adoption has nothing to show outside a repository's files, and a way in is its
   own piece of work. Lean: read it as the spec's first step, and bring the answer back before
   building.
4. **One PR or several.** The route with ranges is server work that stands alone; the table, the
   fallback and the policy go together. Lean: two PRs in Context Manager, the route first.
5. **The root-entries seed.** The drain of phase 2 named
   [the five older formats' root entries](../../../unassigned/seeds/root-entries-register-nothing.md)
   as a candidate step for this phase. Lean: not in this phase unless the adoption touches those
   imports anyway.

## Non-goals

- An editor for any of the three, or any write of a media file.
- HLS, MPEG-DASH, or a stream from another server.
- A media manager, thumbnails, durations in a list, or a search of a PDF's text.
- Signing a PDF.

## Acceptance / completion checklist

- [ ] Clarifications 1 to 3 are answered from Context Manager's code and settings, and ruled.
- [ ] An audio good and a video good play and seek, with the network panel showing ranges and
      no whole-file answer for a seek.
- [ ] A PDF good draws in development mode and in a production build with scripts on another
      origin, if production has them there.
- [ ] No policy report in the console on any page that shows one of the three.
- [ ] A file over the bound says so in words.
- [ ] With scripts turned off or a preview that fails to load, each kind leaves its fallback.
- [ ] Context Manager's checks pass, and the walks pass at the new pin.

### Work package

- **Owns:** Context Manager's table, its bytes route, its preview body, its policy, its pin.
- **Must not change:** surfaces, unless Clarification 1 is ruled that way.
- **Runs after:** `stage6-phase4-complete`.
- **Needs Jamie's word for:** the walks, `e2e:reset`, any scratch push.
