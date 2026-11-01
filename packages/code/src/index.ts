// Browser entry: importing this registers the <code-editor> custom element.
import './editor/code-editor';

export { CodeEditor } from './editor/code-editor';
export { findLanguage, loadLanguage } from './editor/language';
export { setErrorHandler, setReporter } from './editor/log';
