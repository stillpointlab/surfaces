// Browser entry: importing this registers the <md-editor> custom element.
// The editor surface. It exports nothing from the engine (the schema, the
// markdown parser and the serializer): the editor imports those on its first
// connect, and a static export here would put them in this entry's chunk. The
// root entry (`.`) exports them, for a host that loads the whole package.
import './prosemirror-editor';

export { ProseMirrorEditor, buildTableNode } from './prosemirror-editor';
export { registerEditorPlugin, getEditorPlugins } from './registry';
export type { MarkdownEditorPlugin, MarkdownNodeSerializer } from '../plugins/types';
export { setErrorHandler, setReporter } from '@stillpointlab/common-format';
