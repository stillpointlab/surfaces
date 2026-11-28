// Browser entry: importing this registers the <code-editor> custom element.
// The editor surface, with the language lookup it uses.
import './code-editor';

export { CodeEditor } from './code-editor';
export { findLanguage, loadLanguage } from './language';
export { setErrorHandler, setReporter } from '@stillpointlab/common-format';
