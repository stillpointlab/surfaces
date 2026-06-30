// Browser entry: importing this registers the <code-diff> custom element.
//
// This is the tree-shakeable side-by-side diff surface. It reuses the language
// resolution + logging from the editor but, like <code-preview>, omits CodeMirror's
// `basicSetup`; on top of that it pulls in `@codemirror/merge` for the two-pane diff.
import './code-diff';

export { CodeDiff } from './code-diff';
export type { DiffContents } from './code-diff';
export { findLanguage, loadLanguage } from '../editor/language';
export { setErrorHandler, setReporter } from '../editor/log';
