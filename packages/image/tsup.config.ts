import { formatPackage } from '../../tooling/tsup';

export default formatPackage({
  entry: {
    index: 'src/index.ts',
    preview: 'src/preview/index.ts',
  },
});
