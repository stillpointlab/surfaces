import type { MarkdownEditorPlugin } from '../plugins/types';

// Module-level plugin registry. The host registers plugins (e.g. citations) once
// at page load, before the editor element initializes; the schema, markdown
// parser/serializer, and the view read from here when first built.
const plugins: MarkdownEditorPlugin[] = [];

export function registerEditorPlugin(plugin: MarkdownEditorPlugin): void {
  if (!plugins.some((p) => p.name === plugin.name)) {
    plugins.push(plugin);
  }
}

export function getEditorPlugins(): readonly MarkdownEditorPlugin[] {
  return plugins;
}
