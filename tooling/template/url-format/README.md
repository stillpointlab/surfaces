# @stillpointlab/sample-url-format

A format given a URL, not text: a read-only `<sample-url-preview>` (`./preview`) of the media a
host hands it, and its descriptor (`./format`). No editor and no core. Created from
`tooling/template/url-format`; the sample shows what it is given as an image.

```ts
import '@stillpointlab/sample-url-format/preview';

const preview = document.createElement('sample-url-preview');
preview.setSource('/files/clip.sample-url', 'clip.sample-url');
```

## Entry points

- `.`: `SamplePreviewElement`, the element's type, and the logging setters. It registers no
  element.
- `./preview`: `<sample-url-preview>`, implementing `SamplePreviewElement`.
- `./format`: `sampleFormat`, the descriptor a host registers (see
  `@stillpointlab/common-format/format`). It opens `.sample-url`, needs a URL the host gives it,
  not the file's text, and `apply` calls `setSource(url, <file name>)`. Importing it defines no
  element; its `load()` resolves to `./preview` itself.

`SamplePreviewElement` extends `UrlPreviewElement`, the contract in `common` every preview given a
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

## Development

From the repository root, `npm run check` runs everything. In this package, `npm run dev` opens the
harness on this format, and `npm test` runs this package's tests.
