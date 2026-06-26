import '../src/index';

import type { CodeEditor } from '../src/index';

const editor = document.getElementById('editor') as CodeEditor;

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
