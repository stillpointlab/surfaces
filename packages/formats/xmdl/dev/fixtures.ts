// This format in the surfaces harness (`npm run dev`).
import '../src/editor';
import '../src/preview';

import type { HarnessFormat } from '../../../../tooling/harness/types';

const brief = `---
title: Brief Template
version: 0.1.0
outputFileType: markdown
params:
  - name: title
    type: string
    required: true
---
# {{title}}
`;

const several = `---
title: Release Notes
version: 0.2.0
outputFileType: markdown
params:
  - name: product
    type: string
    required: true
  - name: version
    type: string
    required: true
  - name: highlights
    type: string
    required: false
---
# {{product}} {{version}}

{{highlights}}
`;

export default {
  elements: { editor: 'xmdl-editor', preview: 'xmdl-preview' },
  fixtures: {
    'Brief template': brief,
    'Several params': several,
    'Malformed frontmatter': '---\ntitle: [unclosed\n---\n# {{title}}\n',
    Empty: '',
  },
} satisfies HarnessFormat;
