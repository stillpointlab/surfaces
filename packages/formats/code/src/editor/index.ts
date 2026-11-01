// Browser entry: importing this registers the <code-editor> custom element.
// The editor surface; `.` (the root entry) still exports everything for hosts
// that load the whole package.
import './code-editor';

export { CodeEditor } from './code-editor';
export { findLanguage, loadLanguage } from './language';
export { setErrorHandler, setReporter } from '@stillpointlab/common-format';
