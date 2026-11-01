// Browser entry: importing this registers the <xmdl-editor> custom element.
// The editor surface; `.` (the root entry) still exports everything for hosts
// that load the whole package.
import './xmdl-editor';

export { XmdlEditor } from './xmdl-editor';
export { setErrorHandler, setReporter } from '@stillpointlab/common-format';
