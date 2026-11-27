# @stillpointlab/audio-format

A format given a URL, not text: a read-only `<audio-preview>` (`./preview`) that plays the audio
file a host hands it with the browser's own controls, and its descriptor (`./format`). No editor
and no core. Created from `tooling/template/url-format`.

```ts
import '@stillpointlab/audio-format/preview';

const preview = document.createElement('audio-preview');
preview.setSource('/files/talk.mp3', 'talk.mp3');
```

## Entry points

- `.`: `AudioPreviewElement`, the element's type, and the logging setters. It registers no
  element.
- `./preview`: `<audio-preview>`, implementing `AudioPreviewElement`.
- `./format`: `audioFormat`, the descriptor a host registers (see
  `@stillpointlab/common-format/format`). It opens `.mp3`, `.wav`, `.flac`, `.ogg`, `.oga`,
  `.opus`, `.m4a`, `.aac` and `.weba`: every ending the
  [streaming spike](../../../docs/tasks/stage6/phase1/spikes/a-video-player-that-streams.md) heard
  play in both Chromium and Firefox (`.aiff` played in neither). It needs a URL the host gives
  it, not the file's text, and `apply` calls `setSource(url, <file name>)`. Importing it defines
  no element; its `load()` resolves to `./preview` itself.

`AudioPreviewElement` extends `UrlPreviewElement`, the contract in `common` every preview given a
URL answers to: `setSource(src, name)` and the ready signal. Nothing is added to it until a host
asks for something of audio's alone (a position in the track).

## The element

The file's name, and under it the browser's own `<audio controls preload="metadata">`, labelled
with the name for a screen reader. It never starts by itself: the person presses play.
`setSource(src, name)` sets the `src` and `name` attributes.

| State   | Shows                                                                     |
| ------- | ------------------------------------------------------------------------- |
| empty   | "No audio selected."                                                      |
| loading | the name and the player, under a loading cover, until the length is known |
| loaded  | the name and the player                                                   |
| failed  | the name, and one of two sentences in place of the player                 |

- **Two failures, two sentences.** A file that did not arrive (missing, refused, the connection
  lost): "Couldn't load this audio." A file that arrived and that the browser has no decoder for:
  "This browser can't play this audio." Either is reported once through `reportError`. Which it
  was is `mediaFailureOf` from `common`: the player's `MediaError` code when that says, and
  otherwise one request to the address, since a 404 and a file of noise give the same code in
  Chromium and Firefox.
- **Ready** is pending until the browser knows the file's length (`loadedmetadata`) or the load
  has failed, and settles at once when there is nothing to show. It never settles on a time.
- **A new source lets the old one go** (`releaseMedia` from `common`: paused, `src` taken away,
  then `load()`), so a file switched away from stops sounding and stops arriving. Only the
  player in the element is heard: what the one let go says late is about a source no longer
  shown. A new name relabels the player and loads nothing.
- **Leaving the page's tree pauses it.** The element keeps its player, so put back it is where it
  stopped, and it does not start again by itself. A move (out and back in one task) does not
  pause it, as a browser does not pause a moved media element.

## Tests

`src/**/*.test.ts` run in jsdom, which loads and plays no media: each test says when the length
is known or the load failed, and stands in for `pause()` and `load()`. `src/**/*.browser.test.ts`
run in headless Chromium (`vitest.browser.config.ts`): a clip loads and knows its length, plays
and its time moves, seeks; a file of noise says the second sentence and a missing one the first.

The harness (`npm run dev`) has one clip of each ending, so each can be heard by hand in any
browser, and a missing file, a file of noise and no source. The harness answers a missing file
404, as a host does.

Test media lives in `dev/media/`, each file under 50 kB, made in this package's folder by:

```sh
# dev/media/tone.mp3: 4 s of a 440 Hz tone, the clip the browser tests play and seek in
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=22050:duration=4 -ac 1 -c:a libmp3lame -b:a 32k dev/media/tone.mp3
# the harness's clips, 2 s of the same tone in each ending
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=8000:duration=2 -ac 1 -c:a pcm_s16le dev/media/tone.wav
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=8000:duration=2 -ac 1 -c:a flac dev/media/tone.flac
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=22050:duration=2 -ac 1 -c:a libvorbis -q:a 0 dev/media/tone.ogg
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=22050:duration=2 -ac 1 -c:a libvorbis -q:a 0 dev/media/tone.oga
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=48000:duration=2 -ac 1 -c:a libopus -b:a 16k dev/media/tone.opus
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=22050:duration=2 -ac 1 -c:a aac -b:a 32k dev/media/tone.m4a
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=22050:duration=2 -ac 1 -c:a aac -b:a 32k dev/media/tone.aac
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=48000:duration=2 -ac 1 -c:a libopus -b:a 16k -f webm dev/media/tone.weba
# dev/media/noise.mp3: half a second of noise as bare 8-bit samples, no header, under an audio ending
ffmpeg -f lavfi -i anoisesrc=duration=0.5:sample_rate=8000:seed=7 -ac 1 -f u8 -c:a pcm_u8 dev/media/noise.mp3
```

## Development

From the repository root, `npm run check` runs everything but the browser tests, and
`npm run test:browser -- --project @stillpointlab/audio-format` runs this package's. In this
package, `npm run dev` opens the harness on this format, `npm test` runs its jsdom tests and
`npm run test:browser` its browser tests.
