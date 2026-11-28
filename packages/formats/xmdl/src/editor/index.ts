// Browser entry: importing this registers the <xmdl-editor> custom element.
// The editor surface; the parser is the root's and `./parser`'s.
import './xmdl-editor';

export { XmdlEditor } from './xmdl-editor';
export { setErrorHandler, setReporter } from '@stillpointlab/common-format';
