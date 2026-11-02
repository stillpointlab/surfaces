import { formatPackage } from '../../tooling/tsup';

// Two entries: the runtime (logging, contracts, the ready gate) and `testing`
// (the contract conformance suites, which import vitest and so stay out of the
// runtime bundle). The SCSS tokens ship as source (see package.json "files") for
// formats to `@use`.
export default formatPackage({
  entry: { index: 'src/index.ts', testing: 'src/testing/index.ts' },
});
