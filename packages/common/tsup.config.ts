import { formatPackage } from '../../tooling/tsup';

// Eleven entries: the runtime (logging, contracts, the ready gate); `elements`,
// `defineElement` alone for a component on every page of a host; `app`, the app
// contract (results, the lifecycle and element halves) for apps and host pages;
// `format`, the format descriptor and its registry, DOM-free, for hosts and the
// formats' own `./format` entries; `pointer-drag`, the pointer-events drag helper
// app elements and hosts share; `html`, the escaping template every element builds
// its markup with; `yaml` and `frontmatter`, DOM-free text helpers the formats and
// app cores share; `host`, the host contract's types (the storage port, the
// server's events), for a host's server and its page alike; `testing` (the element
// conformance suites); and `testing/app` (the app core suite). Both suites import
// vitest and so stay out of the runtime bundles. The SCSS tokens ship as source
// (see package.json "files") for formats to `@use`.
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
    format: 'src/format.ts',
    'pointer-drag': 'src/pointer-drag.ts',
    html: 'src/html.ts',
    yaml: 'src/yaml.ts',
    frontmatter: 'src/frontmatter.ts',
    host: 'src/host/index.ts',
    testing: 'src/testing/index.ts',
    'testing/app': 'src/testing/app.ts',
  },
});
