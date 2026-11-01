// Browser entry: importing this registers the <md-editor> custom element.
// The editor surface; `.` (the root entry) still exports everything for hosts
// that load the whole package.
import './prosemirror-editor';

export { ProseMirrorEditor, buildTableNode } from './prosemirror-editor';
export { registerEditorPlugin, getEditorPlugins } from './registry';
export { createSchema, getSchema } from './prosemirror-schema';
export { getMarkdownParser, getMarkdownSerializer } from './prosemirror-markdown';
export type { MarkdownEditorPlugin, MarkdownNodeSerializer } from '../plugins/types';
export { setErrorHandler, setReporter } from '@stillpointlab/common-format';
