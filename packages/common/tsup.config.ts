import { formatPackage } from '../../tooling/tsup';

// Five entries: the runtime (logging, contracts, the ready gate); `yaml` and
// `frontmatter`, DOM-free text helpers the formats and app cores share;
// `testing` (the element conformance suites); and `testing/app` (the app core
// suite). Both suites import vitest and so stay out of the runtime bundles. The
// SCSS tokens ship as source (see package.json "files") for formats to `@use`.
export default formatPackage({
  entry: {
    index: 'src/index.ts',
    yaml: 'src/yaml.ts',
    frontmatter: 'src/frontmatter.ts',
    testing: 'src/testing/index.ts',
    'testing/app': 'src/testing/app.ts',
  },
});
