import { formatPackage } from '../../../tooling/tsup';

// Three entry points: the core (`.`), the read-only <sample-preview> (`./preview`)
// and the interactive <sample-editor> (`./editor`).
export default formatPackage({
  entry: {
    index: 'src/index.ts',
    preview: 'src/preview/index.ts',
    editor: 'src/editor/index.ts',
  },
});
