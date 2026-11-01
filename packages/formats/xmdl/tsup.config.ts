import { formatPackage } from '../../../tooling/tsup';

export default formatPackage({
  entry: {
    index: 'src/index.ts',
    editor: 'src/editor/index.ts',
    parser: 'src/parser/index.ts',
    preview: 'src/preview/index.ts',
  },
});
