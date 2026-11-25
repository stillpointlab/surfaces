---
column: todo
created: 2026-11-25T18:00:00-07:00
tags: [local-host, host-contract, code]
---

# Spec: the raw route serves media

_From the [streaming spike](../../phase1/spikes/a-video-player-that-streams.md) and the
[media previews brief](../../phase1/briefs/media_previews.md), phase 2. One PR here._

## High-level goal

The local host's raw route serves a file the way a media element and a streaming library ask
for it: by an address whose neighbours resolve, in ranges, with its type, under a page policy
that lets a library feed a `<video>`.

## Related context

- Main files: `packages/hosts/local/src/server/host.ts` (the route table, `raw`, `TYPES`,
  `RUN_DESTINATIONS`), `page.ts` (`PAGE_POLICY`), `src/client/index.html` (the same policy in a
  `<meta>`), `src/client/host-client.ts` (`urlFor`, `probe`), the README's routes, and
  `packages/common/src/format.ts` (`FormatFile.url`).
- Each requirement below is a case that failed in the spike and the change that made it play.
- Jamie, 2026-11-25: `media-src 'self' blob:` is allowed.
- [A token for the run](../../phase1/specs/a-token-for-the-run.md) puts the token in a cookie, so
  nothing here carries it.

## Technical requirement

### 1. An address by path

- `GET /api/raw/<path>`, each segment of the path percent-encoded. `/api/raw?path=` goes: the
  page is its only caller.
- `urlFor(path)` gives that address, with `?rev=` as today, and `probe` asks it.
- What is refused is what is refused today, by the same checks on the real path: outside the
  root, through a link that leads out, into git's folder, not a file.
- `FormatFile.url`'s comment in `common` gains the promise: an address relative to the file
  resolves, against this URL, to the file's neighbour, where the host can serve one. No type
  changes.

### 2. Ranges

- Every answer carries `Accept-Ranges: bytes`.
- One range (`bytes=a-b`, `bytes=a-`, `bytes=-n`) answers `206` with `Content-Range` and that
  part of the file.
- A range past the file's end answers `416` with `Content-Range: bytes */<size>`.
- More than one range in a request, or a header that does not parse, is answered with the whole
  file, as if no range were asked.
- The file is opened as today (non-blocking, a regular file) and only the part asked for is
  read.

### 3. Types

`TYPES` gains `.m3u8` (`application/vnd.apple.mpegurl`), `.m4s` (`video/iso.segment`), `.flac`,
`.m4a`, `.aac`, `.opus`, `.m4v`, `.mov` and `.mkv`. `.ts` stays text: here it is TypeScript first,
and hls.js reads a segment as bytes whatever its type.

### 4. The policy

`media-src 'self' blob:` in `PAGE_POLICY` and in the page's `<meta>`. Nothing else in the policy
changes.

### 5. What is run stays refused

`RUN_DESTINATIONS` is as it is. A request for a file as `video`, `audio`, `track`, `image` or by
`fetch` is served; one as a script, a worker or a style is refused.

## Non-goals

- `HEAD` on the raw route, `If-Range`, entity tags, or several ranges in one answer.
- A stream on another origin (the seed
  [streams from beyond the folder](../../../unassigned/seeds/streams-from-beyond-the-folder.md)).
- Markdown's relative links and images. This gives them an address to resolve against; the
  rewrite is the seed
  [relative links in a markdown file](../../../unassigned/seeds/markdown-relative-links.md).
- Context Manager's routes: its adoption, in phase 5.

## Acceptance / completion checklist

- [ ] Tests: the address by path for a nested file, and for names with a space, `#`, `?` and
      `%`; each refusal that exists today, by the new address.
- [ ] Tests: each range form, the `416`, several ranges answered whole, and a range of a file
      larger than one read.
- [ ] Tests: the type of each new ending; the policy string and the `<meta>` say the same.
- [ ] No caller of `/api/raw?path=` is left in the package or its README.
- [ ] By hand, on the built server in Chromium, with the spike's media in a scratch folder: an
      image still shows; `curl -r 0-99` answers 206 with 100 bytes; a page that sets a `<video>`
      on a 60 s WebM through `urlFor`'s address seeks to its last ten seconds in under two
      seconds.
- [ ] `npm run check` passes.

## Implementation plan

1. The route by path and `urlFor`, with every test of the old address moved to the new.
2. Ranges.
3. Types and the policy.
4. README, and the comment in `common`.

### Work package

- **Owns:** `packages/hosts/local/`, and the one comment in `packages/common/src/format.ts`.
- **Must not change:** the storage port, the journal, the apps.
- **Runs beside:** [the scaffold](scaffold-registrable-formats.md). After
  [a token for the run](../../phase1/specs/a-token-for-the-run.md), which changes the same file.
