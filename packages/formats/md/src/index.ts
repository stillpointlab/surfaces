// Browser entry: importing this registers the <md-editor> custom element.
import './editor/prosemirror-editor';

export { ProseMirrorEditor, buildTableNode } from './editor/prosemirror-editor';
export { registerEditorPlugin, getEditorPlugins } from './editor/registry';
export { setErrorHandler, setReporter } from './editor/log';
export { createSchema, getSchema } from './editor/prosemirror-schema';
export { getMarkdownParser, getMarkdownSerializer } from './editor/prosemirror-markdown';
export type { MarkdownEditorPlugin, MarkdownNodeSerializer } from './plugins/types';
