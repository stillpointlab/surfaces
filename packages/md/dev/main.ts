import '../src/index';
import '../src/preview';

import type { ProseMirrorEditor } from '../src/index';
import type { MdPreview } from '../src/preview';

const editor = document.getElementById('editor') as ProseMirrorEditor;
const preview = document.getElementById('preview') as MdPreview;

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

// Mirror editor content into the read-only preview (default renderer is the
// package's own unsanitized markdown-it — fine for the local playground).
preview?.setContent(sample);
editor?.addEventListener('content-change', (e) => {
  preview?.setContent((e as CustomEvent<{ content: string }>).detail.content);
});
