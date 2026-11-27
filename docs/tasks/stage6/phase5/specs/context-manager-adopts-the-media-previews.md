---
column: todo
created: 2026-11-27T15:30:00-07:00
tags: [context-manager, formats, feature, code]
---

# Spec: Context Manager adopts the audio, video and PDF previews

_From the [media previews brief](../../phase1/briefs/media_previews.md), phase 5: "Context
Manager adopts the three", as "one integration in Context Manager, at the end, with the walks at
that pin". A draft by the claude agent at phase 4's close, with Jamie's first rulings of
2026-11-27 written in ([Decided](#decided)) and what is still open under
[Clarifications](#clarifications). The work is in Context Manager's repository; this card is its
spec._

## High-level goal

A repository's file that is an audio file, a video file or a PDF previews in Context Manager
where a repository's image does today: it plays, it seeks, its pages draw and its text can be
selected. Goods that hold such bytes are not part of it: Context Manager has none yet
([Decided](#decided), 3).

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
- **A repository's image is fetched whole from GitHub** as a blob (`getFileBuffer`,
  `src/services/git/repoConnection.service.ts`) and sent from
  `/projects/:id/repos/:connection/image?path=`. The 2 MiB bound
  (`IMAGE_PREVIEW_CACHE_MAX_BYTES`) is on what is kept in the preview cache, not on what is
  served: a larger file is fetched again from GitHub for every request.
- **No way to make a good that holds bytes was found.** The read side of an image good is built
  (`getPreviewImage` and three routes); linking a repository file refuses one that is binary,
  and nothing uploads a good's bytes. Jamie: "CM digital goods don't support binary yet".
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

### 3. Bytes a player can seek in

- What serves a repository file's bytes answers a range (`Accept-Ranges`, `206`, `416`,
  `If-Range`) with a validator, which for a repository file is its blob's SHA. That is what the
  surfaces contract now says a host's URL owes a format given one
  ([Decided](#decided), 1).
- **The range is passed to GitHub:** "If we can do ranged from github that is ideal". It can.
  Tried by the claude agent on 2026-11-27 with one request each:
  - `raw.githubusercontent.com/<owner>/<repo>/<commit>/<path>`, with the token in an
    `Authorization` header, answers a range for a private repository's file: `206` with
    `Content-Range` and `Accept-Ranges: bytes`, an `ETag`, and `416` for a range past the end.
  - The API's blob and contents calls (`api.github.com`), which Context Manager uses today,
    ignore `Range` and send the whole file with `200`.
  - So a media file's bytes come from the raw host by commit and path, not from the blob call.
    Not tried: a file kept in Git LFS (the raw host gives its pointer, not its bytes), a file
    near the bound, GitHub's rate limits for that host, and a token of each kind Context
    Manager stores.
- A range must not cost a fetch of the whole file from GitHub each time.
- The answer carries the guard a stored file needs when a browser can open it directly
  (`sendImage`'s sandbox policy and `nosniff`), with whatever a media element or pdf.js's fetch
  needs and no more. The repository image route sends neither today.
- It reads by the same rule as the tree that shows it: the connection's owner.
- **A file over 50 MB is not previewed,** and a sentence says so in its place ("50MB bound is
  fine").

### 4. What is left when a preview cannot load

The server's `<img>` for a format given a URL is on a good's page, and waits with goods that
hold bytes: when they come, each of the three needs something true in its place (the browser's
own `<audio controls>` or `<video controls>`, a link for a PDF). In the repository tree the
client mounts the preview itself; what it shows when a preview's script cannot load is read
and, if it is nothing, given words.

### 5. The policy and the worker

- `media-src 'self' blob:` is added now, as the brief ruled (12) and Jamie confirmed for this
  spec ("let's add now"), though no stream uses `blob:` here yet.
- **The PDF worker is loaded from the page's own origin** in every mode Context Manager runs in:
  development, where the scripts come from Vite's server, and production with its scripts on
  another origin. Jamie: "let's add a WORKER_BASE_URL to CM config". A browser refuses a worker
  whose script is on another origin, and no CORS header changes that, so the setting names a
  place on the page's own origin where Context Manager serves worker files.
- **How the built page learns the worker's address** is the first thing tried: Vite's
  `renderBuiltUrl` for a worker's file, or the PDF preview being told its worker's address by
  its host. The second is a change in surfaces and comes back to Jamie first.
- The two fallback decoders the worker imports, and the files pdf.js fetches by name, stay with
  the other scripts. From a worker on the page's origin they are fetched across origins, so
  the asset host must answer them with CORS headers, as it must already for module scripts.
  Tried, not assumed.
- Nothing else is loosened: no `'wasm-unsafe-eval'`, no frame, no object.

### 6. Where it shows

Where a repository's image previews today: a file chosen in the repository tree. The places a
good previews (its page, a library reference, the public page) wait for goods that hold bytes.

### 7. Not HLS

The brief's ruling 11: "Context Manager serving one" is planned for later, in
[its seed](../../../unassigned/seeds/streams-from-beyond-the-folder.md). A repository does have
a "beside", so a playlist with its segments in the same folder could be served one day; it is
not in this spec. The video row does not open `.m3u8` in Context Manager.

### 8. Tests and walks

- Context Manager's own unit tests for the table, the route (ranges, the guard's headers, who
  may read) and the fallback markup.
- The walks at the new pin, with new steps: a sound plays and seeks; a film plays and seeks; a
  PDF draws, scrolls to its last page, and a line of it is selected; a PDF with a password asks;
  no policy report in the console for any of them.
- The walks, `e2e:reset` and any scratch push wait for Jamie's word, as before.

## Decided

Jamie, 2026-11-27:

1. **Ranges, and the surfaces contracts:** "we should extend the preview and edit interfaces for
   the range request", and, asked which interfaces: "I did mean the surfaces contracts, I'm
   curious why that wouldn't be impacted? Or do the existing interfaces already support it. Or
   do you just mean we need the servers to support the feature?" The answer given him: a preview
   is handed a URL and the browser's player (or pdf.js) asks it for ranges, so no method of the
   element's changes, and it is the servers that must answer. But the contract did not say so in
   words, which is how Context Manager's routes came to send whole files. The words are added
   with this spec: on `FormatFile.url` in `common`, and in the root README. An editor is given
   text today; an editor of bytes, its reads in ranges among them, is for the stage's spike on
   writing bytes.
2. **The worker:** "let's add a WORKER_BASE_URL to CM config". He asked whether the rule is
   beyond CORS and has no way round but the page's origin. It is: a worker's script must be on
   the page's origin, whatever headers it is served with. The one way round is a worker started
   from a `blob:` that imports the real script, which needs `worker-src blob:` in the policy and
   is what both hosts' policies refuse today; pdf.js tries exactly that and was seen refused in
   the [pdf.js spike](../../phase4/spikes/pdfjs-in-a-format-package.md).
3. **Goods that hold bytes are their own initiative:** "CM digital goods don't support binary
   yet - I don't think we even have image import, just image preview for repos. this would be a
   separate initiative, please add a spike to CM for it". The spike's card is
   [context-manager#1322](https://github.com/stillpointlab/context-manager/pull/1322). This
   spec is for repository files.
4. **Where a range's bytes come from, and the bound:** "If we can do ranged from github that is
   ideal, 50MB bound is fine".
5. **`blob:` for media:** "let's add now".

6. **The root-entries seed is not in this phase:** "root-entries feels like it can slip this
   phase, but I think I want it for stage if possible. Find a place for it to land". It is in
   the stage's close:
   [a format's root entry registers nothing](../../phase6/seeds/root-entries-register-nothing.md).
7. **Two PRs in Context Manager,** the ranges first, then the table, the policy and the worker's
   setting together: "yes, CM PRs sound fine".

## Clarifications

None open. The seven above were the draft's questions.

## Non-goals

- An editor for any of the three, or any write of a media file.
- HLS, MPEG-DASH, or a stream from another server.
- A media manager, thumbnails, durations in a list, or a search of a PDF's text.
- Signing a PDF.

## Acceptance / completion checklist

- [x] The Clarifications are ruled (2026-11-27).
- [ ] A repository's audio file and video file play and seek, with the network panel showing
      ranges, and GitHub not asked for the whole file on a seek.
- [ ] A repository's PDF draws in development mode and in a production build with its scripts on
      another origin and its worker at `WORKER_BASE_URL`.
- [ ] No policy report in the console on any page that shows one of the three.
- [ ] A file over the bound says so in words.
- [ ] A preview whose script fails to load leaves words in the tree's pane, not nothing.
- [ ] Context Manager's checks pass, and the walks pass at the new pin.

### Work package

- **Owns:** Context Manager's table, its repository bytes route, its policy, its worker setting,
  its pin.
- **Must not change:** surfaces, unless the worker's address turns out to need it, which comes
  back to Jamie first. (The contract's words on ranges are in surfaces already, with this spec.)
- **Runs after:** `stage6-phase4-complete`.
- **Needs Jamie's word for:** the walks, `e2e:reset`, any scratch push.
