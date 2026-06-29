// Browser entry: importing this registers the <md-preview> custom element.
//
// This is the tree-shakeable preview surface. It imports markdown rendering and
// the injectable renderer only — never `../editor/*` (ProseMirror) — so pages
// that only preview content don't pay for the full editor.
import './md-preview';

export { MdPreview } from './md-preview';
export { setPreviewRenderer, getPreviewRenderer } from './render';
export type { PreviewRenderer } from './render';
export { setErrorHandler, setReporter } from '../editor/log';
