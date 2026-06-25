import '../src/index';

import type { ProseMirrorEditor } from '../src/index';

const editor = document.getElementById('editor') as ProseMirrorEditor;

const sample = `# md-editor

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

// The editor lazy-loads ProseMirror after connect; set content once it's ready.
window.setTimeout(() => {
  if (typeof editor?.setContent === 'function') {
    editor.setContent(sample);
  }
}, 300);
