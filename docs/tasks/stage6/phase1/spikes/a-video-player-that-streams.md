---
column: done
pr: 177
completed: 2026-11-25
created: 2026-11-25T15:10:00-07:00
tags: [formats, feature, host-contract]
---

> Tech-spike working notes: capture the question, what you find, and where it points — enough that a
> brief can be distilled from it later. Keep it honest about uncertainty; link sources. The
> `column:` frontmatter above drives this file's card on the task board (absent for pooled spikes).

# Spike: a video player that streams

## Question

Jamie, 2026-11-25, on the [media previews brief](../briefs/media_previews.md): "I do want our own
basic video player with streaming capability", with "support for hls using hls.js or something
similar. Also other streaming formats." So:

1. Which library plays HLS, and which plays the other streaming formats?
2. What do the two hosts have to change for a stream to play at all?
3. Which file endings do browsers play today (his answer to the brief's question 5: "all common
   formats the browsers support (does that include wav and mp3?)")?

## Findings

Everything below was run on 2026-11-25 in Playwright's Chromium 158 and Firefox 159, against a
scratch server that sends the local host's page policy word for word and serves files the way
`/api/raw` does. Safari was not run: no build of it here plays what Safari plays. The rig is not
committed; the commands that made the test media are under [References](#references).

### The libraries

| Library            | Version | License      | Plays             | Minified, gzipped                           |
| ------------------ | ------- | ------------ | ----------------- | ------------------------------------------- |
| hls.js             | 1.7.4   | Apache-2.0   | HLS               | 185 kB; its light build 118 kB              |
| Shaka Player       | 5.3.6   | Apache-2.0   | HLS and MPEG-DASH | 298 kB; HLS alone 224 kB, DASH alone 214 kB |
| dash.js (`dashjs`) | 5.3.0   | BSD-3-Clause | MPEG-DASH         | 258 kB                                      |

- All three played their streams in both browsers, with a seek, once the policy allowed it
  (below). hls.js and Shaka played both an fMP4 stream (VP9 and Opus) and an MPEG-TS one (H.264
  and AAC).
- hls.js's worker is a file of its own (41 kB gzipped). The module build uses a worker only when
  given `workerPath`; the classic build tries a `blob:` worker, is refused by the policy, and
  carries on without one.
- MPEG-DASH is the one other streaming format in wide use. Nothing else was looked at.
- The npm package for dash.js is `dashjs`. `dash.js` is another project's package; the agent
  installed it by mistake first, found nothing of it had run, and removed it.

### What the browser does alone

- **Chromium 158 plays HLS with no library:** `<video src="…/index.m3u8">` played both streams
  and sought, under the policy as it is today.
- **Firefox 159 does not.** Safari is known to; not run here.
- **No browser plays MPEG-DASH alone.**

### What the hosts have to change

Each row is a case that failed and the change that made it play.

| What failed                                                                          | Why                                                                                                                       | What made it play                                               |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Every library, in Chromium, under today's policy                                     | A library feeds the `<video>` through a `blob:` URL of its own making, and `media-src 'self'` refuses it                  | `media-src 'self' blob:`                                        |
| Every stream opened through `/api/raw?path=…`, in every player and in Chromium's own | A playlist names its segments by relative address. With the path in the query, `seg000.m4s` resolves to `/api/seg000.m4s` | A raw address with the file's path in the address's path        |
| A playlist with its segments in one file (byte ranges), without range requests       | hls.js was sent the whole file for each segment: it played, with a length of 36 s for a 12 s stream                       | Range requests                                                  |
| A seek to 50 s in a 60 s, 14 MB WebM arriving at 300 kB/s, without range requests    | The browser has to wait for the download to reach that point: no seek in 30 s                                             | Range requests: the seek took 3 s                               |
| A stream on another origin                                                           | `connect-src 'self'` stops a library's fetch, and `media-src 'self'` stops the browser's own                              | Not tried: it is a ruling, not a fix (the first question below) |

- Firefox played under today's policy: it does not hold a `blob:` media source to `media-src`.
- The content type did not matter in either browser. Every file played the same sent as
  `application/octet-stream` with `nosniff` as it did with its own type. Safari is stricter by
  repute, so the types are worth sending.
- The relative address fault is the one the
  [markdown relative links](../../../unassigned/seeds/markdown-relative-links.md) seed describes,
  from another side.
- The agent's own try at mending the addresses inside hls.js (its `xhrSetup`) failed, and was
  not chased.

### Which endings play

One short file of each, as `<audio>` or `<video>`:

| Plays in both                                                                                       | In one                  | In neither                                                 |
| --------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------- |
| Audio: `.mp3`, `.wav`, `.flac`, `.ogg` (Vorbis and Opus), `.opus`, `.m4a`, `.aac`, `.weba`          |                         | `.aiff`                                                    |
| Video: `.mp4` and `.m4v` (H.264, AV1, VP9), `.webm` (VP8, VP9, AV1), `.mov` (H.264), `.mkv` (H.264) | `.3gp` (Chromium alone) | `.mpg`, `.ts`; `.ogv` plays its sound and shows no picture |

So yes: WAV and MP3 play everywhere tried. Theora is gone from both browsers, which is why an
`.ogv` has sound and no picture. HEVC was not tried (no encoder here).

## Recommendation

### The player

- **One element of our own in the video package,** with a small set of controls drawn by us:
  play, a seek bar, the time, sound, full screen, and a choice of quality when a stream offers
  one. The audio package's element shares the controls. Whether they are a helper in `common` or
  a package under `components/` is the spec's to settle.
- **A plain file plays through `<video>` itself.** No library loads for an `.mp4`.
- **A stream loads its engine on demand,** behind one small interface in the video package
  (attach to a `<video>`, report the levels, let go). `createLazyLoader` in `common` is the way.
- **hls.js for HLS.** It is the one Jamie named, the smallest for the job, and it is used
  everywhere MSE exists, Chromium included, so the player behaves the same in each browser. A
  browser without MSE falls back to its own HLS.
- **MPEG-DASH as the second engine,** in the same stage, as its own step. Shaka's DASH build or
  dash.js: the step's spec chooses, and both played here. Using Shaka for both formats is the
  other way to go: one library to follow, at 224 kB for HLS where hls.js is 118 to 185 kB.
- **The endings:** audio opens the nine above; video opens `.mp4`, `.m4v`, `.webm`, `.mov`,
  `.mkv`, and the playlists `.m3u8` and `.mpd`. `.ogv` leaves the video format's list. `.ogg`
  stays audio.

### The groundwork it adds to phase 2

- **A raw address with the path in its path,** which the local host's client hands to a format
  that `needs: 'url'`. The descriptor's contract says so in words: a file's `url` resolves a
  relative address to the file's neighbours.
- **`media-src 'self' blob:`** in the local host's page policy. It lets the page play media it
  built itself, and reaches no other origin. This loosens the policy the brief said would hold,
  so it is Jamie's to allow.
- **Range requests** on the raw route (already in the brief).
- **The types for the new endings,** playlists and segments included.
- **A format package that ships a worker file.** hls.js wants one and so does pdf.js, so the
  build's answer is written once, in the groundwork.

Context Manager's part mirrors it: the same policy word, range requests, and an address by path
for a file that has neighbours, which there means a file in a repository. A good that stands
alone has no neighbours, so a playlist as a lone good cannot play.

### For Jamie

1. **Where do streams come from?** This decides how much of "streaming" the stage holds:
   - **a playlist in the folder, its segments beside it.** This is what the recommendation
     builds, and all a file host can offer alone;
   - **a playlist that points at another server** (a CDN, a camera on the network). Needs both
     hosts' policies opened to that origin. Lean: not in this stage; a seed;
   - **the host cutting a large stored video into a stream.** Server work in Context Manager,
     and large. Lean: not in this stage; ranges cover a large file for now;
   - **live** (the webcam and GoPro work). The same player, given a source. Lean: a later stage,
     and the engine interface is shaped so it needs no new player.
2. **`media-src 'self' blob:`** in both hosts: allowed?
3. **Our own controls.** The agent reads "our own basic video player" as controls drawn by us and
   not the browser's. If the browser's controls on our element would do for a first pass, the
   video step is a good deal smaller.

## Rulings

Jamie, 2026-11-25, the day this was written:

- **The video recommendation stands, and MPEG-DASH waits.** hls.js is the library, loaded only
  when an `.m3u8` is opened. MPEG-DASH is [a seed](../../../unassigned/seeds/mpeg-dash-streams.md).
- **Streams come from the folder for now,** with a server's and Context Manager's planned for
  later: [a seed](../../../unassigned/seeds/streams-from-beyond-the-folder.md).
- **`media-src 'self' blob:` is allowed.** Context Manager needs it too: its policy names no
  `media-src`, so media falls to `default-src 'self'`.
- **The browser's controls for now,** if hls.js works with them. It does: every case above ran
  with `controls` set on the element. Players of our own for video and audio are
  [a seed](../../../unassigned/seeds/players-of-our-own.md).

## References

- The brief: [media previews](../briefs/media_previews.md).
- The local host's policy and raw route: `packages/hosts/local/src/server/page.ts` and
  `host.ts`.
- [hls.js](https://github.com/video-dev/hls.js), [Shaka Player](https://github.com/shaka-project/shaka-player),
  [dash.js](https://github.com/Dash-Industry-Forum/dash.js).
- The test media, each from the same twelve seconds of a test picture and a tone:

  ```sh
  SRC="-f lavfi -i testsrc2=size=640x360:rate=25 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 12"
  # HLS, MPEG-TS
  ffmpeg $SRC -c:v libopenh264 -c:a aac -f hls -hls_time 2 -hls_playlist_type vod index.m3u8
  # HLS, fMP4; add -hls_flags single_file for the byte ranges
  ffmpeg $SRC -c:v libvpx-vp9 -c:a libopus -strict -2 -f hls -hls_time 2 -hls_playlist_type vod \
    -hls_segment_type fmp4 index.m3u8
  # MPEG-DASH
  ffmpeg $SRC -c:v libvpx-vp9 -c:a libopus -f dash -seg_duration 2 index.mpd
  ```
