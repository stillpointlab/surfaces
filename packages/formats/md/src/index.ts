// The root entry: the editor's type, the plugin types and the host's logging
// hooks. It registers no element and loads no engine. `./editor` defines
// <md-editor> and registers plugins, `./preview` defines <md-preview>, and
// `./document` holds the schema, the parser and the serializer.
export type { ProseMirrorEditor } from './editor/prosemirror-editor';
export type { MarkdownEditorPlugin, MarkdownNodeSerializer } from './plugins/types';
export { setErrorHandler, setReporter } from '@stillpointlab/common-format';
