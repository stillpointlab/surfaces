// The root entry: the editor's type and the host's logging hooks. It registers
// no element and loads no CodeMirror. `./editor` defines <code-editor>,
// `./preview` defines <code-preview>, and `./diff` defines <code-diff>.
export type { CodeEditor } from './editor/code-editor';
export { setErrorHandler, setReporter } from '@stillpointlab/common-format';
