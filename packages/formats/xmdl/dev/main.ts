import '../src';
import '../src/preview';

import type { XmdlEditor } from '../src/editor/xmdl-editor';
import type { XmdlPreview } from '../src/preview/xmdl-preview';

const sample = `---
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

document.querySelector<XmdlEditor>('xmdl-editor')?.setContent(sample);
document.querySelector<XmdlPreview>('xmdl-preview')?.setContent(sample);
