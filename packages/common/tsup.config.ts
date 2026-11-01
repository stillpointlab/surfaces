import { formatPackage } from '../../tooling/tsup';

// One entry: logging and the element contracts. The SCSS tokens ship as source
// (see package.json "files") for formats to `@use`.
export default formatPackage({
  entry: { index: 'src/index.ts' },
});
