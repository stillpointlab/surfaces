// The structural contracts a host drives a surface through. A format's elements
// implement these; the host types its element handles with them and never
// depends on a concrete class. They were pinned in Context Manager's
// `src/client/types/components.d.ts` (ADR-0009) and now live with the formats.

/**
 * A read-only preview element: it takes string content and renders it. This is
 * the subset the host drives when it only needs to display content, not edit it.
 */
export interface PreviewElement extends HTMLElement {
  setContent(content: string): void;
}

/** A preview-only element for binary media addressed by URL (`<image-preview>`). */
export interface ImagePreviewElement extends HTMLElement {
  setSource(src: string, alt?: string): void;
}

export type EditorKeymapMode = 'normal' | 'vim';

export type EditorKeymapModeStatus = 'applied' | 'unsupported';

export interface EditorKeymapModeResult {
  requestedMode: EditorKeymapMode;
  activeMode: EditorKeymapMode;
  status: EditorKeymapModeStatus;
  reason?: string;
}

/**
 * An editor element, so a host page can drive any editor interchangeably. Editors
 * expose string content in and out and emit a `content-change` CustomEvent
 * (detail: `{ content: string }`) on every edit; the host listens through the
 * inherited `addEventListener`. Keymap-mode methods are optional: an editor that
 * does not support a requested mode can omit them or return an explicit
 * unsupported result. The editor contract extends the preview one: an editor can
 * do everything a preview can, plus read back and focus.
 */
export interface EditorElement extends PreviewElement {
  getContent(): string;
  focus(): void;
  getSupportedKeymapModes?(): readonly EditorKeymapMode[];
  getKeymapMode?(): EditorKeymapMode;
  setKeymapMode?(mode: EditorKeymapMode): EditorKeymapModeResult | Promise<EditorKeymapModeResult>;
}

/**
 * A read-only side-by-side diff element (`<code-diff>`): it takes two strings
 * (left = base, right = current) and renders a highlighted diff.
 */
export interface DiffElement extends HTMLElement {
  setContents(contents: { left: string; right: string }): void;
}
