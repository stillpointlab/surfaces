import { formatPackage } from '../../../tooling/tsup';

// Three entry points:
//  - index: the browser editor (registers <code-editor>)
//  - preview: the read-only <code-preview> element (no basicSetup)
//  - diff: the read-only side-by-side <code-diff> element (@codemirror/merge)
// codemirror and @codemirror/* are dependencies (external), resolved by the consumer.
export default formatPackage({
  entry: {
    index: 'src/index.ts',
    preview: 'src/preview/index.ts',
    diff: 'src/diff/index.ts',
  },
  external: ['codemirror', /^@codemirror\//, /^@replit\//],
});
