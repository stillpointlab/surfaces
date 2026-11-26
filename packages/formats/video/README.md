# @stillpointlab/video-format

A format given a URL, not text: a read-only `<video-preview>` (`./preview`) that plays the video
file a host hands it with the browser's own controls, and its descriptor (`./format`). No editor
and no core. Created from `tooling/template/url-format`.

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
  and play such a file's sound alone. It needs a URL the host gives it, not the file's text, and
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
- **A new source lets the old one go** (`releaseMedia` from `common`: paused, `src` taken away,
  then `load()`), so a file switched away from stops playing and stops arriving. Only the player
  in the element is heard: what the one let go says late is about a source no longer shown. A
  new name relabels the player and loads nothing.
- **Leaving the page's tree pauses it.** The element keeps its player, so put back it is where it
  stopped, and it does not start again by itself. A move (out and back in one task) does not
  pause it, as a browser does not pause a moved media element.
- **The dark ground** is the host's text colour in a light colour scheme and its background in a
  dark one (`light-dark()` over the two tokens), so it follows the host's `color-scheme`.

## Tests

`src/**/*.test.ts` run in jsdom, which loads and plays no media: each test says when the length
is known, how wide the picture is, or that the load failed, and stands in for `pause()` and
`load()`. `src/**/*.browser.test.ts` run in headless Chromium (`vitest.browser.config.ts`): a clip
loads and knows its length and its picture's size, plays and its time moves, seeks; the clip with
no picture the browser can show says the note and plays; a file of noise says the second
sentence.

The harness (`npm run dev`) has one clip of each ending, so each can be seen and heard by hand in
any browser, and the clip with no picture, a missing file, a file of noise and no source. Its
missing file is a revoked object URL: the harness's Vite answers a path it has no file for with
its own page.

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

## Development

From the repository root, `npm run check` runs everything but the browser tests, and
`npm run test:browser -- --project @stillpointlab/video-format` runs this package's. In this
package, `npm run dev` opens the harness on this format, `npm test` runs its jsdom tests and
`npm run test:browser` its browser tests.
