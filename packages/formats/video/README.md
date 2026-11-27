# @stillpointlab/video-format

A format given a URL, not text: a read-only `<video-preview>` (`./preview`) that plays the video
file or HLS stream a host hands it with the browser's own controls, and its descriptor
(`./format`). No editor and no core. Created from `tooling/template/url-format`.

```ts
import '@stillpointlab/video-format/preview';

const preview = document.createElement('video-preview');
preview.setSource('/files/talk.mp4', 'talk.mp4');
```

## Entry points

- `.`: `VideoPreviewElement`, the element's type, and the logging setters. It registers no
  element.
- `./preview`: `<video-preview>`, implementing `VideoPreviewElement`.
- `./format`: `videoFormat`, the descriptor a host registers (see
  `@stillpointlab/common-format/format`). It opens `.mp4`, `.m4v`, `.webm`, `.mov` and `.mkv`:
  every ending the
  [streaming spike](../../../docs/tasks/stage6/phase1/spikes/a-video-player-that-streams.md) saw
  play in both Chromium and Firefox. It does not open `.ogv`: both browsers have dropped Theora
  and play such a file's sound alone. It opens `.m3u8`, an HLS playlist, and not its segments.
  It needs a URL the host gives it, not the file's text (a playlist too, though it is text), and
  `apply` calls `setSource(url, <file name>)`. Importing it defines no element; its `load()`
  resolves to `./preview` itself.

`VideoPreviewElement` extends `UrlPreviewElement`, the contract in `common` every preview given a
URL answers to: `setSource(src, name)` and the ready signal. Nothing is added to it until a host
asks for something of video's alone (a position in the video).

## The element

The browser's own `<video controls preload="metadata" playsinline>`, as large as the element
allows with the picture's own proportions kept, on a dark ground, and labelled with the file's
name for a screen reader. It never starts by itself: the person presses play.
`setSource(src, name)` sets the `src` and `name` attributes.

| State   | Shows                                                            |
| ------- | ---------------------------------------------------------------- |
| empty   | "No video selected."                                             |
| loading | the player, under a loading cover, until the length is known     |
| loaded  | the player, and above it a note when its picture cannot be shown |
| failed  | one of two sentences in place of the player                      |

- **Two failures, two sentences.** A file that did not arrive (missing, refused, the connection
  lost): "Couldn't load this video." A file that arrived and that the browser has no decoder for:
  "This browser can't play this video." Either is reported once through `reportError`. Which it
  was is `mediaFailureOf` from `common`: the player's `MediaError` code when that says, and
  otherwise one request to the address, since a 404 and a file of noise give the same code in
  Chromium and Firefox.
- **A picture the browser cannot show.** A file can hold a sound track the browser plays and a
  picture it has no decoder for (Theora, MPEG-4 Part 2, Motion JPEG, ProRes or FFV1 in Chromium
  158 and Firefox 159; H.265 is the likely case on other machines, and was not tried). The
  browser then reports no failure and a picture of no size. Once the length is known and the
  picture's width is 0, the element says "This browser can't show this video's picture. Its
  sound plays." above the player, which stays. A picture that arrives later (`resize`) takes the
  note away.
- **Ready** is pending until the browser knows the file's length (`loadedmetadata`) or the load
  has failed, and settles at once when there is nothing to show. It never settles on a time.
  A stream is ready the same way.
- **A new source lets the old one go** (`releaseMedia` from `common`: paused, `src` taken away,
  then `load()`; a stream's engine is let go first), so a file switched away from stops playing
  and stops arriving. Only the player
  in the element is heard: what the one let go says late is about a source no longer shown. A
  new name relabels the player and loads nothing.
- **Leaving the page's tree pauses it.** The element keeps its player, so put back it is where it
  stopped, and it does not start again by itself. A move (out and back in one task) does not
  pause it, as a browser does not pause a moved media element.
- **The dark ground** is the host's text colour in a light colour scheme and its background in a
  dark one (`light-dark()` over the two tokens), so it follows the host's `color-scheme`.

## Streams

An address whose path ends in `.m3u8` (read from the path, so a query such as a host's `?rev=`
does not hide it) is an HLS playlist, and plays through [hls.js](https://github.com/video-dev/hls.js)
(Apache-2.0), with the same states, ready signal, note and sentences as a file.

- **Loaded for a playlist alone.** The element imports hls.js with `import()` (through
  `createLazyLoader`) the first time it is given a playlist. It is a dependency, so this
  package's build names it from a file of its own (`dist/chunks/hls-engine-*.js`) that only that
  `import()` reaches, and a host's bundler makes it a file of its own there: about 580 kB, 180 kB
  gzipped, in the local host. An `.mp4` never fetches it. `src/build.test.ts` builds the package
  and holds that no entry reaches it.
- **The full build, with no worker.** It is fetched only for a playlist, so the light build's
  saving buys nothing, and the light build leaves out alternate sound tracks. It runs on the
  page's own thread (`enableWorker: false`): a host's policy refuses the `blob:` worker it would
  otherwise try ("No worker is a way too" in the root README).
- **One engine behind a small interface** (`src/preview/stream.ts`, not exported): attach to a
  `<video>` with a playlist's address, let go, and say a failure it cannot recover from as one of
  the element's two. MPEG-DASH or a live source would stand behind the same interface.
- **Its failures.** With hls.js attached the `<video>`'s source is a `blob:` of its making, so
  the address cannot be asked (`mediaFailureOf`); hls.js says which. A playlist or segment that
  did not arrive (a network error, or an answer `4xx`, said at once rather than after hls.js's
  half a minute of asking again) is "Couldn't load this video." A stream that arrived and has
  nothing the browser decodes (a playlist that does not parse, segments no demuxer reads, codecs
  the browser lacks) is "This browser can't play this video." A fatal media error is first
  recovered once (`recoverMediaError()`), as hls.js's documentation gives; a second is the
  failure.
- **A browser with no Media Source Extensions** (Safari on an iPhone) is given the playlist's
  address as the `<video>`'s own `src`, and plays HLS itself; its failures are a file's. This
  path follows hls.js's documentation and has run in jsdom alone: no such browser is here.
  Chromium also plays HLS by itself now, but hls.js is used wherever it runs, so the player is
  the same in each browser.

What a stream needs of a host:

- **An address by path.** A playlist names its segments relative to itself, so the address the
  host gives must carry the file's path in its path (`/api/raw/films/talk/index.m3u8`), not in
  its query, and each segment beside it must be served at its own path.
- **Range requests,** for a playlist whose segments are byte ranges of one file
  (`#EXT-X-BYTERANGE`). Without them each segment is sent the whole file, and the stream plays
  long (the spike saw 36 s for a 12 s stream).
- **`blob:` for media** (`media-src 'self' blob:`): hls.js feeds the `<video>` through a
  `MediaSource` of its own making, and Chromium holds that address to `media-src`. hls.js fetches
  the playlist and segments itself, so `connect-src` must allow the host's own origin.
- Any type for a segment: hls.js reads its bytes whatever they are sent as. The local host sends
  a `.ts` segment as `text/plain` (`.ts` is TypeScript's too), and it plays.

## Tests

`src/**/*.test.ts` run in jsdom, which loads and plays no media: each test says when the length
is known, how wide the picture is, or that the load failed, and stands in for `pause()` and
`load()`. A stream's tests fake the engine: the choice by the address's ending, the engine never
loaded for a file, let go on a new source, and the failure it names. `src/build.test.ts` builds
the package and reads the files: hls.js is reached from no entry, only by the `import()` of the
engine's file. `src/**/*.browser.test.ts` run in headless Chromium (`vitest.browser.config.ts`):
a clip loads and knows its length and its picture's size, plays and its time moves, seeks; the
clip with no picture the browser can show says the note and plays; a file of noise says the
second sentence; an fMP4 stream, with its segments beside the playlist and as byte ranges of one
file, knows its length of 6 s, plays and seeks into its last segment; a playlist whose segments
are missing says the first sentence.

The harness (`npm run dev`) has one clip of each ending, so each can be seen and heard by hand in
any browser, and the clip with no picture, a missing file, a file of noise and no source; and the
four streams below. The harness answers a missing file 404, as a host does, so the missing file
and the stream whose segments are missing say the first sentence there too.

Test media lives in `dev/media/`, each file under 50 kB, made in this package's folder by:

```sh
# dev/media/clip.webm: 4 s of a 64×36 test picture and a 440 Hz tone, the clip the browser tests play and seek in
ffmpeg -f lavfi -i testsrc2=size=64x36:rate=10 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 4 -c:v libvpx-vp9 -b:v 40k -c:a libopus -b:a 16k -ac 1 dev/media/clip.webm
# the harness's clips, 2 s of the same in each ending
ffmpeg -f lavfi -i testsrc2=size=64x36:rate=10 -f lavfi -i sine=frequency=440:sample_rate=22050 -t 2 -c:v libopenh264 -c:a aac -b:a 32k -ac 1 dev/media/clip.mp4
ffmpeg -f lavfi -i testsrc2=size=64x36:rate=10 -f lavfi -i sine=frequency=440:sample_rate=22050 -t 2 -c:v libopenh264 -c:a aac -b:a 32k -ac 1 -f mp4 dev/media/clip.m4v
ffmpeg -f lavfi -i testsrc2=size=64x36:rate=10 -f lavfi -i sine=frequency=440:sample_rate=22050 -t 2 -c:v libopenh264 -c:a aac -b:a 32k -ac 1 dev/media/clip.mov
ffmpeg -f lavfi -i testsrc2=size=64x36:rate=10 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 2 -c:v libopenh264 -c:a libopus -b:a 16k -ac 1 dev/media/clip.mkv
# dev/media/no-picture.mkv: the same 2 s as Theora and Vorbis, a picture neither browser decodes and a sound both play
ffmpeg -f lavfi -i testsrc2=size=64x36:rate=10 -f lavfi -i sine=frequency=440:sample_rate=22050 -t 2 -c:v libtheora -q:v 1 -c:a libvorbis -q:a 0 -ac 1 dev/media/no-picture.mkv
# dev/media/noise.mp4: half a second of noise as bare 8-bit samples, no header, under a video ending
ffmpeg -f lavfi -i anoisesrc=duration=0.5:sample_rate=8000:seed=7 -ac 1 -f u8 -c:a pcm_u8 dev/media/noise.mp4
```

The streams, each in a folder of its own with its playlist `index.m3u8`: 6 s of the same picture
and tone, a key frame every 2 s, in three segments of 2 s.

```sh
# dev/media/hls-fmp4/: fMP4, VP9 and Opus, its segments index0.m4s to index2.m4s beside init.mp4
ffmpeg -f lavfi -i testsrc2=size=64x36:rate=10 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 6 -c:v libvpx-vp9 -b:v 40k -g 20 -c:a libopus -b:a 16k -ac 1 -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_type fmp4 dev/media/hls-fmp4/index.m3u8
# dev/media/hls-mpegts/: MPEG-TS, H.264 and AAC, its segments named .m2t (a .ts file in the package would be read as TypeScript by its tools, and Vite would compile it)
ffmpeg -f lavfi -i testsrc2=size=64x36:rate=10 -f lavfi -i sine=frequency=440:sample_rate=22050 -t 6 -c:v libopenh264 -g 20 -c:a aac -b:a 16k -ac 1 -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_filename dev/media/hls-mpegts/index%d.m2t dev/media/hls-mpegts/index.m3u8
# dev/media/hls-ranges/: the fMP4 stream, its segments byte ranges of one file, index.m4s
ffmpeg -f lavfi -i testsrc2=size=64x36:rate=10 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 6 -c:v libvpx-vp9 -b:v 40k -g 20 -c:a libopus -b:a 16k -ac 1 -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_type fmp4 -hls_flags single_file dev/media/hls-ranges/index.m3u8
# dev/media/hls-missing/: the MPEG-TS stream's playlist alone, its segments gone0.m2t to gone2.m2t removed
ffmpeg -f lavfi -i testsrc2=size=64x36:rate=10 -f lavfi -i sine=frequency=440:sample_rate=22050 -t 6 -c:v libopenh264 -g 20 -c:a aac -b:a 16k -ac 1 -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_filename dev/media/hls-missing/gone%d.m2t dev/media/hls-missing/index.m3u8 && rm dev/media/hls-missing/gone*.m2t
```

For a stream whose segments are `.ts` (the release walk's, which the local host sends as
`text/plain`), leave out `-hls_segment_filename` from the MPEG-TS line, and make it outside the
package.

## Development

From the repository root, `npm run check` runs everything but the browser tests, and
`npm run test:browser -- --project @stillpointlab/video-format` runs this package's. In this
package, `npm run dev` opens the harness on this format, `npm test` runs its jsdom tests and
`npm run test:browser` its browser tests.
