# @stillpointlab/audio-format

A format given a URL, not text: a read-only `<audio-preview>` (`./preview`) of the media a
host hands it, and its descriptor (`./format`). No editor and no core. Created from
`tooling/template/url-format`; the audio shows what it is given as an image.

```ts
import '@stillpointlab/audio-format/preview';

const preview = document.createElement('audio-preview');
preview.setSource('/files/clip.audio', 'clip.audio');
```

## Entry points

- `.`: `AudioPreviewElement`, the element's type, and the logging setters. It registers no
  element.
- `./preview`: `<audio-preview>`, implementing `AudioPreviewElement`.
- `./format`: `audioFormat`, the descriptor a host registers (see
  `@stillpointlab/common-format/format`). It opens `.audio`, needs a URL the host gives it,
  not the file's text, and `apply` calls `setSource(url, <file name>)`. Importing it defines no
  element; its `load()` resolves to `./preview` itself.

`AudioPreviewElement` extends `UrlPreviewElement`, the contract in `common` every preview given a
URL answers to: `setSource(src, name)` and the ready signal. Add to it what is this format's alone
(a video's position, a PDF's page) once a host asks for it.

## The element

`setSource(src, name)` sets the `src` and `name` attributes. The element has four states, each
with its own view: empty (no source, in words), loading (the media under a loading cover),
loaded, and failed (in words, reported once through `reportError`). Ready is pending while the
source loads and settles once it has loaded or failed, or when there is nothing to show. A new
source makes new media, and only the media in the element is heard; a new name relabels it, and a
reconnect keeps it.

To make it a real format, put the format's own media element where the `<img>` is, listen to that
element's events, and change the hooks in `src/contract.test.ts` to match.

## Tests

`src/**/*.test.ts` run in jsdom, which loads no media: each test says when the `<img>` loaded or
failed. `src/**/*.browser.test.ts` run in headless Chromium (`vitest.browser.config.ts`); the
audio's loads a file of this package and fails a missing one, with nothing dispatched by hand. A
real format tests there only what needs a real browser: that its clip plays, that its page draws.

Test media lives in `dev/media/`, each file under 50 kB and made by a command:

```sh
# dev/media/swatch.png: a 64×36 blue frame
ffmpeg -f lavfi -i color=c=0x4f8cff:s=64x36 -frames:v 1 dev/media/swatch.png
```

## Development

From the repository root, `npm run check` runs everything but the browser tests, and
`npm run test:browser -- --project @stillpointlab/audio-format` runs this package's. In this
package, `npm run dev` opens the harness on this format, `npm test` runs its jsdom tests and
`npm run test:browser` its browser tests.
