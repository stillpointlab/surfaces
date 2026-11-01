import '../src/editor';
import '../src/preview';

import type { SampleEditor } from '../src/editor';
import type { SamplePreview } from '../src/preview';

const editor = document.getElementById('editor') as SampleEditor;
const preview = document.getElementById('preview') as SamplePreview;

const sample = 'A sample document.\nEdit me and the preview follows.';
editor.setContent(sample);
preview.setContent(sample);
editor.addEventListener('content-change', (event) => {
  preview.setContent((event as CustomEvent<{ content: string }>).detail.content);
});
