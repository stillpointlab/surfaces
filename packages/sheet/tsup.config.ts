import { formatPackage } from '../../tooling/tsup';

export default formatPackage({
  entry: {
    index: 'src/index.ts',
    csv: 'src/csv/index.ts',
    grid: 'src/grid/index.ts',
    preview: 'src/preview/index.ts',
    presentation: 'src/presentation/index.ts',
    document: 'src/document/index.ts',
    editor: 'src/editor/index.ts',
    interaction: 'src/interaction/index.ts',
  },
});
