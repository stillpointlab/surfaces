# @stillpointlab/sample-format

A format over one good: a core (`.`), a read-only `<sample-preview>` (`./preview`) and an
interactive `<sample-editor>` (`./editor`). Created from `tooling/template/format`.

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

## Development

From the repository root, `npm run check` runs everything. In this package, `npm run dev` opens the
playground on the port in the root README's table, and `npm test` runs this package's tests.
