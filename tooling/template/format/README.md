# @stillpointlab/sample-format

A format over one good: a core (`.`), a read-only `<sample-preview>` (`./preview`), an
interactive `<sample-editor>` (`./editor`) and its descriptor (`./format`). Created from
`tooling/template/format`.

```ts
import '@stillpointlab/sample-format/preview';
import { parseSample } from '@stillpointlab/sample-format';

const preview = document.createElement('sample-preview');
preview.setContent('hello');
```

## Entry points

- `.`: the core, `parseSample` and `serializeSample`.
- `./preview`: `<sample-preview>`, implementing `PreviewElement`.
- `./editor`: `<sample-editor>`, implementing `EditorElement`.
- `./format`: `sampleFormat`, the descriptor a host registers (see
  `@stillpointlab/common-format/format`). It opens `.sample` and needs the file's text. Importing
  it defines no element; its `load()` functions resolve to `./preview` and `./editor` themselves.

## Development

From the repository root, `npm run check` runs everything. In this package, `npm run dev` opens the
harness on this format, and `npm test` runs this package's tests.
