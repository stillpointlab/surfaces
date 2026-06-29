import '../src/index';
import '../src/preview';

import type { CodeEditor } from '../src/index';
import type { CodePreview } from '../src/preview';

const editor = document.getElementById('editor') as CodeEditor;
const preview = document.getElementById('preview') as CodePreview;

const sample = `def greet(name: str) -> str:
    """Return a friendly greeting."""
    return f"Hello, {name}!"


for i in range(3):
    print(greet(f"world {i}"))
`;

// The editor lazy-loads CodeMirror after connect; set content once it's ready.
window.setTimeout(() => {
  if (typeof editor?.setContent === 'function') {
    editor.setContent(sample);
  }
}, 300);

// Mirror editor content into the read-only preview.
preview?.setContent(sample);
editor?.addEventListener('content-change', (e) => {
  preview?.setContent((e as CustomEvent<{ content: string }>).detail.content);
});
