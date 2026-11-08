import { formatPackage } from '../../tooling/tsup';

// Nine entries: the runtime (logging, contracts, the ready gate); `elements`,
// `defineElement` alone for a component on every page of a host; `app`, the app
// contract (results, the lifecycle and element halves) for apps and host pages;
// `pointer-drag`, the pointer-events drag helper app elements and hosts share; `html`, the
// escaping template every element builds its markup with; `yaml` and
// `frontmatter`, DOM-free text helpers the formats and app cores share;
// `testing` (the element conformance suites); and `testing/app` (the app core
// suite). Both suites import vitest and so stay out of the runtime bundles. The
// SCSS tokens ship as source (see package.json "files") for formats to `@use`.
//
// Splitting is on so the entries share one instance of `log`: a host's reporter
// has to reach `defineElement`'s warning whichever entry an element came through.
// A bundler cannot divide one module between chunks, so `elements` is what keeps
// the rest of the runtime off pages that only need a component.
export default formatPackage({
  splitting: true,
  entry: {
    index: 'src/index.ts',
    elements: 'src/elements.ts',
    app: 'src/app.ts',
    'pointer-drag': 'src/pointer-drag.ts',
    html: 'src/html.ts',
    yaml: 'src/yaml.ts',
    frontmatter: 'src/frontmatter.ts',
    testing: 'src/testing/index.ts',
    'testing/app': 'src/testing/app.ts',
  },
});
