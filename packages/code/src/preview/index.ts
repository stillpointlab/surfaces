// Browser entry: importing this registers the <code-preview> custom element.
//
// This is the tree-shakeable read-only preview surface. It reuses the language
// resolution + logging from the editor but omits CodeMirror's `basicSetup`, so a
// page that only previews code loads far less than the full <code-editor>.
import './code-preview';

export { CodePreview } from './code-preview';
export { findLanguage, loadLanguage } from '../editor/language';
export { setErrorHandler, setReporter } from '../editor/log';
