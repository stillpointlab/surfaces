// Injectable preview renderer so the host owns sanitization and markdown plugins
// (e.g. citations). Mirrors the editor/log.ts injection pattern.
//
// The default renders via the package's own markdown-it and is NOT sanitized —
// it exists for the standalone dev playground only. Hosts MUST inject a renderer
// that sanitizes its output before it reaches the DOM (see setPreviewRenderer).

export type PreviewRenderer = (content: string) => Promise<string>;

// Lazily import the markdown entry so markdown-it never lands in the preview
// chunk when a host overrides the renderer (the common case).
const defaultRenderer: PreviewRenderer = async (content) => {
  const { renderMarkdown } = await import('../markdown');
  return renderMarkdown(content);
};

let renderer: PreviewRenderer = defaultRenderer;

/** Override how preview content is turned into HTML (host injects sanitize + plugins). */
export function setPreviewRenderer(fn: PreviewRenderer): void {
  renderer = fn;
}

/** The current renderer (the unsanitized default until a host injects its own). */
export function getPreviewRenderer(): PreviewRenderer {
  return renderer;
}
