import { formatPackage } from '../../../tooling/tsup';

// Three entry points:
//  - index: the browser editor (registers <md-editor>)
//  - markdown: isomorphic markdown rendering (Node + browser)
//  - preview: the read-only <md-preview> element (markdown only, no ProseMirror)
// prosemirror-* and markdown-it are dependencies (external), resolved by the consumer.
export default formatPackage({
  entry: {
    index: 'src/index.ts',
    markdown: 'src/markdown/index.ts',
    preview: 'src/preview/index.ts',
  },
});
