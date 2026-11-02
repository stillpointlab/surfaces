// This format in the surfaces harness (`npm run dev`). The default preview
// renderer is the package's own unsanitized markdown-it: fine here, never in a host.
import '../src/editor';
import '../src/preview';

import type { HarnessFormat } from '../../../../tooling/harness/types';

const playground = `---
column: briefed
title: "Playground doc"
---

# md-editor

This is a standalone **markdown editor** web component.

- bullet one
- bullet two

\`\`\`ts
const x = 1;
\`\`\`

| Feature | Status |
| --- | --- |
| Tables | yes |
| Lists | yes |
`;

const headings = `# One

## Two

### Three

1. first
2. second
   - nested
   - nested again

> A quote with *emphasis* and \`code\`.
`;

export default {
  elements: { editor: 'md-editor', preview: 'md-preview' },
  fixtures: {
    'Playground doc': playground,
    'Headings, lists, quote': headings,
    'Frontmatter only': '---\ntitle: Nothing else\n---\n',
    Empty: '',
  },
  controls: [
    {
      kind: 'toggle',
      label: 'Frontmatter panel in preview',
      initial: true,
      apply: ({ preview }, on) => {
        if (on) preview?.setAttribute('frontmatter', 'panel');
        else preview?.removeAttribute('frontmatter');
      },
    },
  ],
} satisfies HarnessFormat;
