import type MarkdownIt from 'markdown-it';
import type { MarkdownSerializerState, ParseSpec } from 'prosemirror-markdown';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

export type MarkdownNodeSerializer = (
  state: MarkdownSerializerState,
  node: ProseMirrorNode
) => void;

/**
 * Extension point for host-specific features (e.g. citations) so the core editor
 * stays generic. A plugin can add markdown-it parsing, schema nodes, the
 * markdown-it-token → ProseMirror-node parse mapping, the ProseMirror-node →
 * markdown serializer, and run setup once the view is ready.
 */
export interface MarkdownEditorPlugin {
  /** Name (for debugging / dedupe). */
  name: string;
  /** markdown-it plugin: register the inline rule + renderer for custom syntax. */
  markdownItPlugin?: (md: MarkdownIt) => void;
  /** Extra ProseMirror schema nodes, merged into the schema's node map. */
  schemaNodes?: Record<string, NodeSpec>;
  /** markdown-it token type → ProseMirror node parse spec. */
  parserTokens?: Record<string, ParseSpec>;
  /** ProseMirror node name → markdown serializer function. */
  serializerNodes?: Record<string, MarkdownNodeSerializer>;
  /** Called once the editor view is created (e.g. to register custom elements). */
  onReady?: (view: EditorView) => void;
}
